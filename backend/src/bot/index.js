const { Telegraf, Markup } = require('telegraf')
const db = require('../db')
const { parseTelebirrSMS, creditVerifiedDeposit, PaymentVerificationError } = require('../services/paymentService')

const API_BASE = process.env.API_URL || 'http://localhost:3001'
const userStates = {}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)

// Safe error handler for all bot actions
bot.catch((err, ctx) => {
  console.error(`[BOT] Error for ${ctx.updateType}:`, err.message)
})

// Register menu and commands (safely)
try {
  bot.telegram.setChatMenuButton({
    menu_button: { type: 'commands' }
  }).then(() => console.log('✅ Menu button forced to COMMANDS mode')).catch(console.error)

  bot.telegram.setMyCommands([
    { command: 'register', description: 'Register your phone number' },
    { command: 'start', description: 'Restart' },
    { command: 'menu', description: 'Menu' },
    { command: 'play', description: 'Play' },
    { command: 'balance', description: 'Balance' },
    { command: 'deposit', description: 'Deposit' },
    { command: 'withdraw', description: 'Withdraw' },
    { command: 'help', description: 'How to play the game' }
    
  ]).then(() => console.log('✅ Commands registered')).catch(console.error)
} catch (e) {
  console.error('Bot setup error:', e)
}

// Get user's language
async function getUserLanguage(telegramId) {
  try {
    const user = await db('users').where({ telegram_id: telegramId }).first()
    return user?.language || 'en'
  } catch (e) {
    return 'en'
  }
}

// Main menu
function getMainMenu(lang = 'en') {
  const texts = {
    en: { play: '🎮 Play Game', balance: '💰 Check Balance', deposit: '💳 Deposit', withdraw: '💸 Withdraw', room: '🏠 My Room', help: '❓ Help' },
    am: { play: '🎮 ጨዋታ ይጫወቱ', balance: '💰 ቀሪ ሂሳብ', deposit: '💳 ገንዘብ ያስገቡ', withdraw: '💸 ገንዘብ ያውጡ', room: '🏠 ክፍሌ', help: '❓ እርዳታ' }
  }
  const t = texts[lang] || texts.en
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.play, web_app: { url: process.env.FRONTEND_URL || 'https://noor-one-beta.vercel.app' } }],
        [{ text: t.balance, callback_data: 'menu_balance' }, { text: t.deposit, callback_data: 'menu_deposit' }],
        [{ text: t.withdraw, callback_data: 'menu_withdraw' }, { text: t.room, callback_data: 'menu_room' }],
        [{ text: t.help, callback_data: 'menu_help' }]
      ]
    }
  }
}

// /start command
bot.start((ctx) => {
  ctx.reply('Please select your language / እባክዎ ቋንቋ ይምረጡ:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🇬🇧 English', callback_data: 'lang_en' }, { text: '🇪🇹 አማርኛ', callback_data: 'lang_am' }]
      ]
    }
  }).catch(e => console.error('Start error:', e))
})

// Language selection
bot.action('lang_en', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try { await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'en' }) } catch (e) {}
  ctx.reply('Language set to English.', getMainMenu('en')).catch(() => {})
})

bot.action('lang_am', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try { await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'am' }) } catch (e) {}
  ctx.reply('ቋንቋ ወደ አማርኛ ተቀይሯል።', getMainMenu('am')).catch(() => {})
})

// /menu command
bot.command('menu', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id)
  ctx.reply('Main menu:', getMainMenu(lang)).catch(() => {})
})

// /play command
bot.command('play', (ctx) => {
  ctx.reply('Tap the button below to launch the game:', {
    reply_markup: { inline_keyboard: [[{ text: '🎰 Play Bingo', web_app: { url: process.env.FRONTEND_URL || 'https://noor-one-beta.vercel.app' } }]] }
  }).catch(() => {})
})

// /balance command
bot.command('balance', async (ctx) => {
  try {
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (user) ctx.reply(`💰 Your current balance is: ETB ${Number(user.wallet_balance || 0).toFixed(2)}`)
    else ctx.reply('User not found. Please open the Mini App first to register.')
  } catch (e) {
    ctx.reply('❌ Failed to fetch balance.').catch(() => {})
  }
})

// /help command
bot.command('help', (ctx) => {
  ctx.reply('📖 How to Play GOBINGO\n\n1. Open the Mini App.\n2. Select a stake.\n3. Choose a card.\n4. Wait for game start.\n5. Tap numbers when called.\n6. Complete a line and press BINGO!\n\nGood luck!').catch(() => {})
})

bot.command('register', (ctx) => {
  return ctx.reply(
    'To complete your registration, please share your phone number:',
    Markup.keyboard([
      [Markup.button.contactRequest('📱 Share Phone Number')]
    ]).resize().oneTime()
  )
})

// /deposit command
bot.command('deposit', async (ctx) => {
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  ctx.reply('💳 To Deposit:\n\n👤 Name: Kenaw Nuru Muhabe\n📱 Telebirr: 0989002307\n\n1. Open your Telebirr app\n2. Send money to the number above\n3. Copy the SMS you receive\n\n👇 Now paste the full SMS here:').catch(() => {})
})

// /withdraw command
bot.command('withdraw', async (ctx) => {
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  ctx.reply('Enter the amount you want to withdraw (Minimum 100 ETB):').catch(() => {})
})

// Menu actions
bot.action('menu_balance', async (ctx) => {
  try {
    await ctx.answerCbQuery().catch(() => {})
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (!user) return ctx.reply('User not found. Please open the Mini App first to register.')
    ctx.reply(`💰 Your current balance is: ETB ${Number(user.wallet_balance || 0).toFixed(2)}`).catch(() => {})
  } catch (err) {
    console.error('Balance Error:', err)
    ctx.reply('❌ Failed to fetch balance.').catch(() => {})
  }
})

bot.action('menu_deposit', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  const msg = '💳 To Deposit:\n\n👤 Name: Kenaw Nuru Muhabe\n📱 Telebirr: 0989002307\n\n1. Open your Telebirr app\n2. Send money to the number above\n3. Copy the SMS you receive\n\n👇 Now paste the full SMS here:'
  ctx.reply(msg).catch(() => {})
})

bot.action('menu_withdraw', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  ctx.reply('Enter the amount you want to withdraw (Minimum 100 ETB):').catch(() => {})
})

bot.action('menu_room', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  ctx.reply('To join a room, please open the Mini App and select a stake.', {
    reply_markup: { inline_keyboard: [[{ text: 'Open Lobby', web_app: { url: process.env.FRONTEND_URL || 'https://noor-one-beta.vercel.app' } }]] }
  }).catch(() => {})
})

bot.action('menu_help', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  ctx.reply('📖 How to Play GOBINGO\n\n1. Open the Mini App.\n2. Select a stake.\n3. Choose a card.\n4. Wait for game start.\n5. Tap numbers when called.\n6. Complete a line and press BINGO!\n\nGood luck!').catch(() => {})
})

// Text handler for deposit/withdraw flows
bot.on('text', async (ctx) => {
  try {
    const state = userStates[ctx.from.id]
    if (!state) return

    if (state === 'WAITING_FOR_RECEIPT') {
      const smsText = ctx.message.text
      const parsedFromSMS = parseTelebirrSMS(smsText)
      if (!parsedFromSMS) {
        return ctx.reply('❌ Invalid receipt format. Please copy the entire SMS you received from Telebirr and paste it here.').catch(() => {})
      }

      const user = await db('users').where({ telegram_id: ctx.from.id }).first()
      if (!user) {
        return ctx.reply('❌ User not found. Please open the Mini App first to register.').catch(() => {})
      }

      let deposit
      try {
        deposit = await creditVerifiedDeposit({
          userId: user.id,
          reference: parsedFromSMS.transactionId,
          amount: parsedFromSMS.amount,
        })
      } catch (err) {
        if (err.code === '23505') {
          return ctx.reply('❌ This Telebirr receipt has already been used.').catch(() => {})
        }
        const message = err instanceof PaymentVerificationError
          ? err.message
          : 'Unable to process this deposit.'
        return ctx.reply(`❌ Verification failed: ${message}`).catch(() => {})
      }

      ctx.reply(`✅ Receipt for ETB ${deposit.amount.toFixed(2)} verified and submitted for admin approval. Your wallet will be credited after approval.`).catch(() => {})
      delete userStates[ctx.from.id]
      return
    }

    if (state === 'WAITING_FOR_WITHDRAW_AMOUNT') {
      const amount = Number(ctx.message.text)
      if (isNaN(amount) || amount < 100) {
        return ctx.reply('❌ Invalid amount. Minimum withdrawal is 100 ETB.').catch(() => {})
      }

      const user = await db('users').where({ telegram_id: ctx.from.id }).first()
      if (!user) return ctx.reply('❌ User not found.').catch(() => {})

      if (Number(user.wallet_balance) < amount) {
        return ctx.reply(`❌ Insufficient balance. You only have ETB ${Number(user.wallet_balance).toFixed(2)}.`).catch(() => {})
      }

      await db.transaction(async (trx) => {
        // 1. Deduct balance immediately
        await trx('users')
          .where({ id: user.id })
          .decrement('wallet_balance', amount);

        // 2. Insert the pending withdrawal
        await trx('payments').insert({
          user_id: user.id,
          amount: amount,
          provider: 'telebirr',
          status: 'pending',
          type: 'withdrawal',
          transaction_reference: `WD-${Date.now()}-${user.id}`
        });
      })

      ctx.reply(`⏳ Your withdrawal request for ETB ${amount.toFixed(2)} is pending admin approval.`).catch(() => {})
      delete userStates[ctx.from.id]
      return
    }
  } catch (err) {
    console.error('Text Handler Error:', err)
    ctx.reply('❌ Failed to process your request. Please try again.').catch(() => {})
  }
})

bot.on('contact', async (ctx) => {
  try {
    const contact = ctx.message.contact
    const telegramId = ctx.from.id
    const phoneNumber = contact.phone_number

    const updated = await db('users')
      .where({ telegram_id: telegramId })
      .update({ phone_number: phoneNumber })

    if (updated) {
      await ctx.reply(
        `✅ Phone number saved: ${phoneNumber}\n\nYou can now use the bot normally.`,
        Markup.removeKeyboard()
      )
    } else {
      await db('users').insert({
        telegram_id: telegramId,
        first_name: ctx.from.first_name || 'Player',
        phone_number: phoneNumber,
        wallet_balance: 0
      })
      await ctx.reply(
        `✅ Registration complete! Phone number: ${phoneNumber}`,
        Markup.removeKeyboard()
      )
    }
  } catch (err) {
    console.error('Contact save error:', err)
    await ctx.reply('❌ Failed to save your contact. Please try again.')
  }
})

// Launch the bot
function launch() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log('TELEGRAM_BOT_TOKEN not set, skipping bot launch')
    return
  }
  bot.launch().then(() => console.log('✅ Telegram bot launched')).catch((e) => console.error('Bot launch error:', e))
  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

module.exports = { bot, launch, getMainMenu }