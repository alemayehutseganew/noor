const express = require('express')
const router = express.Router()
const db = require('../db')
const { userAuth } = require('../../middleware/auth')

// GET /api/users/history
router.get('/history', userAuth, async (req, res) => {
  try {
    const user = await db('users')
      .select('id')
      .where({ id: req.user.id })
      .first()
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

function maskPhoneNumber(phoneNumber) {
  const digits = String(phoneNumber || '').replace(/\D/g, '')
  return digits ? `••••${digits.slice(-4)}` : null
}

// GET /api/users/referrals
router.get('/referrals', userAuth, async (req, res) => {
  try {
    const user = await db('users')
      .select('id', 'telegram_id', 'username', 'referral_balance')
      .where({ id: req.user.id })
      .first()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const [earnings, invitedUsers] = await Promise.all([
      db('referral_earnings')
        .where({ inviter_id: user.id })
        .sum('amount as total_earned')
        .first(),
      db('users')
        .select('username', 'phone_number', 'created_at')
        .where({ referred_by: user.id })
        .orderBy('created_at', 'desc'),
    ])

    res.json({
      referral_code: String(user.telegram_id),
      referral_balance: Number(user.referral_balance) || 0,
      referral_threshold: 1000,
      total_earned: Number(earnings?.total_earned) || 0,
      referred_users: invitedUsers.map((invitedUser) => ({
        name: invitedUser.username
          ? `@${invitedUser.username}`
          : maskPhoneNumber(invitedUser.phone_number) || 'Invited player',
        joined_at: invitedUser.created_at,
      })),
    })
  } catch (err) {
    console.error('[REFERRALS] Failed to load referral data:', err)
    res.status(500).json({ error: 'Failed to load referral data.' })
  }
})

module.exports = router
