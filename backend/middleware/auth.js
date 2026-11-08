const jwt = require('jsonwebtoken')
const db = require('../src/db')

async function userAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  let payload
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET)
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!payload.id) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const user = await db('users')
    .select(
      'id',
      'telegram_id',
      'username',
      'first_name',
      'phone_number',
      'wallet_balance',
      'language',
      'created_at'
    )
    .where({ id: payload.id })
    .first()
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  req.user = user
  return next()
}

module.exports = userAuth
module.exports.userAuth = userAuth
