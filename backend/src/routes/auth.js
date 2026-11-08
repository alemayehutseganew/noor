const express = require('express')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const db = require('../db')

const router = express.Router()
const { userAuth } = require('../../middleware/auth')

function validateInitData(initData, botToken) {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null

  params.delete('hash')

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n')

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  if (calculatedHash !== hash) return null

  const userStr = params.get('user')
  if (!userStr) return null
  try {
    return JSON.parse(userStr)
  } catch (e) {
    return null
  }
}

router.post('/login', async (req, res) => {
  try {
    const { initData, referralCode } = req.body || {}
    if (!initData) {
      return res.status(400).json({ error: 'initData is required' })
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured' })
    }

    const tgUser = validateInitData(initData, botToken)
    if (!tgUser || !tgUser.id) {
      return res.status(401).json({ error: 'invalid initData' })
    }

    const telegramId = tgUser.id

    const userFields = ['id', 'telegram_id', 'username', 'first_name', 'wallet_balance']
    let user = await db('users')
      .select(userFields)
      .where({ telegram_id: telegramId })
      .first()

    if (!user) {
      user = await db.transaction(async (trx) => {
        const username = tgUser.username || null
        const code = typeof referralCode === 'string' ? referralCode.trim().slice(0, 128) : ''
        let inviter

        if (code) {
          if (/^\d+$/.test(code)) {
            inviter = await trx('users')
              .select('id')
              .where({ telegram_id: code })
              .first()
          }

          if (!inviter) {
            const usernameCode = code.startsWith('@') ? code.slice(1) : code
            inviter = await trx('users')
              .select('id')
              .whereRaw('LOWER(username) = LOWER(?)', [usernameCode])
              .first()
          }

          if (!inviter) {
            const phoneDigits = code.replace(/\D/g, '')
            if (phoneDigits) {
              inviter = await trx('users')
                .select('id')
                .whereRaw("regexp_replace(phone_number, '[^0-9]', '', 'g') = ?", [phoneDigits])
                .first()
            }
          }
        }

        const [created] = await trx('users')
          .insert({
            telegram_id: telegramId,
            username,
            first_name: tgUser.first_name || null,
            wallet_balance: 0,
            referred_by: inviter?.id || null,
          })
          .returning(userFields)
        return created
      })
    } else {
      const username = tgUser.username || null
      await db('users').where({ id: user.id }).update({
        username,
        first_name: tgUser.first_name || user.first_name,
      })
      user = await db('users')
        .select(userFields)
        .where({ id: user.id })
        .first()
    }

    const token = jwt.sign(
      { id: user.id, telegram_id: user.telegram_id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    )

    return res.json({ token, user })
  } catch (err) {
    console.error('Auth login error:', err)
    return res.status(500).json({ error: 'server error' })
  }
})

// GET /api/auth/me
router.get('/me', userAuth, (req, res) => {
  return res.json(req.user)
})

module.exports = router
