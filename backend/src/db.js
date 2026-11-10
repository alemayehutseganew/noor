const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true })

const environment = process.env.NODE_ENV || 'development'
if (environment === 'production' && !process.env.DATABASE_URL) {
  const error = new Error('DATABASE_URL is required in production.')
  console.error('❌ CRITICAL ERROR: DATABASE_URL is missing in production!', error)
  throw error
}

const knex = require('knex')
const config = require('../knexfile.js')
const db = knex(config[environment])

module.exports = db
