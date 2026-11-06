const express = require('express')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const db = require('../db')

const router = express.Router()
const { userAuth } = require('../../middleware/auth')

function parseReferralRef(value) {
  if (typeof value !== 'string') return null
  const referralRef = value.trim()
  if (!referralRef) return null
  if (referralRef.startsWith('u_')) return { type: 'username', value: referralRef.slice(2) }
  if (referralRef.startsWith('i_')) return { type: 'telegram_id', value: referralRef.slice(2) }
  if (referralRef.startsWith('@')) return { type: 'username', value: referralRef.slice(1) }
  if (/^\d+$/.test(referralRef)) return { type: 'telegram_id', value: referralRef }
  if (referralRef.startsWith('REF_')) return { type: 'referral_code', value: referralRef.slice(4) }
  return null
}

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
    const { initData, referralRef } = req.body || {}
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

    let user = await db('users').where({ telegram_id: telegramId }).first()

    if (!user) {
      user = await db.transaction(async (trx) => {
        const parsedReferral = parseReferralRef(referralRef)
        let inviterQuery
        if (parsedReferral?.type === 'username' && parsedReferral.value) {
          inviterQuery = trx('users').whereRaw('LOWER(username) = LOWER(?)', [parsedReferral.value])
        } else if (parsedReferral?.type === 'telegram_id') {
          inviterQuery = trx('users').where({ telegram_id: parsedReferral.value })
        } else if (parsedReferral?.type === 'referral_code') {
          inviterQuery = trx('users').where({ referral_code: parsedReferral.value })
        }

        const inviter = inviterQuery ? await inviterQuery.first() : null
        const username = tgUser.username || null
        const [created] = await trx('users')
          .insert({
          telegram_id: telegramId,
          username,
          first_name: tgUser.first_name || null,
          wallet_balance: 0,
          referral_code: username ? `@${username}` : String(telegramId),
          referred_by: inviter?.id || null,
        })
        .returning('*')
        return created
      })
    } else {
      const username = tgUser.username || null
      await db('users').where({ id: user.id }).update({
        username,
        first_name: tgUser.first_name || user.first_name,
        referral_code: username ? `@${username}` : String(telegramId),
      })
      user = await db('users').where({ id: user.id }).first()
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
