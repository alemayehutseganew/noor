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

const invalidJwtSecrets = new Set([
  'your-secret-key',
  'default_secret',
  'dev-secret',
  'admin-secret',
]);

if (!process.env.JWT_SECRET || invalidJwtSecrets.has(process.env.JWT_SECRET)) {
  console.error('❌ CRITICAL ERROR: JWT_SECRET is missing or uses a known insecure fallback.');
}

if (!process.env.LINKS_ET_API_KEY) {
  console.error('❌ CRITICAL ERROR: LINKS_ET_API_KEY is required for Telebirr receipt verification.');
}

if (!process.env.TELEBIRR_RECEIVER_NUMBER) {
  console.error('❌ CRITICAL ERROR: TELEBIRR_RECEIVER_NUMBER is required for Telebirr receipt verification.');
}

const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  console.error('❌ CRITICAL ERROR: Missing environment variables:', missingVars.join(', '));
  if (process.env.NODE_ENV === 'production') {
    console.error('If running on Enzonic, ensure these are added in the Enzonic Dashboard.');
  }
} else {
  console.log('✅ All required environment variables are loaded successfully.');
}

const express = require('express')
const http = require('http')

const app = express()
app.get('/health', (req, res) => res.status(200).send('OK'))

const allowedOrigins = [
  'https://noor-one-beta.vercel.app',
  'https://noor.enzonic.dev',
  'http://localhost:5173'
]

app.use((req, res, next) => {
  const origin = req.headers.origin
  const isAllowedOrigin = !origin ||
    allowedOrigins.includes(origin) ||
    origin.endsWith('.vercel.app')

  if (isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin || allowedOrigins[0])
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Custom-Header, Upgrade-Insecure-Requests'
  )

  if (req.method === 'OPTIONS') {
    console.log(`[CORS] Intercepted OPTIONS preflight for: ${req.url}`)
    return res.status(200).json({ status: 'preflight ok' })
  }
  next()
})

app.use(express.json({ limit: '1mb' }))

const server = http.createServer(app)
let io

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

app.use((req, res, next) => {
  console.log(`[SERVER TRACE] Incoming request: ${req.method} ${req.url}`)
  next()
})

// --- App hardening ---
app.disable('x-powered-by')
app.set('trust proxy', 1) // Enzonic sits behind a proxy (needed for correct req.ip / rate limits)

// --- API routes ---
app.use('/api/auth', lazyRouter('./routes/auth'))
app.use('/api/rooms', lazyRouter('./routes/rooms'))
app.use('/api/payments', lazyRouter('./routes/payments'))
app.use('/api/wallet', lazyRouter('./routes/wallet'))
app.use('/api/users', lazyRouter('./routes/users'))
app.use('/api/admin', lazyRouter('./routes/admin'))
console.log('✅ API routes mounted: /api/auth, /api/rooms, /api/payments, /api/wallet, /api/users, /api/admin')

// --- 404 (must come after all routes) ---
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// --- Global error handler (must be the LAST middleware) ---
// Express forwards errors from express.json() and any route via next(err) to this handler.
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

// --- HTTP + Socket.io ---
function setupRealtime() {
  const { setupSocket } = require('./sockets/gameHandler')
  io = setupSocket(server)
  Object.assign(io.engine.opts.cors, {
    origin: [
      'https://noor-one-beta.vercel.app',
      'https://ked-seven.vercel.app',
      'https://sale-green.vercel.app'
    ],
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
          console.log('✅ Redis adapter connected for Socket.io scaling')
        })
        .catch((err) => console.error('❌ Redis adapter error:', err))
    } catch (err) {
      console.log('⚠️ Redis packages not installed. Using in-memory adapter.')
    }
  } else {
    console.log('⚠️ REDIS_URL not set. Using in-memory Socket.io adapter.')
  }
}

const PORT = process.env.PORT || 3001

async function initializeHeavyServices() {
  try {
    const { bot } = require('./bot/index')
    app.post(`/telegraf/${bot.secretPathComponent()}`, (req, res) => {
      res.sendStatus(200)
      bot.handleUpdate(req.body).catch((err) => console.error('[WEBHOOK ERROR]', err))
    })

    const webhookUrl = process.env.WEBHOOK_URL
    if (webhookUrl) {
      bot.telegram.setWebhook(`${webhookUrl.replace(/\/+$/, '')}/telegraf/${bot.secretPathComponent()}`)
        .then(() => console.log('✅ Telegram Webhook set successfully'))
        .catch((err) => console.error('❌ Failed to set Telegram Webhook:', err))
    }
  } catch (err) {
    console.error('[STARTUP ERROR] Bot initialization failed:', err)
  }

  try {
    setupRealtime()
  } catch (err) {
    console.error('[STARTUP ERROR] Socket.IO initialization failed:', err)
  }
}

function start() {
  return server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ SERVER IS LISTENING ON PORT ${PORT}`)
    setImmediate(() => {
      initializeHeavyServices().catch((err) => console.error('[STARTUP ERROR]', err))
    })
  })
}

// --- Graceful shutdown (important for real-money: avoid mid-transaction kills) ---
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`)
  const finishShutdown = () => {
    if (!require.cache[require.resolve('./db')]) {
      console.log('👋 Shutdown complete')
      process.exit(0)
      return
    }

    require('./db').destroy()
      .catch((err) => console.error('DB destroy error:', err))
      .finally(() => {
        console.log('👋 Shutdown complete')
        process.exit(0)
      })
  }
  if (io) io.close(finishShutdown)
  else server.close(finishShutdown)
  // Hard exit if something hangs
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout')
    process.exit(1)
  }, 10_000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]:', err);
});

start()

module.exports = { app, server, start }