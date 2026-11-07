const express = require('express')
const router = express.Router()
const db = require('../db')
const { generateSingleCard, generateCardFromNumber } = require('../utils/cardGenerator')
const { userAuth } = require('../../middleware/auth')
const MAX_ROOM_PLAYERS = 10

// GET /api/rooms (list waiting rooms)
router.get('/', async (req, res) => {
  try {
    const rooms = await db('game_rooms').where({ status: 'WAITING' })
    res.json({ rooms })
  } catch (err) {
    res.status(500).json({ error: 'Failed' })
  }
})

// GET /api/rooms/active-cards?stake=X — returns cards reserved in active rooms for this stake
router.get('/active-cards', async (req, res) => {
  try {
    const stake = Number(req.query.stake)
    if (!stake) {
      return res.status(400).json({ error: 'stake is required' })
    }
    const rooms = await db('game_rooms')
      .where({ stake_amount: stake })
      .whereIn('status', ['WAITING', 'COUNTDOWN', 'PLAYING', 'CLAIMING'])
    const roomIds = rooms.map((r) => r.id)
    if (roomIds.length === 0) {
      return res.json({ takenCards: [] })
    }
    const taken = await db('room_card_selections')
      .whereIn('room_id', roomIds)
      .select('card_id')
    res.json({ takenCards: [...new Set(taken.map((t) => Number(t.card_id)))] })
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active cards' })
  }
})

router.post('/join', userAuth, async (req, res) => {
  try {
    // 1. DEFINE VARIABLES
    const stake = Number(req.body.stake || req.body.level);
    const userId = req.user.id;
    const cardNumber = Number(req.body.card_number);

    console.log('[join] Request received for stake:', stake, 'userId:', userId, 'cardNumber:', cardNumber);

    // 2. FIND USER
    const user = await db('users').where({ id: userId }).first()
    console.log('[join] User found:', user ? user.id : 'NOT FOUND')
    if (!user) return res.status(404).json({ error: 'User not found' })

    // 3. START TRANSACTION
    const result = await db.transaction(async (trx) => {
      console.log('[join] Transaction started')
      await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`game_rooms:${stake}`])

      const activeRoom = await trx('game_rooms')
        .where({ stake_amount: stake })
        .whereIn('status', ['COUNTDOWN', 'PLAYING', 'CLAIMING'])
        .orderBy('created_at', 'desc')
        .forUpdate()
        .first()

      let room = null
      let existing = null

      if (req.body.roomId) {
        room = await trx('game_rooms')
          .where({ id: req.body.roomId })
          .forUpdate()
          .first()
        if (!room) throw new Error('ROOM_NOT_FOUND')

        existing = await trx('room_participants')
          .where({ room_id: room.id, user_id: user.id })
          .first()
        if (!existing) throw new Error('NOT_ROOM_PARTICIPANT')
        if (!['WAITING', 'COUNTDOWN'].includes(room.status)) {
          throw new Error('CARD_CHANGE_LOCKED')
        }
      } else if (activeRoom) {
        existing = await trx('room_participants')
          .where({ room_id: activeRoom.id, user_id: user.id })
          .first()
        if (existing && activeRoom.status === 'COUNTDOWN') {
          room = activeRoom
        } else if (existing) {
          throw new Error('CARD_CHANGE_LOCKED')
        } else {
          return { status: 'spectator', room: activeRoom }
        }
      }

      if (!room) {
        // 4. FIND OR CREATE ROOM
        const waitingRooms = await trx('game_rooms')
          .where({ stake_amount: stake, status: 'WAITING' })
          .orderBy('created_at')
          .forUpdate()
        for (const waitingRoom of waitingRooms) {
          const existingParticipant = await trx('room_participants')
            .where({ room_id: waitingRoom.id, user_id: user.id })
            .first()
          if (existingParticipant) {
            room = waitingRoom
            existing = existingParticipant
            break
          }

          const participantCount = await trx('room_participants')
            .where({ room_id: waitingRoom.id })
            .count('* as count')
            .first()
          if (Number(participantCount.count) < MAX_ROOM_PLAYERS) {
            room = waitingRoom
            break
          }
        }

        console.log('[join] Room found/created:', room ? room.id : 'Creating new room')

        if (!room) {
          const [newRoom] = await trx('game_rooms').insert({
            stake_amount: stake,
            status: 'WAITING',
            called_numbers: JSON.stringify([])
          }).returning('*')
          room = newRoom
          console.log('[join] New room created:', room.id)
        }
      }

      // 5. CHECK IF ALREADY IN ROOM
      if (!existing) {
        await trx('room_participants').insert({ room_id: room.id, user_id: user.id, is_winner: false })
        console.log(`[JOIN] Added user ${user.id} to room ${room.id}.`)
      } else {
        console.log(`[JOIN] User ${user.id} was already in room. Join skipped.`)
      }

      // 6. ENSURE USER HAS A CARD (use user-selected card_number)
      if (!cardNumber || cardNumber < 1 || cardNumber > 400) {
        throw new Error('INVALID_CARD_NUMBER');
      }

      // Check if this card is already taken in the room
      const existingCard = await trx('room_card_selections')
        .where({ room_id: room.id, card_id: cardNumber })
        .whereNot({ user_id: user.id })
        .first();
      if (existingCard) {
        throw new Error('CARD_ALREADY_TAKEN');
      }

      let cardSelection = await trx('room_card_selections')
        .where({ room_id: room.id, user_id: user.id })
        .first();
      const matrix = generateCardFromNumber(cardNumber);
      if (cardSelection) {
        const [updated] = await trx('room_card_selections')
          .where({ room_id: room.id, user_id: user.id })
          .update({
            card_id: cardNumber,
            card: JSON.stringify(matrix),
            status: 'reserved',
          })
          .returning('*');
        cardSelection = updated;
        console.log(`[JOIN] Updated card to ${cardNumber} for user ${user.id}.`);
      } else {
        const [inserted] = await trx('room_card_selections').insert({
          room_id: room.id,
          card_id: cardNumber,
          user_id: user.id,
          card: JSON.stringify(matrix),
          status: 'reserved',
        }).returning('*');
        cardSelection = inserted;
        console.log(`[JOIN] Assigned card ${cardNumber} to user ${user.id}.`);
      }

      console.log('[join] Transaction successful')
      return {
         room,
         card: {
           id: cardSelection.card_id,
           matrix: typeof cardSelection.card === 'string' ? JSON.parse(cardSelection.card) : cardSelection.card,
         },
       }
    })

    if (result.status === 'spectator') {
       const io = req.app.get('io')
       if (io) {
         await io.in(`user_${user.id}`).socketsJoin(result.room.id)
       }
       return res.json({
         status: 'spectator',
         roomId: result.room.id,
         stake: result.room.stake_amount,
         message: 'Game already in progress',
       })
    }

    console.log('[join] Sending response:', result.room.id)
    return res.json({ roomId: result.room.id, stake: result.room.stake_amount, card: result.card })

  } catch (err) {
    console.error('[join] CATCH ERROR:', err.message)
    if (err.message === 'INVALID_CARD_NUMBER') {
      return res.status(400).json({ error: 'Invalid card number. Choose a card between 1 and 400.' })
    }
    if (err.message === 'CARD_ALREADY_TAKEN') {
      return res.status(400).json({ error: 'Card already taken' })
    }
    if (err.message === 'CARD_CHANGE_LOCKED') {
      return res.status(400).json({ error: 'Game has already started. Cannot change card.' })
    }
    if (err.message === 'ROOM_NOT_FOUND') {
      return res.status(404).json({ error: 'Room not found' })
    }
    if (err.message === 'NOT_ROOM_PARTICIPANT') {
      return res.status(403).json({ error: 'Join the room before changing your card.' })
    }
    res.status(500).json({ error: 'JOIN_FAILED', message: err.message })
  }
})

// GET /api/rooms/:roomId/cards
router.get('/:roomId/cards', userAuth, async (req, res) => {
  try {
    const { roomId } = req.params
    const userId = req.user.id

    const user = await db('users').where({ id: userId }).first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const room = await db('game_rooms').where({ id: roomId }).first()
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (!['WAITING', 'COUNTDOWN'].includes(room.status)) {
      return res.status(409).json({ error: 'Game in progress. Please wait for the next round.' })
    }

    const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first()
    if (!participant) return res.status(403).json({ error: 'Join the room before selecting cards.' })

    const cards = []
    for (let i = 1; i <= 400; i++) {
      cards.push({
        id: i,
        card_number: i,
        taken: false,
        matrix: generateSingleCard(),
      })
    }
    return res.json(cards)
  } catch (err) {
    console.error('[cards] Failed to generate room cards:', err)
    return res.status(500).json({ error: 'Failed to load cards' })
  }
})

// POST /api/rooms/:id/cards/:cardId
router.post('/:id/cards/:cardId', userAuth, async (req, res) => {
  try {
    const { id: roomId, cardId } = req.params
    const userId = req.user.id

    const user = await db('users').where({ id: userId }).first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const room = await db('game_rooms').where({ id: roomId }).first()
    if (!room) return res.status(404).json({ error: 'Room not found' })
    if (!['WAITING', 'COUNTDOWN'].includes(room.status)) {
      return res.status(409).json({ error: 'Game in progress. Please wait for the next round.' })
    }
    const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first()
    if (!participant) return res.status(403).json({ error: 'Join the room before selecting cards.' })

    const matrix = generateSingleCard()

    await db('room_card_selections').insert({
      room_id: roomId,
      card_id: parseInt(cardId),
      user_id: user.id,
      card: JSON.stringify(matrix),
      status: 'reserved'
    })

    res.json({ success: true, cardId, matrix })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to save card' })
  }
})

// POST /api/rooms/:id/select-cards
router.post('/:id/select-cards', userAuth, async (req, res) => {
  try {
    const roomId = req.params.id
    const { cardIds } = req.body || {}
    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      return res.status(400).json({ error: 'cardIds are required' })
    }

    const selectedCardIds = cardIds.map(Number)
    if (selectedCardIds.some((cardId) => !Number.isInteger(cardId) || cardId < 1 || cardId > 400)
      || new Set(selectedCardIds).size !== selectedCardIds.length) {
      return res.status(400).json({ error: 'Choose unique card IDs between 1 and 400.' })
    }

    const userId = req.user.id

    const cards = await db.transaction(async (trx) => {
      const room = await trx('game_rooms').where({ id: roomId }).forUpdate().first()
      if (!room) throw new Error('ROOM_NOT_FOUND')
      if (!['WAITING', 'COUNTDOWN'].includes(room.status)) throw new Error('ROOM_ALREADY_STARTED')

      const participant = await trx('room_participants')
        .where({ room_id: roomId, user_id: userId })
        .first()
      if (!participant) throw new Error('NOT_ROOM_PARTICIPANT')

      const takenCards = await trx('room_card_selections')
        .where({ room_id: roomId })
        .whereNot('user_id', userId)
        .whereIn('card_id', selectedCardIds)
      if (takenCards.length > 0) throw new Error('CARD_ALREADY_TAKEN')

      await trx('room_card_selections').where({ room_id: roomId, user_id: userId }).del()

      const rows = selectedCardIds.map((cardId) => ({
        room_id: roomId,
        card_id: cardId,
        user_id: userId,
        card: JSON.stringify(generateCardFromNumber(cardId)),
        status: 'reserved',
      }))
      const inserted = await trx('room_card_selections').insert(rows).returning('*')

      return inserted.map((selection) => ({
        id: selection.card_id,
        matrix: typeof selection.card === 'string' ? JSON.parse(selection.card) : selection.card,
      }))
    })

    return res.json({ success: true, cards })
  } catch (err) {
    console.error('select-cards error:', err)
    if (err.message === 'ROOM_NOT_FOUND') return res.status(404).json({ error: 'Room not found' })
    if (err.message === 'ROOM_ALREADY_STARTED') {
      return res.status(409).json({ error: 'Game in progress. Please wait for the next round.' })
    }
    if (err.message === 'NOT_ROOM_PARTICIPANT') {
      return res.status(403).json({ error: 'Join the room before selecting cards.' })
    }
    if (err.message === 'CARD_ALREADY_TAKEN') return res.status(409).json({ error: 'Card already taken' })
    return res.status(500).json({ error: 'server error' })
  }
})

// GET /api/rooms/:id/my-cards
router.get('/:id/my-cards', userAuth, async (req, res) => {
  try {
    const roomId = req.params.id
    const userId = req.user.id

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' })
    }

    const user = await db('users').where({ id: userId }).first()

    if (!user) {
      console.log(`[my-cards] User not found for ID: ${userId}`)
      return res.status(404).json({ error: 'User not found' })
    }

    const participant = await db('room_participants').where({ room_id: roomId, user_id: user.id }).first()
    if (!participant) return res.status(403).json({ error: 'Only room participants can view their cards.' })

    const selections = await db('room_card_selections').where({ room_id: roomId, user_id: user.id })
    console.log(`[my-cards] Found ${selections.length} cards for DB user ${user.id} in room ${roomId}`)

    const cards = selections.map((selection) => ({
      id: selection.card_id,
      matrix: typeof selection.card === 'string' ? JSON.parse(selection.card) : selection.card,
    }))

    return res.json({ cards })
  } catch (error) {
    console.error('[my-cards] Error:', error)
    return res.status(500).json({ error: 'Failed to fetch cards' })
  }
})

module.exports = router