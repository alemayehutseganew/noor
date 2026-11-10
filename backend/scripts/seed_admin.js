const db = require('../src/db'); // Adjust path if needed
const bcrypt = require('bcryptjs');

async function seedAdmin() {
  const username = 'Kenaw';
  // Use a strong password
  const password = 'Kedir@Bingo2026!';
  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    const existing = await db('admins').where({ username }).first();
    if (existing) {
      await db('admins').where({ username }).update({ password_hash: passwordHash });
      console.log(`✅ Admin '${username}' password updated.`);
    } else {
      await db('admins').insert({ username, password_hash: passwordHash });
      console.log(`✅ Admin '${username}' created.`);
    }
    console.log(`🔑 Login with Username: ${username} and Password: ${password}`);
  } catch (err) {
    console.error('❌ Admin seed error:', err.message);
  } finally {
    await db.destroy();
  }
}

seedAdmin();