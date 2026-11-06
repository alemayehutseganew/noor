const { randomBytes } = require('crypto')

exports.up = async function (knex) {
  const hasReferralCode = await knex.schema.hasColumn('users', 'referral_code')
  const hasReferredBy = await knex.schema.hasColumn('users', 'referred_by')
  const hasReferralBalance = await knex.schema.hasColumn('users', 'referral_balance')
  if (!hasReferralCode || !hasReferredBy || !hasReferralBalance) {
    await knex.schema.alterTable('users', (table) => {
      if (!hasReferralCode) table.string('referral_code', 8).unique()
      if (!hasReferredBy) {
        table.integer('referred_by').nullable().references('id').inTable('users').onDelete('SET NULL')
      }
      if (!hasReferralBalance) table.decimal('referral_balance', 14, 2).notNullable().defaultTo(0)
    })
  }

  const usersWithoutCodes = await knex('users').select('id').whereNull('referral_code')
  for (const user of usersWithoutCodes) {
    let referralCode
    do {
      referralCode = randomBytes(4).toString('hex')
    } while (await knex('users').where({ referral_code: referralCode }).first())

    await knex('users').where({ id: user.id }).update({ referral_code: referralCode })
  }

  const hasEarningsTable = await knex.schema.hasTable('referral_earnings')
  if (!hasEarningsTable) {
    await knex.schema.createTable('referral_earnings', (table) => {
      table.increments('id').primary()
      table.integer('inviter_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.integer('invitee_id').notNullable().references('id').inTable('users').onDelete('CASCADE')
      table.uuid('room_id').notNullable().references('id').inTable('game_rooms').onDelete('CASCADE')
      table.decimal('amount', 14, 2).notNullable()
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
    })
  }
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('referral_earnings')

  const hasReferralCode = await knex.schema.hasColumn('users', 'referral_code')
  const hasReferredBy = await knex.schema.hasColumn('users', 'referred_by')
  const hasReferralBalance = await knex.schema.hasColumn('users', 'referral_balance')
  if (hasReferralCode || hasReferredBy || hasReferralBalance) {
    await knex.schema.alterTable('users', (table) => {
      if (hasReferralCode) table.dropColumn('referral_code')
      if (hasReferredBy) table.dropColumn('referred_by')
      if (hasReferralBalance) table.dropColumn('referral_balance')
    })
  }
}
