const express = require('express')
const router = express.Router()
const db = require('../db')
const { creditVerifiedDeposit, PaymentVerificationError } = require('../services/paymentService')
const { userAuth } = require('../../middleware/auth')

// GET /api/wallet/balance
router.get('/balance', userAuth, async (req, res) => {
  try {
    const user = await db('users').where({ id: req.user.id }).first()
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ balance: user.wallet_balance || 0 })
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
    const { amount, provider, phoneNumber } = req.body
    if (!amount || !provider) return res.status(400).json({ error: 'Missing fields' })
    if (Number(amount) < 100) return res.status(400).json({ error: 'Minimum withdrawal is 100 ETB' })

    const user = await db('users').where({ id: req.user.id }).first()
    if (!user) return res.status(404).json({ error: 'User not found' })
    if (Number(user.wallet_balance) < Number(amount)) return res.status(400).json({ error: 'Insufficient balance' })

    const reference = `WD-${Date.now()}-${user.id}`
    await db('users').where({ id: user.id }).decrement('wallet_balance', amount)
    await db('payments').insert({
      user_id: user.id,
      type: 'withdrawal',
      provider,
      amount,
      status: 'pending',
      transaction_reference: reference,
      provider_response: { phoneNumber },
    })

    res.json({ success: true, message: 'Withdrawal request submitted', reference })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router