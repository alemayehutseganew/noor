exports.up = async function (knex) {
  const hasUsers = await knex.schema.hasTable('users')
  if (!hasUsers) return

  const hasReferralCode = await knex.schema.hasColumn('users', 'referral_code')
  if (hasReferralCode) {
    await knex.schema.alterTable('users', (table) => {
      table.string('referral_code', 64).alter()
    })
  }

  const hasUsername = await knex.schema.hasColumn('users', 'username')
  if (hasUsername) {
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)')
  }
}

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_users_username')
}
