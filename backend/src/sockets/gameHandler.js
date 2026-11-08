const db = require('../db')
const { validateBingo } = require('../utils/bingoValidator')
const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const { bot } = require('../bot/index')

const rooms = {}
const JWT_SECRET = process.env.JWT_SECRET
const roomStatusRank = { WAITING: 0, COUNTDOWN: 1, PLAYING: 2, CLAIMING: 3, ENDED: 4 }
const NO_WINNER_GRACE_MS = 5000

function getBallData(number) {
  if (!Number.isFinite(Number(number))) return null

  const value = Number(number)
  let letter = 'B'
  if (value > 15) letter = 'I'
  if (value > 30) letter = 'N'
  if (value > 45) letter = 'G'
  if (value > 60) letter = 'O'

  return { number: value, letter, ball: `${letter}-${value}` }
}

async function getPlayerCount(roomId) {
  const result = await db('room_participants')
    .where({ room_id: roomId })
    .count('* as count')
    .first()
  return Number(result.count)
}

async function emitCurrentRoomState(socket, roomId, room) {
  const playerCount = await getPlayerCount(roomId)
  const calledNumbers = Array.from(room.calledNumbers || [])
  socket.emit('players_updated', { count: playerCount })

  if (calledNumbers.length > 0) {
    const lastBall = room.latestNumber || getBallData(calledNumbers[calledNumbers.length - 1])
    if (lastBall) {
      socket.emit('new_number_called', {
        ...lastBall,
        ball: lastBall.ball || `${lastBall.letter}-${lastBall.number}`,
        calledNumbers,
      })
    }
  }
  return playerCount
}

async function broadcastPlayerCount(io, roomId, room) {
  const count = await getPlayerCount(roomId)
  io.to(roomId).emit('players_updated', { count })
  io.to(roomId).emit('room_update', { players: count, stake: room?.stake })
}

function scheduleRoomReset(io, roomId, room) {
  clearNoWinnerTimer(room)
  room.resetTimeoutId = setTimeout(async () => {
    if (rooms[roomId] !== room || room.status !== 'ENDED') return

    try {
      await db.transaction(async (trx) => {
        await trx('room_card_selections').where({ room_id: roomId }).del()
        await trx('room_participants').where({ room_id: roomId }).del()
        await trx('game_rooms').where({ id: roomId }).update({
          status: 'WAITING',
          called_numbers: JSON.stringify([]),
        })
      })

      if (room.intervalId) clearInterval(room.intervalId)
      room.intervalId = null
      room.status = 'WAITING'
      room.players = {}
      room.calledNumbers.clear()
      room.claimedBy = []
      room.latestNumber = null
      room.endedReason = null
      room.noWinnerExpired = false
      room.pendingClaims = 0

      io.to(roomId).emit('room_reset', {
        roomId,
        stake: room.stake,
      })
    } catch (err) {
      console.error(`[Game] Failed to prepare next room after ${roomId}:`, err)
      return
    }

    try {
      await io.in(roomId).socketsLeave(roomId)
    } catch (err) {
      console.error(`[Game] Failed to remove sockets from reset room ${roomId}:`, err)
    } finally {
      if (room.status === 'WAITING' && rooms[roomId] === room) delete rooms[roomId]
    }
  }, 5000)
}

function clearNoWinnerTimer(room) {
  if (!room?.timers?.noWinner) return
  clearTimeout(room.timers.noWinner)
  room.timers.noWinner = null
}

async function refundRoomParticipants(trx, roomId, stake) {
  const participants = await trx('room_participants')
    .where({ room_id: roomId })
    .forUpdate()
  const refunds = []

  for (const participant of participants) {
    const user = await trx('users')
      .where({ id: participant.user_id })
      .forUpdate()
      .first()
    if (!user) continue

    await trx('users').where({ id: user.id }).increment('wallet_balance', stake)
    const updatedUser = await trx('users').where({ id: user.id }).first()
    await trx('financial_ledger').insert({
      user_id: user.id,
      amount: stake,
      type: 'REFUND',
      reference: roomId,
    })
    refunds.push({ userId: user.id, newBalance: Number(updatedUser.wallet_balance) })
  }

  return refunds
}

function emitRefundWalletUpdates(io, refunds) {
  for (const refund of refunds) {
    const userRoom = `user_${refund.userId}`
    if (io.sockets.adapter.rooms.get(userRoom)?.size) {
      io.to(userRoom).emit('wallet_updated', { newBalance: refund.newBalance })
    }
  }
}

function emitNoWinnerGameOver(io, roomId, room) {
  const payload = {
    reason: room.endedReason || 'no_winner',
    balls_called: room.endedReason === 'round_interrupted' ? room.calledNumbers.size : 75,
    winners: [],
  }
  if (!room.gameOverEmitted) {
    io.to(roomId).emit('game_over', payload)
    room.gameOverEmitted = true
  }
  return payload
}

async function handleNoWinner(io, roomId, room) {
  if (
    rooms[roomId] !== room ||
    room.status !== 'PLAYING' ||
    !room.noWinnerExpired ||
    room.pendingClaims > 0 ||
    room.noWinnerSettling
  ) return

  room.noWinnerSettling = true
  try {
    const settlement = await db.transaction(async (trx) => {
      const persistedRoom = await trx('game_rooms')
        .where({ id: roomId })
        .forUpdate()
        .first()
      if (!persistedRoom || persistedRoom.status !== 'PLAYING') return null

      const refunds = await refundRoomParticipants(trx, roomId, room.stake)
      await trx('game_rooms').where({ id: roomId }).update({
        status: 'ENDED',
        winning_pattern: 'none',
        called_numbers: JSON.stringify(Array.from(room.calledNumbers)),
      })
      return refunds
    })

    if (!settlement) {
      room.noWinnerSettling = false
      clearNoWinnerTimer(room)
      return
    }

    room.status = 'ENDED'
    room.endedReason = 'no_winner'
    room.noWinnerSettling = false
    clearNoWinnerTimer(room)
    emitNoWinnerGameOver(io, roomId, room)
    io.to(roomId).emit('game_ended_for_spectators')
    emitRefundWalletUpdates(io, settlement)
    scheduleRoomReset(io, roomId, room)
  } catch (err) {
    room.noWinnerSettling = false
    console.error(`[Game] Failed to refund no-winner room ${roomId}:`, err)
    room.timers.noWinner = setTimeout(() => {
      handleNoWinner(io, roomId, room).catch((retryErr) => {
        console.error(`[Game] No-winner refund retry failed for room ${roomId}:`, retryErr)
      })
    }, 1000)
  }
}

async function recoverInterruptedRoom(io, roomId, room) {
  const refunds = await db.transaction(async (trx) => {
    const persistedRoom = await trx('game_rooms')
      .where({ id: roomId })
      .forUpdate()
      .first()
    if (!persistedRoom || !['PLAYING', 'CLAIMING'].includes(persistedRoom.status)) return null

    const roomRefunds = await refundRoomParticipants(trx, roomId, room.stake)
    await trx('game_rooms').where({ id: roomId }).update({
      status: 'ENDED',
      winning_pattern: 'interrupted',
    })
    return roomRefunds
  })

  if (!refunds) return

  room.status = 'ENDED'
  room.endedReason = 'round_interrupted'
  room.timers.noWinner = null
  emitNoWinnerGameOver(io, roomId, room)
  io.to(roomId).emit('game_ended_for_spectators')
  emitRefundWalletUpdates(io, refunds)
  scheduleRoomReset(io, roomId, room)
}

function scheduleNoWinner(io, roomId, room) {
  room.timers ||= {}
  clearNoWinnerTimer(room)
  room.noWinnerExpired = false
  room.noWinnerSettling = false
  room.pendingClaims ||= 0
  room.timers.noWinner = setTimeout(() => {
    room.noWinnerExpired = true
    handleNoWinner(io, roomId, room).catch((err) => {
      console.error(`[Game] No-winner settlement failed for room ${roomId}:`, err)
    })
  }, NO_WINNER_GRACE_MS)
}

async function startCountdown(io, roomId) {
  const room = rooms[roomId]
  if (!room || room.status !== 'WAITING') return
  if (room.intervalId) {
    clearInterval(room.intervalId)
    room.intervalId = null
  }
  room.status = 'COUNTDOWN'
  console.log(`[Game] Starting countdown for ${roomId}`)

  try {
    await db('game_rooms').where({ id: roomId }).update({
      status: 'COUNTDOWN',
      winning_pattern: null,
    })
  } catch (err) {
    console.error('[Game] Failed to update countdown status:', err)
    room.status = 'WAITING'
    io.to(roomId).emit('game_aborted', { message: 'Server error. Game cancelled.' })
    return
  }

  let timeLeft = 30
  io.to(roomId).emit('countdown_tick', { timeLeft })

  const countdownInterval = setInterval(async () => {
    timeLeft -= 1
    io.to(roomId).emit('countdown_tick', { timeLeft })

    if (timeLeft <= 0) {
      clearInterval(countdownInterval)
      try {
        const settlement = await db.transaction(async (trx) => {
          const participants = await trx('room_participants')
            .where({ room_id: roomId })
            .forUpdate()

          if (participants.length < 2) {
            return {
              success: false,
              error: 'NOT_ENOUGH_PLAYERS',
              poorPlayers: [],
              cardlessPlayers: [],
            }
          }

          const validPlayers = []
          const poorPlayers = []
          const cardlessPlayers = []

          for (const participant of participants) {
            const cardSelection = await trx('room_card_selections')
              .where({ room_id: roomId, user_id: participant.user_id })
              .first()
            if (!cardSelection) {
              cardlessPlayers.push(participant)
              await trx('room_participants')
                .where({ room_id: roomId, user_id: participant.user_id })
                .del()
              continue
            }

            const user = await trx('users')
              .where({ id: participant.user_id })
              .forUpdate()
              .first()

            if (user && Number(user.wallet_balance) >= room.stake) {
              validPlayers.push({ participant, user })
            } else {
              poorPlayers.push(participant)
            }
          }

          if (validPlayers.length + poorPlayers.length < 2) {
            return { success: false, error: 'NOT_ENOUGH_PLAYERS', poorPlayers, cardlessPlayers }
          }

          for (const poorPlayer of poorPlayers) {
            await trx('room_participants')
              .where({ room_id: roomId, user_id: poorPlayer.user_id })
              .del()
            await trx('room_card_selections')
              .where({ room_id: roomId, user_id: poorPlayer.user_id })
              .del()
          }

          for (const cardlessPlayer of cardlessPlayers) {
            await trx('room_card_selections')
              .where({ room_id: roomId, user_id: cardlessPlayer.user_id })
              .del()
          }

          if (validPlayers.length < 2) {
            return { success: false, error: 'NOT_ENOUGH_VALID_PLAYERS', poorPlayers, cardlessPlayers }
          }

          for (const validPlayer of validPlayers) {
            await trx('users').where({ id: validPlayer.user.id }).decrement('wallet_balance', room.stake)
            await trx('financial_ledger').insert({
              user_id: validPlayer.user.id,
              amount: -room.stake,
              type: 'ENTRY_FEE'
            })
          }
          await trx('game_rooms').where({ id: roomId }).update({ status: 'PLAYING' })

          return { success: true, validPlayerCount: validPlayers.length, poorPlayers, cardlessPlayers }
        })

        for (const cardlessPlayer of settlement.cardlessPlayers) {
          const playerSocketId = Object.keys(room.players).find((id) => (
            String(room.players[id].userId) === String(cardlessPlayer.user_id)
          ))
          if (playerSocketId) {
            io.to(playerSocketId).emit('game_aborted', {
              message: 'Your card was not assigned. Please select a card for the next round.'
            })
            try {
              await io.in(playerSocketId).socketsLeave(roomId)
            } catch (err) {
              console.error('[Game] Failed to remove player without a card:', err)
            }
            delete room.players[playerSocketId]
          }
        }

        for (const poorPlayer of settlement.poorPlayers) {
          const playerSocketId = Object.keys(room.players).find((id) => (
            String(room.players[id].userId) === String(poorPlayer.user_id)
          ))
          if (playerSocketId) {
            io.to(playerSocketId).emit('insufficient_funds', {
              message: 'You do not have enough balance. Please deposit funds.'
            })
            try {
              await io.in(playerSocketId).socketsLeave(roomId)
            } catch (err) {
              console.error('[Game] Failed to remove underfunded socket:', err)
            }
            delete room.players[playerSocketId]
          }
        }

        await broadcastPlayerCount(io, roomId, room)

        if (!settlement.success) {
          room.status = 'WAITING'
          await db('game_rooms').where({ id: roomId }).update({ status: 'WAITING' })
          const message = settlement.error === 'NOT_ENOUGH_PLAYERS'
            ? 'Not enough players. Game cancelled.'
            : 'Not enough players with sufficient balance. Game cancelled.'
          io.to(roomId).emit('countdown_tick', { timeLeft: null })
          io.to(roomId).emit('game_aborted', { message })
          return
        }

        room.status = 'PLAYING'
        io.to(roomId).emit('game_started')
        console.log(`[Game] All valid players paid. Starting game for room ${roomId}`)

        if (room.intervalId) clearInterval(room.intervalId)

        room.intervalId = setInterval(async () => {
          if (room.status !== 'PLAYING') {
            clearInterval(room.intervalId)
            room.intervalId = null
            return
          }

          let number
          do {
            number = Math.floor(Math.random() * 75) + 1
          } while (room.calledNumbers.has(number))

          room.calledNumbers.add(number)
          db('game_rooms')
            .where({ id: roomId })
            .update({ called_numbers: JSON.stringify(Array.from(room.calledNumbers)) })
            .catch((err) => console.error('[DRAW DB SAVE ERROR]', err))

          let letter = 'B'
          if (number > 15) letter = 'I'
          if (number > 30) letter = 'N'
          if (number > 45) letter = 'G'
          if (number > 60) letter = 'O'

          room.latestNumber = { number, letter }
          console.log(`[Game] Calling number: ${letter} ${number}`)
          io.to(roomId).emit('new_number_called', {
            number,
            letter,
            ball: `${letter}-${number}`,
            calledNumbers: Array.from(room.calledNumbers),
          })

          if (room.calledNumbers.size === 75) {
            clearInterval(room.intervalId)
            room.intervalId = null
            room.status = 'ENDED'
            await db('game_rooms').where({ id: roomId }).update({ status: 'ENDED' })
            io.to(roomId).emit('game_ended_for_spectators')
            scheduleRoomReset(io, roomId, room)
          }
        }, 3000)
      } catch (err) {
        console.error('[Game] Error during countdown end:', err)
        room.status = 'WAITING'
        await db('game_rooms').where({ id: roomId }).update({ status: 'WAITING' }).catch(() => {})
        io.to(roomId).emit('countdown_tick', { timeLeft: null })
        io.to(roomId).emit('game_aborted', { message: 'Server error. Game cancelled.' })
      }
    }
  }, 1000)
}

function initGameHandler(io) {
  io.on('connection', (socket) => {
    if (socket.data.userId) {
      socket.join(`user_${socket.data.userId}`)
    }

    socket.on('join_room', async ({ roomId, stake, spectator }) => {
      try {
        const user = await db('users').where({ id: socket.data.userId }).first()
        if (!user) return socket.emit('error', { message: 'User not found' })

        const persistedRoom = await db('game_rooms').where({ id: roomId }).first()
        if (!persistedRoom) return socket.emit('error', { message: 'Room not found' })
        socket.join(roomId)

        const participant = await db('room_participants')
          .where({ room_id: roomId, user_id: user.id })
          .first()
        const cardSelection = participant
          ? await db('room_card_selections')
            .where({ room_id: roomId, user_id: user.id })
            .first()
          : null

        if (spectator && persistedRoom.status === 'WAITING' && (!participant || !cardSelection)) {
          socket.emit('next_game_ready', {
            roomId,
            stake: persistedRoom.stake_amount,
          })
          return
        }

        if (persistedRoom.status !== 'WAITING') {
          if (!rooms[roomId]) {
            let calledNumbers = persistedRoom.called_numbers || []
            if (typeof calledNumbers === 'string') calledNumbers = JSON.parse(calledNumbers)
            rooms[roomId] = {
              id: roomId,
              stake: Number(persistedRoom.stake_amount) || Number(stake) || 10,
              status: persistedRoom.status,
              players: {},
              calledNumbers: new Set(Array.isArray(calledNumbers) ? calledNumbers : []),
              latestNumber: Array.isArray(calledNumbers) && calledNumbers.length > 0
                ? getBallData(calledNumbers[calledNumbers.length - 1])
                : null,
              intervalId: null
            }
          } else if ((roomStatusRank[persistedRoom.status] ?? -1) >= (roomStatusRank[rooms[roomId].status] ?? -1)) {
            rooms[roomId].status = persistedRoom.status
          }
        }

        if (persistedRoom.status === 'ENDED') {
          const playerCount = await emitCurrentRoomState(socket, roomId, rooms[roomId])
          return socket.emit('game_in_progress', {
            message: 'This game has ended. Please wait for the next round.',
            status: persistedRoom.status,
            players: playerCount,
            calledNumbers: [],
            currentBall: null
          })
        }

        // Reconnecting during an active round never restores player status.
        if (['PLAYING', 'CLAIMING', 'COUNTDOWN'].includes(persistedRoom.status)) {
          const room = rooms[roomId]
          const playerCount = await emitCurrentRoomState(socket, roomId, room)
          socket.emit('game_in_progress', {
            message: 'A game is in progress. Please wait for the next round.',
            currentBall: room.latestNumber || null,
            calledNumbers: Array.from(room.calledNumbers),
            players: playerCount,
            status: room.status
          })
          return
        }

        if (!participant || !cardSelection) {
          return socket.emit('error', { message: 'Join the room before playing.' })
        }

        // 2. ADD PLAYER
        if (!rooms[roomId]) {
          rooms[roomId] = {
            id: roomId,
            stake: Number(stake) || 10,
            status: 'WAITING',
            players: {},
            calledNumbers: new Set(),
            latestNumber: null,
            intervalId: null
          }
        }

        rooms[roomId].players[socket.id] = { socketId: socket.id, userId: user.id }
        const playerCards = await db('room_card_selections')
          .where({ room_id: roomId, user_id: user.id })
        socket.emit('my_cards', {
          cards: playerCards.map((selection) => ({
            id: selection.card_id,
            matrix: typeof selection.card === 'string' ? JSON.parse(selection.card) : selection.card,
          })),
        })

        const playerCount = await getPlayerCount(roomId)
        await emitCurrentRoomState(socket, roomId, rooms[roomId])
        console.log(`[Game] Player ${user.id} joined. Total players: ${playerCount}`)

        io.to(roomId).emit('players_updated', { count: playerCount })
        io.to(roomId).emit('room_update', { players: playerCount, stake: rooms[roomId].stake })

        // 3. AUTO-START
        if (rooms[roomId].status === 'WAITING' && playerCount >= 2) {
          setTimeout(() => {
            const activeRoom = rooms[roomId]
            const activePlayerCount = activeRoom
              ? new Set(Object.values(activeRoom.players).map((player) => String(player.userId))).size
              : 0
            if (activeRoom && activeRoom.status === 'WAITING' && activePlayerCount >= 2) {
              startCountdown(io, roomId)
            }
          }, 2000)
        }
      } catch (err) {
        console.error('[Game] Join room error:', err)
        socket.emit('error', { message: 'Server error' })
      }
    })
    socket.on('join_as_spectator', async ({ roomId }) => {
      try {
        const room = rooms[roomId]
        if (!room) return

        socket.join(roomId)
        console.log(`[Spectator] User ${socket.data.userId} is watching room ${roomId}`)
        await emitCurrentRoomState(socket, roomId, room)

        socket.emit('spectator_sync', {
          calledNumbers: Array.from(room.calledNumbers),
          currentBall: room.latestNumber || null,
          status: room.status,
          players: Object.keys(room.players).length
        })
      } catch (err) {
        console.error('Spectator join error:', err)
      }
    })
    socket.on('leave_room', async ({ roomId }) => {
  try {
    const room = rooms[roomId]
    
    // Only refund if the game hasn't started
    if (room && (room.status === 'WAITING' || room.status === 'COUNTDOWN')) {
      const user = await db('users').where({ id: socket.data.userId }).first()

      if (user) {
        const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first()
        
        if (participant) {
          await db.transaction(async (trx) => {
            await trx('room_participants').where({ room_id: roomId, user_id: user.id }).del()
            await trx('room_card_selections').where({ room_id: roomId, user_id: user.id }).del()
          })
          console.log(`[Game] Removed unpaid participant ${user.id} from room ${roomId}.`)
        }
      }
    }
    
    // Clean up memory
    if (room && room.players && room.players[socket.id]) {
      delete room.players[socket.id]
      if (room.readyPlayers) room.readyPlayers.delete(socket.id)
      
      await broadcastPlayerCount(io, roomId, room)
    }
    socket.leave(roomId)
  } catch (err) {
    console.error('[Game] leave_room error:', err)
  }
})
    socket.on('claim_bingo', async ({ roomId, cardId, markedNumbers } = {}) => {
  if (!Array.isArray(markedNumbers) || markedNumbers.length === 0) {
    return socket.emit('bingo_invalid', { message: 'You must mark numbers before claiming Bingo.' })
  }

  const room = rooms[roomId];
  if (!room) return;
  const userId = socket.data.userId;

  console.log(`[Claim] Received claim from user ${userId} for card ${cardId}. Status: ${room.status}`);

  // 1. Prevent claiming if game is not playing or is already ending
  if (room.status !== 'PLAYING') {
    return socket.emit('bingo_result', { success: false, message: 'The game is not currently active.' });
  }

  // 2. Prevent the same user from claiming twice
  if (!room.claimedBy) room.claimedBy = [];
  if (!Array.isArray(room.claimedBy)) room.claimedBy = [];
  if (room.claimedBy.includes(userId)) {
    return socket.emit('bingo_result', { success: false, message: 'You have already claimed Bingo!' });
  }

  try {
    // 3. Fetch the user's card from the database
    const user = await db('users').where({ id: userId }).first();
    const connectedPlayer = room.players[socket.id]
    if (!user || !connectedPlayer || String(connectedPlayer.userId) !== String(user.id)) {
      return socket.emit('bingo_result', { success: false, message: 'Only players in this game can claim Bingo.' });
    }

    const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first();
    if (!participant) {
      return socket.emit('bingo_result', { success: false, message: 'Only players in this game can claim Bingo.' });
    }

    const selection = await db('room_card_selections').where({ room_id: roomId, user_id: user.id, card_id: cardId }).first();
    
    if (!selection) {
      return socket.emit('bingo_result', { success: false, message: 'Card not found.' });
    }

    const cardMatrix = typeof selection.card === 'string' ? JSON.parse(selection.card) : selection.card;

    // Validate manual marks against the server's called numbers and the selected card.
    const calledNumbers = Array.from(room.calledNumbers)
    const result = validateBingo(cardMatrix, calledNumbers, markedNumbers);

    if (!result.isValid) {
      console.log(`[Claim] Invalid Bingo for user ${userId}. Reason: Not a valid pattern.`);
      return socket.emit('bingo_result', { success: false, message: 'Not a valid Bingo. Keep playing!' });
    }

    // 5. Valid Bingo! Lock the room
    const transitioned = await db('game_rooms')
      .where({ id: roomId, status: 'PLAYING' })
      .update({ status: 'CLAIMING' })
    if (!transitioned) {
      return socket.emit('bingo_result', { success: false, message: 'The game is not currently active.' });
    }

    room.claimedBy.push(userId);
    room.status = 'CLAIMING';
    
    // Stop calling numbers
    if (room.intervalId) {
      clearInterval(room.intervalId);
      room.intervalId = null;
    }

    console.log(`[Claim] Valid Bingo by user ${userId}. Starting 3-second window.`);
    
    // 6. Start the 3-second claim window (allows others to tie)
    setTimeout(async () => {
      try {
        console.log(`[Claim] Window closed. Processing payouts for room ${roomId}...`);
        
        let winnerName = 'A Player';
        const winnerCount = room.claimedBy.length;
        const participants = await db('room_participants').where({ room_id: roomId });
        const totalPlayers = participants.length;
        
        if (totalPlayers === 0) throw new Error('No players in room');
        const totalPool = room.stake * totalPlayers;
        const platformFee = totalPool * 0.15;
        const netWinnerPool = totalPool - platformFee;
        const payoutPerWinner = Math.floor((netWinnerPool / winnerCount) * 100) / 100;

        console.log(`[PAYOUT] Pool: ${totalPool}, Fee: ${platformFee}, Payout: ${payoutPerWinner}`);

        // Process payouts in DB
        const referralBalanceUpdatesCents = new Map()
        await db.transaction(async (trx) => {
          const referredWinners = []
          for (const winnerId of room.claimedBy) {
            let winnerUser = await trx('users')
              .select('id', 'first_name', 'username', 'referred_by')
              .where({ id: winnerId })
              .first();
            if (!winnerUser) {
              winnerUser = await trx('users')
                .select('id', 'first_name', 'username', 'referred_by')
                .where({ telegram_id: winnerId })
                .first();
            }
            if (!winnerUser) continue;
            if (winnerName === 'A Player') winnerName = winnerUser.first_name || winnerUser.username || 'A Player';

            await trx('room_participants')
              .where({ room_id: roomId, user_id: winnerUser.id })
              .update({ is_winner: true });
            await trx('users').where({ id: winnerUser.id }).increment('wallet_balance', payoutPerWinner);
            await trx('financial_ledger').insert({
              user_id: winnerUser.id,
              amount: payoutPerWinner,
              type: 'WINNING_PAYOUT'
            });
            console.log(`[PAYOUT] Credited ${payoutPerWinner} to winner ${winnerUser.id}`);
            if (winnerUser.referred_by && winnerUser.referred_by !== winnerUser.id) {
              referredWinners.push({
                inviteeId: winnerUser.id,
                inviterId: winnerUser.referred_by,
              })
            }
          }

          if (referredWinners.length > 0) {
            const totalCommissionCents = Math.round(totalPool * 0.05 * 100)
            const baseCommissionCents = Math.floor(totalCommissionCents / referredWinners.length)
            const remainderCents = totalCommissionCents % referredWinners.length

            for (const [index, referredWinner] of referredWinners.entries()) {
              const commissionCents = baseCommissionCents + (index < remainderCents ? 1 : 0)
              if (commissionCents <= 0) continue
              const commission = commissionCents / 100
              const inviter = await trx('users')
                .select('id', 'referral_balance')
                .where({ id: referredWinner.inviterId })
                .first()
              if (!inviter) continue

              await trx('users')
                .where({ id: inviter.id })
                .increment('referral_balance', commission)
              const priorBalance = referralBalanceUpdatesCents.has(inviter.id)
                ? referralBalanceUpdatesCents.get(inviter.id)
                : Math.round(Number(inviter.referral_balance || 0) * 100)
              referralBalanceUpdatesCents.set(inviter.id, priorBalance + commissionCents)
              await trx('referral_earnings').insert({
                inviter_id: inviter.id,
                invitee_id: referredWinner.inviteeId,
                room_id: roomId,
                game_id: roomId,
                amount: commission,
              })
              await trx('financial_ledger').insert({
                user_id: inviter.id,
                amount: commission,
                type: 'referral_commission',
                reference: `Referral commission for room ${roomId}`,
              })
            }
          }
          await trx('game_rooms').where({ id: roomId }).update({ status: 'ENDED' });
        });

        for (const [inviterId, referralBalanceCents] of referralBalanceUpdatesCents) {
          io.to(`user_${inviterId}`).emit('wallet_updated', {
            referralBalance: referralBalanceCents / 100,
          })
        }

        // Emit game over to everyone
        room.status = 'ENDED';
        io.to(roomId).emit('game_over', { 
          winnerIds: room.claimedBy, 
          payout: payoutPerWinner,
          winnerName: winnerName
        });
        io.to(roomId).emit('game_ended_for_spectators');

        scheduleRoomReset(io, roomId, room)

      } catch (err) {
        console.error('[Claim] Payout Error:', err);
        room.status = 'ENDED';
        await db('game_rooms').where({ id: roomId }).update({ status: 'ENDED' }).catch(() => {});
        io.to(roomId).emit('game_over', { winnerIds: room.claimedBy, payout: 0, winnerName: 'Error' });
        io.to(roomId).emit('game_ended_for_spectators');
        scheduleRoomReset(io, roomId, room)
      }
    }, 3000);

  } catch (err) {
    console.error('[Claim] Validation Error:', err);
    socket.emit('bingo_result', { success: false, message: 'Server error during validation.' });
  }
});

    socket.on('get_my_cards', async ({ roomId } = {}) => {
      try {
        const uid = socket.data.userId
        const persistedRoom = await db('game_rooms').where({ id: roomId }).first()
        const isRejoiningActiveGame =
          persistedRoom &&
          ['COUNTDOWN', 'PLAYING', 'CLAIMING'].includes(persistedRoom.status) &&
          !rooms[roomId]?.players?.[socket.id]
        if (isRejoiningActiveGame) {
          socket.emit('my_cards', { cards: [] })
          return
        }
        const participant = uid
          ? await db('room_participants').where({ room_id: roomId, user_id: uid }).first()
          : null
        if (!participant) {
          socket.emit('my_cards', { cards: [] })
          return
        }

        const selections = await db('room_card_selections').where({ room_id: roomId, user_id: uid })
        const cards = selections.map((sel) => ({
          id: sel.card_id,
          matrix: typeof sel.card === 'string' ? JSON.parse(sel.card) : sel.card,
        }))
        socket.emit('my_cards', { cards })
      } catch (err) {
        console.error('get_my_cards error:', err)
      }
    })

    socket.on('disconnect', async () => {
  try {
    // Loop through all rooms to find which one this socket was in
    for (const roomId in rooms) {
      const room = rooms[roomId]
      
      // If this socket is in the room's player list
      if (room.players && room.players[socket.id]) {
        const userId = socket.data.userId
        
        // Only refund if the game hasn't started
        if (room.status === 'WAITING' || room.status === 'COUNTDOWN') {
          if (userId) {
            const participant = await db('room_participants').where({ room_id: roomId, user_id: userId }).first()
            
            if (participant) {
              await db.transaction(async (trx) => {
                await trx('room_participants').where({ room_id: roomId, user_id: userId }).del()
                await trx('room_card_selections').where({ room_id: roomId, user_id: userId }).del()
              })
              console.log(`[Game] Removed unpaid participant ${userId} from room ${roomId} after disconnect.`)
            }
          }
        }
        
        // Clean up memory
        delete room.players[socket.id]
        if (room.readyPlayers) room.readyPlayers.delete(userId)
        
        await broadcastPlayerCount(io, roomId, room)
      }
    }
  } catch (err) {
    console.error('[Game] disconnect error:', err)
  }
})
  })
}

function setupSocket(server) {
  const io = new Server(server, {
    cors: { origin: true, methods: ['GET', 'POST'], credentials: true },
  })
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    try {
      if (!token) throw new Error('Missing socket token')
      const payload = jwt.verify(token, JWT_SECRET)
      if (!payload.id) throw new Error('Socket token has no user ID')
      socket.data.userId = payload.id
      socket.data.user = payload
      return next()
    } catch (err) {
      console.warn('[Socket] Rejecting connection with invalid auth token:', err.message)
      socket.disconnect(true)
      return next(new Error('Unauthorized'))
    }
  })
  initGameHandler(io)
  return io
}

module.exports = { initGameHandler, setupSocket, rooms }
