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

module.exports = router
