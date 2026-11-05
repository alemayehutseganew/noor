exports.up = async function (knex) {
  await knex.schema.createTable('verified_transactions', (table) => {
    table.increments('id').primary()
    table.string('reference', 32).notNullable().unique()
    table.integer('user_id').notNullable().references('id').inTable('users')
    table.decimal('amount', 12, 2).notNullable()
    table.string('provider', 16).notNullable().defaultTo('telebirr')
    table.jsonb('raw_response')
    table.timestamp('verified_at').defaultTo(knex.fn.now())
  })
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('verified_transactions')
}
