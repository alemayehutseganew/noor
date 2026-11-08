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
  process.exit(1);
}

if (!process.env.LINKS_ET_API_KEY) {
  console.error('❌ CRITICAL ERROR: LINKS_ET_API_KEY is required for Telebirr receipt verification.');
  process.exit(1);
}

if (!process.env.TELEBIRR_RECEIVER_NUMBER) {
  console.error('❌ CRITICAL ERROR: TELEBIRR_RECEIVER_NUMBER is required for Telebirr receipt verification.');
  process.exit(1);
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
const cors = require('cors')
const http = require('http')
const authRoutes = require('./routes/auth')
const roomRoutes = require('./routes/rooms')
const paymentsRoutes = require('./routes/payments')
const walletRoutes = require('./routes/wallet')
const usersRoutes = require('./routes/users')
const adminRoutes = require('./routes/admin')
const db = require('./db')
const { setupSocket } = require('./sockets/gameHandler')
const { bot } = require('./bot/index')

const app = express()
app.use((req, res, next) => {
  console.log(`[SERVER TRACE] Incoming request: ${req.method} ${req.url}`)
  next()
})

// --- App hardening ---
app.disable('x-powered-by')
app.set('trust proxy', 1) // Enzonic sits behind a proxy (needed for correct req.ip / rate limits)

// --- CORS ---
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://noor-one-beta.vercel.app',
  'https://noor.enzonic.dev',
  process.env.FRONTEND_URL?.replace(/\/+$/, '')
].filter(Boolean)

const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server / curl / Telegram WebView requests with no Origin header
    if (!origin) return callback(null, true)
    if (allowedOrigins.includes(origin)) return callback(null, true)
    // Allow Vercel preview deployments (e.g. frontend-git-branch.vercel.app)
    if (origin.endsWith('.vercel.app')) return callback(null, true)
    console.log('Blocked by CORS:', origin)
    return callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-init-data', 'x-admin-seed-token']
}

// cors() already answers OPTIONS preflight requests — no app.options() needed.
app.use(cors(corsOptions))
app.use(express.json({ limit: '1mb' }))

app.post(`/telegraf/${bot.secretPathComponent()}`, async (req, res) => {
  console.log('[SERVER TRACE] Telegram update received')
  res.sendStatus(200)

  try {
    await bot.handleUpdate(req.body)
  } catch (err) {
    console.error('[WEBHOOK ERROR] Failed to process update:', err)
  }
})

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// --- API routes ---
app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/payments', paymentsRoutes)
app.use('/api/wallet', walletRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/admin', adminRoutes)
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
const server = http.createServer(app)
const io = setupSocket(server)
app.set('io', io)

// Optional Redis adapter for horizontal scaling
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

const PORT = process.env.PORT || 3001

async function start() {
  console.log('⏳ Running database migrations...')
  try {
    await db.migrate.latest()
    console.log('✅ Database migrations completed successfully.')
  } catch (err) {
    console.error('❌ MIGRATION FAILED:', err)
    // Do NOT process.exit(1) here. Let the server start so we can see the real error.
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`)

    const webhookUrl = process.env.WEBHOOK_URL
    if (webhookUrl) {
      bot.telegram.setWebhook(`${webhookUrl.replace(/\/+$/, '')}/telegraf/${bot.secretPathComponent()}`)
        .then(() => console.log('✅ Telegram Webhook set successfully'))
        .catch((err) => console.error('❌ Failed to set Telegram Webhook:', err))
    }
  })
}

// --- Graceful shutdown (important for real-money: avoid mid-transaction kills) ---
function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`)
  io.close(() => {
    server.close(() => {
      db.destroy()
        .catch((err) => console.error('DB destroy error:', err))
        .finally(() => {
          console.log('👋 Shutdown complete')
          process.exit(0)
        })
    })
  })
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
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

start()

module.exports = { app, server, start }