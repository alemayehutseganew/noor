const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), quiet: true });
const normalizeDatabaseUrl = require('./src/dbUrl')

function buildConfig() {
  const base = {
    migrations: { directory: './migrations' },
    pool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 60000,
      idleTimeoutMillis: 30000,
    },
  }
  const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL)
  if (databaseUrl) {
    return {
      ...base,
      client: 'pg',
      connection: {
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
      },
    }
  }
  return {
    ...base,
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'postgres',
    },
  }
}

module.exports = {
  development: buildConfig(),
  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    },
    pool: { min: 2, max: 10 },
    migrations: { directory: './migrations' },
  }
}
