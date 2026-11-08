exports.up = async function (knex) {
  const hasReferredBy = await knex.schema.hasColumn('users', 'referred_by')
  const hasReferralBalance = await knex.schema.hasColumn('users', 'referral_balance')

  if (!hasReferredBy || !hasReferralBalance) {
    await knex.schema.alterTable('users', (table) => {
      if (!hasReferredBy) {
        table.integer('referred_by').nullable().references('id').inTable('users').onDelete('SET NULL')
      }
      if (!hasReferralBalance) table.decimal('referral_balance', 14, 2).notNullable().defaultTo(0)
    })
  }

  if (!(await knex.schema.hasTable('referral_earnings'))) {
    await knex.schema.createTable('referral_earnings', (table) => {
      table.increments('id').primary()
      table.integer('inviter_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.integer('invitee_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.uuid('room_id').nullable().references('id').inTable('game_rooms').onDelete('SET NULL')
      table.uuid('game_id').nullable().references('id').inTable('game_rooms').onDelete('SET NULL')
      table.decimal('amount', 14, 2).notNullable()
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    })
  } else if (!(await knex.schema.hasColumn('referral_earnings', 'game_id'))) {
    await knex.schema.alterTable('referral_earnings', (table) => {
      table.uuid('game_id').nullable().references('id').inTable('game_rooms').onDelete('SET NULL')
    })
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by)')
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_referral_earnings_inviter_id ON referral_earnings(inviter_id)')
}

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_referral_earnings_inviter_id')
  await knex.raw('DROP INDEX IF EXISTS idx_users_referred_by')
}
