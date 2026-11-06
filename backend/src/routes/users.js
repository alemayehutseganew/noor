const express = require('express')
const router = express.Router()
const db = require('../db')
const { userAuth } = require('../../middleware/auth')

// GET /api/users/history
router.get('/history', userAuth, async (req, res) => {
  try {
    const user = await db('users').where({ id: req.user.id }).first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const history = await db('room_participants')
      .join('game_rooms', 'room_participants.room_id', 'game_rooms.id')
      .where({ 'room_participants.user_id': user.id })
      .select('game_rooms.stake_amount', 'room_participants.is_winner', 'room_participants.joined_at')
      .orderBy('room_participants.joined_at', 'desc')
      .limit(20)

    res.json({ history })
  } catch (err) {
    console.error('history error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/users/leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const leaders = await db('users')
      .select('first_name', 'wallet_balance')
      .orderBy('wallet_balance', 'desc')
      .limit(10)
    res.json({ leaders })
  } catch (err) {
    console.error('leaderboard error:', err)
    res.status(500).json({ error: err.message })
  }
})

// GET /api/users/referrals
router.get('/referrals', userAuth, async (req, res) => {
  try {
    const user = await db('users')
      .where({ id: req.user.id })
      .select('username', 'telegram_id', 'referral_code', 'referral_balance')
      .first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const [earnings, referredUsers] = await Promise.all([
      db('referral_earnings')
        .where({ inviter_id: req.user.id })
        .sum('amount as total_earned')
        .first(),
      db('users')
        .where({ referred_by: req.user.id })
        .select('id', 'username', 'first_name', 'created_at')
        .orderBy('created_at', 'desc'),
    ])

    res.json({
      username: user.username,
      telegram_id: user.telegram_id,
      referral_code: user.referral_code || user.username || user.telegram_id,
      referral_balance: Number(user.referral_balance) || 0,
      referral_threshold: 1000,
      referral_count: referredUsers.length,
      total_earned: Number(earnings?.total_earned) || 0,
      referred_users: referredUsers.map((referredUser) => ({
        id: referredUser.id,
        name: referredUser.username
          ? `@${referredUser.username}`
          : referredUser.first_name?.trim() || 'Anonymous Player',
        joined_at: referredUser.created_at,
      })),
    })
  } catch (err) {
    console.error('[AGENT DASHBOARD FETCH ERROR]:', err)

    const errorMessage = err.message || ''
    if (
      err.code === '42P01' ||
      /relation ["']?referral_earnings["']? does not exist/i.test(errorMessage)
    ) {
      return res.status(500).json({
        error: 'Missing table `referral_earnings`. Run `npx knex migrate:latest` from the backend directory.',
      })
    }

    if (
      err.code === '42703' &&
      /referral_balance/i.test(errorMessage)
    ) {
      return res.status(500).json({
        error: 'Missing column `users.referral_balance`. Run `npx knex migrate:latest` from the backend directory.',
      })
    }

    return res.status(500).json({ error: 'Failed to load referral data. Check backend logs.' })
  }
})

module.exports = router
