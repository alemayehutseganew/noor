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
    const user = await db('users').where({ id: req.user.id }).first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const earnings = await db('referral_earnings')
      .where({ inviter_id: user.id })
      .sum('amount as total_earned')
      .first()
    const referredUsers = await db('users')
      .where({ referred_by: user.id })
      .select('id', 'first_name', 'created_at')
      .orderBy('created_at', 'desc')

    res.json({
      referral_code: user.referral_code,
      referral_balance: Number(user.referral_balance) || 0,
      referral_threshold: 1000,
      total_earned: Number(earnings?.total_earned) || 0,
      referred_users: referredUsers.map((referredUser) => ({
        id: referredUser.id,
        name: referredUser.first_name?.trim() || `User ${referredUser.id}`,
        joined_at: referredUser.created_at,
      })),
    })
  } catch (err) {
    console.error('referrals error:', err)
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
