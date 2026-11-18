const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true })

const requiredEnvVars = [
  'DATABASE_URL',
  'TELEGRAM_BOT_TOKEN',
  'JWT_SECRET',
  'TELEBIRR_RECEIVER_NUMBER',
  'TELEBIRR_RECEIVER_NAME',
  'FRONTEND_URL'
];

const missingVars = requiredEnvVars.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error('❌ CRITICAL ERROR: Missing environment variables:', missingVars.join(', '));
}

const express = require('express')
const http = require('http')
const cors = require('cors')

const app = express()

// 1. MUST BE FIRST: Body parser for Telegram webhooks and API JSON
app.use(express.json())

// 2. CORS Configuration
const allowedOrigins = [
  'https://noor-one-beta.vercel.app',
  'http://localhost:5173'
]

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}

app.use(cors(corsOptions))
app.options(/.*/, cors(corsOptions)) // Express 5 preflight handling

// 3. App Hardening
app.disable('x-powered-by')
app.set('trust proxy', 1)

// 4. Health Check
app.get('/health', (req, res) => res.status(200).send('OK'))

// 5. Lazy Router Loader (prevents heavy startup crashes)
function lazyRouter(modulePath) {
  let router
  return (req, res, next) => {
    try {
      router = router || require(modulePath)
      return router(req, res, next)
    } catch (err) {
      return next(err)
    }
  }
}

// 6. API Routes
app.use('/api/auth', lazyRouter('./routes/auth'))
app.use('/api/rooms', lazyRouter('./routes/rooms'))
app.use('/api/payments', lazyRouter('./routes/payments'))
app.use('/api/wallet', lazyRouter('./routes/wallet'))
app.use('/api/users', lazyRouter('./routes/users'))
app.use('/api/admin', lazyRouter('./routes/admin'))

// 7. TELEGRAM WEBHOOK (Must be placed BEFORE the 404 handler)
const { bot } = require('./bot/index')
app.set('bot', bot)

app.post(`/telegraf/${bot.secretPathComponent()}`, (req, res) => {
  // Acknowledge Telegram immediately
  res.sendStatus(200)
  
  try {
    bot.handleUpdate(req.body).catch((err) => {
      console.error('❌ [WEBHOOK ASYNC ERROR]', err)
    })
  } catch (err) {
    console.error('❌ [WEBHOOK SYNC ERROR]', err)
  }
})

// 8. 404 Handler (must come after all routes)
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// 9. Global Error Handler
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('Invalid JSON payload:', err.message)
    return res.status(400).json({ error: 'Invalid JSON payload' })
  }
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: origin not allowed' })
  }
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'Internal server error' })
})

// 10. HTTP Server + Socket.IO Setup
const server = http.createServer(app)
let io

async function performStartupCleanup() {
  const db = require('./db')
  try {
    await deleteStaleWaitingRooms(db)
  } catch (err) {
    console.error('[Cleanup] Startup sweep failed:', err)
  }
}

async function deleteStaleWaitingRooms(db) {
  return db.transaction(async (trx) => {
    const staleRooms = await trx('game_rooms')
      .select('id')
      .whereIn('status', ['WAITING', 'COUNTDOWN'])
      .where('created_at', '<', trx.raw("NOW() - INTERVAL '1 hour'"))
      .forUpdate()
    const roomIds = staleRooms.map((room) => room.id)
    if (roomIds.length === 0) return 0

    await trx('room_card_selections').whereIn('room_id', roomIds).del()
    await trx('room_participants').whereIn('room_id', roomIds).del()
    await trx('game_rooms').whereIn('id', roomIds).del()
    return roomIds.length
  })
}

let cleanupInterval
function startPeriodicCleanup() {
  const db = require('./db')
  if (cleanupInterval) return
  cleanupInterval = setInterval(async () => {
    try {
      await deleteStaleWaitingRooms(db)
    } catch (err) {
      console.error('[Cron] Periodic cleanup failed:', err)
    }
  }, 10 * 60 * 1000)
  if (cleanupInterval.unref) cleanupInterval.unref()
}

function setupRealtime() {
  const { setupSocket } = require('./sockets/gameHandler')
  io = setupSocket(server)
  
  // Ensure Socket.IO CORS matches Express CORS
  Object.assign(io.engine.opts.cors, {
    origin: ['https://noor-one-beta.vercel.app'],
    methods: ['GET', 'POST'],
    credentials: true
  })
  app.set('io', io)

  if (process.env.REDIS_URL) {
    try {
      const { createAdapter } = require('@socket.io/redis-adapter')
      const { createClient } = require('redis')
      const pubClient = createClient({ url: process.env.REDIS_URL })
      const subClient = pubClient.duplicate()
      Promise.all([pubClient.connect(), subClient.connect()])
        .then(() => {
          io.adapter(createAdapter(pubClient, subClient))
        })
        .catch((err) => console.error('❌ Redis adapter error:', err))
    } catch (err) {
      console.error('[Redis] Failed to initialize adapter:', err)
    }
  }
}

// 11. Heavy Services Initialization (Runs after server starts listening)
async function initializeHeavyServices() {
  try {
    const webhookUrl = process.env.WEBHOOK_URL
    if (webhookUrl) {
      const normalizedWebhookUrl = webhookUrl.replace(/\/+$/, '')
      await bot.telegram.setWebhook(`${normalizedWebhookUrl}/telegraf/${bot.secretPathComponent()}`)
    } else {
      console.error('❌ WEBHOOK_URL is missing in environment variables!')
    }
  } catch (err) {
    console.error('❌ Failed to set Telegram Webhook:', err)
  }

  await performStartupCleanup()
  startPeriodicCleanup()

  try {
    setupRealtime()
  } catch (err) {
    console.error('[STARTUP ERROR] Socket.IO initialization failed:', err)
  }
}

// 12. Start Server
const PORT = process.env.PORT || 3001

function start() {
  return server.listen(PORT, '0.0.0.0', () => {
    // Initialize heavy services in the background so they don't block the port
    setImmediate(() => {
      initializeHeavyServices().catch((err) => console.error('[STARTUP ERROR]', err))
    })
  })
}

// 13. Graceful Shutdown
function shutdown() {
  clearInterval(cleanupInterval)
  const finishShutdown = () => {
    if (!require.cache[require.resolve('./db')]) {
      process.exit(0)
    }

    require('./db').destroy()
      .catch((err) => console.error('DB destroy error:', err))
      .finally(() => {
        process.exit(0)
      })
  }
  if (io) io.close(finishShutdown)
  else server.close(finishShutdown)
  
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout')
    process.exit(1)
  }, 10_000).unref()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]:', err);
});

// Start the application
start()

module.exports = { app, server, start }