const db = require('../src/db')
const bcrypt = require('bcryptjs')

async function seedAdmin() {
  const username = 'Noor'
  const plainPassword = 'Noor@Bingo2026!'
  let succeeded = false

  try {
    const hashedPassword = await bcrypt.hash(plainPassword, 10)
    const existing = await db('admins').where({ username }).first()
    if (existing) {
      await db('admins').where({ username }).update({ password_hash: hashedPassword })
    } else {
      await db('admins').insert({ username, password_hash: hashedPassword })
    }
    succeeded = true
  } catch (err) {
    console.error('❌ Admin seed error:', err.message)
  } finally {
    try {
      await db.destroy()
    } catch (err) {
      console.error('❌ Admin database cleanup error:', err.message)
      succeeded = false
    }
  }

  if (!succeeded) {
    process.exitCode = 1
    return
  }

  console.log('✅ Admin credentials successfully updated for user:', username)
  process.exit(0)
}

seedAdmin()