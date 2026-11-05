const express = require('express')
const router = express.Router()

router.post('/initiate', (req, res) => res.status(501).json({ error: 'Not implemented' }))
router.post('/cbe/initiate', (req, res) => res.status(501).json({ error: 'Not implemented' }))
router.post('/telebirr/webhook', (req, res) => res.status(501).json({ error: 'Not implemented' }))
router.post('/cbe/webhook', (req, res) => res.status(501).json({ error: 'Not implemented' }))

module.exports = router
