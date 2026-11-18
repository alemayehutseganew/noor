exports.up = async function (knex) {
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_room_participants_room_user ON room_participants(room_id, user_id)'
  )
  await knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_game_rooms_status_stake_created ON game_rooms(status, stake_amount, created_at)'
  )
}

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_room_participants_room_user')
  await knex.raw('DROP INDEX IF EXISTS idx_game_rooms_status_stake_created')
}
