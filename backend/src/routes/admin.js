const express = require('express')
const router = express.Router()
const db = require('../db')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const { adminAuth, JWT_SECRET } = require('../middleware/adminAuth')
const { archiveOldData } = require('../../scripts/archive_old_data')

function verifyPassword(password, stored) {
  if (/^\$2[aby]\$/.test(stored)) {
    return bcrypt.compareSync(password, stored)
  }

  const [salt, derived] = stored.split(':')
  const check = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(check, 'hex'), Buffer.from(derived, 'hex'))
}

router.post('/seed', async (req, res) => {
  const configuredToken = process.env.ADMIN_SEED_TOKEN
  const providedToken = req.get('x-admin-seed-token') || ''
  if (!configuredToken || Buffer.byteLength(configuredToken, 'utf8') < 32) {
    return res.status(503).json({ error: 'Admin seeding is not configured.' })
  }

  const expected = Buffer.from(configuredToken, 'utf8')
  const provided = Buffer.from(providedToken, 'utf8')
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return res.status(401).json({ error: 'Unauthorized.' })
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const passwordLength = Buffer.byteLength(password, 'utf8')
  if (username !== 'Kenaw Nuru Muhabe') {
    return res.status(400).json({ error: 'This endpoint only provisions the Kenaw Nuru Muhabe admin account.' })
  }
  if (passwordLength < 16 || passwordLength > 72) {
    return res.status(400).json({ error: 'Password must be 16-72 bytes.' })
  }

  try {
    const passwordHash = bcrypt.hashSync(password, 10)
    const inserted = await db('admins')
      .insert({ username, password_hash: passwordHash })
      .onConflict('username')
      .ignore()
      .returning('id')

    if (!inserted.length) {
      return res.status(409).json({ error: 'Admin username already exists.' })
    }

    return res.status(201).json({ message: `Admin '${username}' created successfully.` })
  } catch (err) {
    console.error('Admin seed error:', err.message)
    return res.status(500).json({ error: 'Failed to create admin.' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body
    const admin = await db('admins').where({ username }).first()
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' })
    res.json({ token })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.get('/stats', adminAuth, async (req, res) => {
  try {
    const userCountResult = await db('users').count('* as count').first()
    const totalUsers = parseInt(userCountResult.count, 10)

    const activeGamesResult = await db('game_rooms')
      .whereIn('status', ['WAITING', 'COUNTDOWN', 'PLAYING'])
      .count('* as count')
      .first()
    const activeGames = parseInt(activeGamesResult.count, 10)

    const wageredResult = await db('financial_ledger')
      .where({ type: 'ENTRY_FEE' })
      .select(db.raw('SUM(ABS(amount)) as total'))
      .first()
    const totalWagered = parseFloat(wageredResult.total || 0).toFixed(2)

    const payoutsResult = await db('financial_ledger')
      .where({ type: 'WINNING_PAYOUT' })
      .sum('amount as total')
      .first()
    const totalPayouts = parseFloat(payoutsResult.total || 0).toFixed(2)

    const platformProfit = (parseFloat(totalWagered) - parseFloat(totalPayouts)).toFixed(2)

    res.json({
      totalUsers,
      activeGames,
      totalWagered,
      totalPayouts,
      platformProfit,
    })
  } catch (err) {
    console.error('[Admin] Stats error:', err.message, err)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
})

router.get('/users', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1
    const requestedLimit = parseInt(req.query.limit, 10) || 100
    const limit = Math.min(Math.max(requestedLimit, 1), 100)
    const offset = (page - 1) * limit
    const users = await db('users')
      .select('id', 'telegram_id', 'first_name', 'username', 'phone_number', 'wallet_balance', 'created_at')
      .orderBy('wallet_balance', 'desc')
      .orderBy('id', 'desc')
      .limit(limit)
      .offset(offset)
    const total = await db('users').count('* as c').first()
    res.json({ users, total: Number(total.c), page, limit })
  } catch (err) {
    console.error('[Admin] Users fetch error:', err.message, err)
    res.status(500).json({ error: err.message })
  }
})

router.post('/users/:id/adjust-balance', adminAuth, async (req, res) => {
  try {
    const { amount, type } = req.body
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' })
    }
    if (type !== 'add' && type !== 'subtract') {
      return res.status(400).json({ error: 'Invalid type' })
    }

    const updated = await db.transaction(async (trx) => {
      const user = await trx('users').where({ id: req.params.id }).first()
      if (!user) {
        const err = new Error('User not found')
        err.statusCode = 404
        throw err
      }

      const userQuery = trx('users').where({ id: user.id })
      if (type === 'add') {
        await userQuery.increment('wallet_balance', amt)
      } else {
        await userQuery.decrement('wallet_balance', amt)
      }

      const hasLedger = await trx.schema.hasTable('financial_ledger')
      if (hasLedger) {
        await trx('financial_ledger').insert({
          user_id: user.id,
          type: `admin_${type}`,
          amount: amt,
          reference: `ADMIN-${Date.now()}`,
          created_at: new Date(),
        })
      }

      return trx('users').where({ id: user.id }).first()
    })
    const io = req.app.get('io')
    if (io) {
      io.to(`user_${updated.id}`).emit('wallet_updated', {
        newBalance: Number(updated.wallet_balance),
      })
    } else {
      console.error('Socket.IO server unavailable; wallet update notification was not sent.')
    }
    res.json({ success: true, user: updated })
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

router.get('/games', adminAuth, async (req, res) => {
  try {
    const games = await db('game_rooms')
      .select(
        'game_rooms.id',
        'game_rooms.stake_amount',
        'game_rooms.status',
        'game_rooms.created_at',
        db.raw('COUNT(room_participants.id) as total_players')
      )
      .leftJoin('room_participants', 'game_rooms.id', 'room_participants.room_id')
      .groupBy('game_rooms.id')
      .orderBy('game_rooms.created_at', 'desc')
      .limit(100)

    const gameIds = games.map(g => g.id)
    const winners = await db('room_participants')
      .join('users', 'room_participants.user_id', 'users.id')
      .whereIn('room_participants.room_id', gameIds)
      .andWhere('room_participants.is_winner', true)
      .select('room_participants.room_id', 'users.first_name', 'users.username')

    const winnerMap = {}
    winners.forEach(w => winnerMap[w.room_id] = w.first_name || w.username || 'Unknown')

    const result = games.map(g => ({
      ...g,
      winner_name: winnerMap[g.id] || 'No Winner / In Progress'
    }))

    res.json({ games: result })
  } catch (err) {
    console.error('Games fetch error:', err)
    res.status(500).json({ error: err.message })
  }
})

router.get('/payments', adminAuth, async (req, res) => {
  try {
    const transactions = await db('payments')
      .join('users', 'payments.user_id', 'users.id')
      .select(
        'payments.id',
        'users.first_name',
        'users.username',
        'users.telegram_id',
        'payments.amount',
        'payments.type',
        'payments.status',
        'payments.transaction_reference as reference_id',
        'payments.created_at',
        db.raw("COALESCE(payments.provider_response->>'source', 'wallet') as source")
      )
      .orderBy('payments.created_at', 'desc')

    res.json({ transactions })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/payments/:id/approve', adminAuth, async (req, res) => {
  try {
    let paymentType
    let targetUserId
    let newBalance
    await db.transaction(async (trx) => {
      const p = await trx('payments').where({ id: req.params.id }).forUpdate().first()
      if (!p) {
        const err = new Error('Not found')
        err.statusCode = 404
        throw err
      }
      if (p.status !== 'pending') {
        const err = new Error('Payment already processed')
        err.statusCode = 400
        throw err
      }

      if (p.type === 'deposit') {
        const user = await trx('users').where({ id: p.user_id }).forUpdate().first()
        if (!user) {
          const err = new Error('User not found')
          err.statusCode = 404
          throw err
        }
        await trx('users').where({ id: p.user_id }).increment('wallet_balance', p.amount)
        newBalance = Number(user.wallet_balance || 0) + Number(p.amount)
        await trx('financial_ledger').insert({
          user_id: p.user_id,
          amount: p.amount,
          type: 'DEPOSIT',
          reference: `PAYMENT-${p.id}`,
          created_at: new Date(),
        })
      } else if (p.type !== 'withdrawal') {
        const err = new Error('Unsupported payment type')
        err.statusCode = 400
        throw err
      }

      await trx('payments').where({ id: p.id }).update({
        status: p.type === 'withdrawal' ? 'approved' : 'completed',
      })
      paymentType = p.type
      targetUserId = p.user_id
    })

    if (paymentType === 'deposit') {
      try {
        req.app.get('io')?.to(`user_${targetUserId}`).emit('wallet_updated', { newBalance })
      } catch (emitErr) {
        console.error('Failed to emit wallet_updated:', emitErr)
      }
    }

    res.json({ success: true, message: `${paymentType} approved` })
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message })
    res.status(500).json({ error: err.message })
  }
})

router.post('/payments/:id/reject', adminAuth, async (req, res) => {
  try {
    let paymentType
    let targetUserId
    let newBalance
    let newReferralBalance
    await db.transaction(async (trx) => {
      const p = await trx('payments').where({ id: req.params.id }).forUpdate().first()
      if (!p) {
        const err = new Error('Not found')
        err.statusCode = 404
        throw err
      }
      if (p.status !== 'pending') {
        const err = new Error('Payment already processed')
        err.statusCode = 400
        throw err
      }

      if (p.type === 'withdrawal') {
        const user = await trx('users').where({ id: p.user_id }).forUpdate().first()
        if (!user) {
          const err = new Error('User not found')
          err.statusCode = 404
          throw err
        }

        const source = p.provider_response?.source || 'wallet'
        if (source === 'referral') {
          await trx('users').where({ id: p.user_id }).increment('referral_balance', p.amount)
          newReferralBalance = Number(user.referral_balance || 0) + Number(p.amount)
          newBalance = Number(user.wallet_balance || 0)
        } else {
          await trx('users').where({ id: p.user_id }).increment('wallet_balance', p.amount)
          newBalance = Number(user.wallet_balance || 0) + Number(p.amount)
          newReferralBalance = Number(user.referral_balance || 0)
        }

        await trx('financial_ledger').insert({
          user_id: p.user_id,
          amount: p.amount,
          type: 'withdrawal_refund',
          reference: `REFUND-PAYMENT-${p.id}`,
          created_at: new Date(),
        })
      } else if (p.type !== 'deposit') {
        const err = new Error('Unsupported payment type')
        err.statusCode = 400
        throw err
      }

      await trx('payments').where({ id: p.id }).update({ status: 'rejected' })
      paymentType = p.type
      targetUserId = p.user_id
    })

    if (paymentType === 'withdrawal') {
      try {
        req.app.get('io')?.to(`user_${targetUserId}`).emit('wallet_updated', { newBalance, referralBalance: newReferralBalance })
      } catch (emitErr) {
        console.error('Failed to emit wallet_updated:', emitErr)
      }
    }

    res.json({ success: true, message: `${paymentType} rejected` })
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message })
    res.status(500).json({ error: err.message })
  }
})

router.post('/reset-balances', adminAuth, async (req, res) => {
  try {
    await db('users').update({ wallet_balance: 0 })
    res.json({ success: true, message: 'All wallet balances reset to 0' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
router.post('/archive-data', adminAuth, async (req, res) => {
  try {
    const r = await archiveOldData()
    res.json({ success: true, ...r })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})


module.exports = router
