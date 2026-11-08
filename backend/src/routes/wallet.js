const express = require('express')
const router = express.Router()
const db = require('../db')
const { creditVerifiedDeposit, PaymentVerificationError } = require('../services/paymentService')
const { userAuth } = require('../../middleware/auth')

// GET /api/wallet/balance
router.get('/balance', userAuth, async (req, res) => {
  try {
    const user = await db('users')
      .select('wallet_balance', 'referral_balance')
      .where({ id: req.user.id })
      .first()
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({
      balance: user.wallet_balance || 0,
      referral_balance: user.referral_balance || 0,
      referral_threshold: 1000,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/wallet/deposit (manual Telebirr receipt verification)
router.post('/deposit', userAuth, async (req, res) => {
  const { amount, reference } = req.body || {}
  if (!amount || !reference) return res.status(400).json({ error: 'Missing fields' })

  try {
    const result = await creditVerifiedDeposit({
      userId: req.user.id,
      reference,
      amount,
    })
    return res.json({ success: true, newBalance: result.newBalance })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This transaction has already been used' })
    }

    const message = err instanceof PaymentVerificationError
      ? err.message
      : 'Unable to process this deposit.'
    return res.status(400).json({ error: message })
  }
})

// POST /api/wallet/withdraw
router.post('/withdraw', userAuth, async (req, res) => {
  try {
    const { amount, provider, phoneNumber, source } = req.body || {}
    if (!amount || !provider) return res.status(400).json({ error: 'Missing fields' })
    if (source !== undefined && source !== 'wallet') {
      return res.status(400).json({ error: 'Invalid withdrawal source' })
    }
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' })
    }
    if (numericAmount < 100) return res.status(400).json({ error: 'Minimum withdrawal is 100 ETB' })
    const reference = `WD-${Date.now()}-${req.user.id}`
    await db.transaction(async (trx) => {
      const user = await trx('users')
        .select('id', 'wallet_balance')
        .where({ id: req.user.id })
        .forUpdate()
        .first()
      if (!user) {
        const error = new Error('User not found')
        error.statusCode = 404
        throw error
      }

      if (numericAmount > Number(user.wallet_balance)) {
        const error = new Error('Insufficient wallet balance.')
        error.statusCode = 400
        throw error
      }
      await trx('users').where({ id: user.id }).decrement('wallet_balance', numericAmount)

      await trx('payments').insert({
        user_id: user.id,
        type: 'withdrawal',
        provider,
        amount: numericAmount,
        status: 'pending',
        transaction_reference: reference,
        provider_response: { phoneNumber },
      })
      await trx('financial_ledger').insert({
        user_id: user.id,
        type: 'withdrawal',
        amount: numericAmount,
        reference,
      })
    })

    res.json({ success: true, message: 'Withdrawal request submitted', reference })
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

// POST /api/wallet/withdraw-agent
router.post('/withdraw-agent', userAuth, async (req, res) => {
  try {
    const { amount, provider, phoneNumber } = req.body || {}
    if (!amount || !provider) return res.status(400).json({ error: 'Missing fields' })
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' })
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(String(amount).trim())) {
      return res.status(400).json({ error: 'Withdrawal amount must have no more than two decimal places' })
    }
    if (numericAmount < 100) return res.status(400).json({ error: 'Minimum withdrawal is 100 ETB' })

    const reference = `WD-AGENT-${Date.now()}-${req.user.id}`
    let updatedReferralBalance
    await db.transaction(async (trx) => {
      const user = await trx('users')
        .select('id', 'referral_balance')
        .where({ id: req.user.id })
        .forUpdate()
        .first()
      if (!user) {
        const error = new Error('User not found')
        error.statusCode = 404
        throw error
      }

      const referralBalance = Number(user.referral_balance) || 0
      if (referralBalance < 1000) {
        const error = new Error('You need at least 1,000 ETB in referral earnings to withdraw.')
        error.statusCode = 400
        throw error
      }
      if (numericAmount > referralBalance) {
        const error = new Error('Insufficient referral balance.')
        error.statusCode = 400
        throw error
      }

      await trx('users').where({ id: user.id }).decrement('referral_balance', numericAmount)
      updatedReferralBalance = Math.round((referralBalance - numericAmount) * 100) / 100
      await trx('payments').insert({
        user_id: user.id,
        type: 'withdrawal',
        provider,
        amount: numericAmount,
        status: 'pending',
        transaction_reference: reference,
        provider_response: { phoneNumber, source: 'agent' },
      })
      await trx('financial_ledger').insert({
        user_id: user.id,
        type: 'withdrawal',
        amount: numericAmount,
        reference,
      })
    })

    res.json({
      success: true,
      message: 'Agent withdrawal request submitted',
      reference,
      referralBalance: updatedReferralBalance,
    })
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

module.exports = router