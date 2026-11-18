const { Telegraf, Markup } = require('telegraf')
const db = require('../db')

const userStates = {}
const DEFAULT_FRONTEND_URL = 'https://ked-seven.vercel.app'
const SUPPORT_TEXT = '\n\nFor more support: https://t.me/Knoor1221'

const botTranslations = {
  en: {
    selectLanguage: '🌐 <b>Please select your language:</b>\n\n<i>Choose your preferred language to continue.</i>',
    english: '🇬🇧 English',
    amharic: '🇪🇹 አማርኛ',
    player: 'Player',
    languageSet: 'Language set to English.',
    mainMenu: '🏠 <b>Main Menu</b>\n\n<i>Select an option below to continue playing.</i>',
    playGame: '🎮 Play Game',
    checkBalance: '💰 Check Balance',
    deposit: '💳 Deposit',
    withdraw: '💸 Withdraw',
    myRoom: '🏠 My Room',
    help: '❓ Help',
    launchPrompt: '🎮 <b>Ready to play?</b>\n\nSelect a stake amount below to enter the game.',
    playBingo: '🎰 Play Bingo',
    balance: '💰 <b>Your Current Balance</b>\n\n<code>ETB {{amount}}</code>',
    userNotFound: '⚠️ <b>User Not Found</b>\n\nPlease open the Mini App first to register.',
    balanceFailed: '❌ Failed to fetch balance.',
    helpMessage: '<b>📖 Game Rules & Help</b>\n\n1️⃣ Open the Mini App.\n2️⃣ Select a stake.\n3️⃣ Choose a card (1-400).\n4️⃣ Wait for the countdown.\n5️⃣ Tap numbers when called.\n6️⃣ Complete a line and press <b>BINGO!</b>\n\n<i>Good luck!</i>',
    registerPrompt: 'To complete your registration, please share your phone number:',
    sharePhone: '📱 Share Phone Number',
    depositInstructions: '💳 <b>Deposit Funds</b>\n\n👤 Name: <b>{{name}}</b>\n📱 Telebirr: <code>{{phone}}</code>\n\n1️⃣ Open your Telebirr app.\n2️⃣ Send money to the number above.\n3️⃣ Copy the SMS you receive.\n\n👇 <b>Paste the full SMS here:</b>',
    withdrawPrompt: '💸 <b>Withdraw Funds</b>\n\nEnter the amount you want to withdraw (Minimum 100 ETB):\n\n<i>Your request will be processed by an admin.</i>',
    roomPrompt: 'To join a room, please open the Mini App and select a stake.',
    invalidReference: 'Could not find a valid transaction number in that SMS.',
    invalidReceipt: '❌ Invalid receipt format. Please copy the entire SMS you received from Telebirr and paste it here.',
    receiptUsed: '❌ This Telebirr receipt has already been used.',
    unableDeposit: 'Unable to process this deposit.',
    verificationFailed: '❌ <b>Verification failed:</b> {{error}}',
    depositSubmitted: '✅ <b>Receipt Verified!</b>\n\nYour deposit of <code>ETB {{amount}}</code> has been submitted for admin approval.',
    invalidWithdrawal: '❌ Invalid amount. Minimum withdrawal is 100 ETB.',
    insufficientBalance: '❌ Insufficient balance. You only have ETB {{amount}}.',
    withdrawalPending: '⏳ <b>Withdrawal Requested</b>\n\nYour request for <code>ETB {{amount}}</code> is pending admin approval.',
    requestFailed: '❌ Failed to process your request. Please try again.',
    alreadyRegistered: '✅ You are already registered.',
    phoneSaved: '✅ Phone number saved: {{phone}}\n\nYou can now use the bot normally.',
    registrationComplete: '✅ Registration complete! Phone number: {{phone}}',
    contactFailed: '❌ Failed to save your contact. Please try again.',
    inviteEarn: '🎉 <b>Invite & Earn 5%</b>\n\nShare your unique link with friends. When they win a game, you get 5% of their prize!\n\n🔗 <b>Your Link:</b>\n<code>{{link}}</code>\n\n💰 <i>Withdraw your earnings once you reach 1,000 ETB!</i>',
    selectStake: '<i>Select a stake to play:</i>',
    shareGroup: '📢 Share to Group/Channel',
    shareText: 'Join me on GoBingo and win big! 🎰'
  },
  am: {
    selectLanguage: '🌐 <b>እባክዎ ቋንቋዎን ይምረጡ፦</b>\n\n<i>ለመቀጠል የሚመርጡትን ቋንቋ ይምረጡ።</i>',
    english: '🇬🇧 እንግሊዝኛ',
    amharic: '🇪🇹 አማርኛ',
    player: 'ተጫዋች',
    languageSet: 'ቋንቋ ወደ አማርኛ ተቀይሯል።',
    mainMenu: '🏠 <b>ዋና ምናሌ</b>\n\n<i>መጫወትዎን ለመቀጠል ከታች አማራጭ ይምረጡ።</i>',
    playGame: '🎮 ጨዋታ ይጫወቱ',
    checkBalance: '💰 ቀሪ ሂሳብ ይመልከቱ',
    deposit: '💳 ገንዘብ ያስገቡ',
    withdraw: '💸 ገንዘብ ያውጡ',
    myRoom: '🏠 ክፍሌ',
    help: '❓ እርዳታ',
    launchPrompt: '🎮 <b>ለመጫወት ዝግጁ ነዎት?</b>\n\nወደ ጨዋታው ለመግባት ከታች የውለታ መጠን ይምረጡ።',
    playBingo: '🎰 ቢንጎ ይጫወቱ',
    balance: '💰 <b>የአሁኑ ቀሪ ሂሳብዎ</b>\n\n<code>{{amount}} ብር</code>',
    userNotFound: '⚠️ <b>ተጠቃሚው አልተገኘም</b>\n\nለመመዝገብ መጀመሪያ ሚኒ አፑን ይክፈቱ።',
    balanceFailed: '❌ ቀሪ ሂሳብን ማምጣት አልተሳካም።',
    helpMessage: '<b>📖 የጨዋታ ህጎች እና እርዳታ</b>\n\n1️⃣ ሚኒ አፑን ይክፈቱ።\n2️⃣ የውለታ መጠን ይምረጡ።\n3️⃣ ካርድ (1-400) ይምረጡ።\n4️⃣ ቆጠራውን ይጠብቁ።\n5️⃣ ቁጥሮች ሲጠሩ ይንኩ።\n6️⃣ መስመር አሟልተው <b>BINGO!</b> ይጫኑ።\n\n<i>መልካም ዕድል!</i>',
    registerPrompt: 'ምዝገባዎን ለማጠናቀቅ እባክዎ ስልክ ቁጥርዎን ያጋሩ፦',
    sharePhone: '📱 ስልክ ቁጥር ያጋሩ',
    depositInstructions: '💳 <b>ገንዘብ ያስገቡ</b>\n\n👤 ስም፦ <b>{{name}}</b>\n📱 ቴሌብር፦ <code>{{phone}}</code>\n\n1️⃣ የቴሌብር መተግበሪያዎን ይክፈቱ።\n2️⃣ ከላይ ወደተጠቀሰው ቁጥር ገንዘብ ይላኩ።\n3️⃣ የደረሰዎትን ኤስኤምኤስ ኮፒ ያድርጉ።\n\n👇 <b>ሙሉውን ኤስኤምኤስ እዚህ ይለጥፉ፦</b>',
    withdrawPrompt: '💸 <b>ገንዘብ ያውጡ</b>\n\nማውጣት የሚፈልጉትን መጠን ያስገቡ (ዝቅተኛው 100 ብር)፦\n\n<i>ጥያቄዎ በአስተዳዳሪ ይከናወናል።</i>',
    roomPrompt: 'ክፍል ለመቀላቀል ሚኒ አፑን ከፍተው የውለታ መጠን ይምረጡ።',
    invalidReference: 'በዚያ ኤስኤምኤስ ውስጥ ትክክለኛ የግብይት ቁጥር አልተገኘም።',
    invalidReceipt: '❌ የደረሰኙ ቅርጸት ትክክል አይደለም። ከቴሌብር የተቀበሉትን ሙሉ ኤስኤምኤስ ኮፒ አድርገው እዚህ ይለጥፉ።',
    receiptUsed: '❌ ይህ የቴሌብር ደረሰኝ ከዚህ በፊት ጥቅም ላይ ውሏል።',
    unableDeposit: 'ይህን ገንዘብ ማስገባት አልተቻለም።',
    verificationFailed: '❌ <b>ማረጋገጥ አልተሳካም፦</b> {{error}}',
    depositSubmitted: '✅ <b>ደረሰኙ ተረጋግጧል!</b>\n\nየ<code>{{amount}} ብር</code> ተቀማጭዎ ለአስተዳዳሪ ማጽደቅ ተልኳል።',
    invalidWithdrawal: '❌ የገባው መጠን ትክክል አይደለም። ዝቅተኛው የማውጣት መጠን 100 ብር ነው።',
    insufficientBalance: '❌ በቂ ቀሪ ሂሳብ የለም። ያለዎት {{amount}} ብር ብቻ ነው።',
    withdrawalPending: '⏳ <b>የማውጣት ጥያቄ ተልኳል</b>\n\nየ<code>{{amount}} ብር</code> ጥያቄዎ የአስተዳዳሪ ማጽደቅ በመጠባበቅ ላይ ነው።',
    requestFailed: '❌ ጥያቄዎን ማስኬድ አልተሳካም። እባክዎ እንደገና ይሞክሩ።',
    alreadyRegistered: '✅ አስቀድመው ተመዝግበዋል።',
    phoneSaved: '✅ ስልክ ቁጥሩ ተቀምጧል፦ {{phone}}\n\nአሁን ቦቱን በመደበኛው መንገድ መጠቀም ይችላሉ።',
    registrationComplete: '✅ ምዝገባው ተጠናቋል! ስልክ ቁጥር፦ {{phone}}',
    contactFailed: '❌ የእውቂያ መረጃዎን ማስቀመጥ አልተሳካም። እባክዎ እንደገና ይሞክሩ።',
    inviteEarn: '🎉 <b>ይጋብዙ እና 5% ያግኙ</b>\n\nልዩ ሊንክዎን ለጓደኞችዎ ያጋሩ። እነሱ ሲያሸንፉ የሽልማታቸውን 5% ያገኛሉ!\n\n🔗 <b>የእርስዎ ሊንክ፦</b>\n<code>{{link}}</code>\n\n💰 <i>ገቢዎን 1,000 ብር ሲደርስ ማውጣት ይችላሉ!</i>',
    selectStake: '<i>ለመጫወት የውለታ መጠን ይምረጡ፦</i>',
    shareGroup: '📢 ለቡድን/ቻናል አጋራ',
    shareText: 'በዮጋቢንጎ ይቀላለቁኝ እና ትልቅ ያሸንፉ! 🎰'
  },
}

const botToken = process.env.TELEGRAM_BOT_TOKEN
if (!botToken) {
  console.error('❌ TELEGRAM_BOT_TOKEN is missing!')
  throw new Error('TELEGRAM_BOT_TOKEN is required to initialize the Telegram bot.')
}

const bot = new Telegraf(botToken)

bot.catch((err, ctx) => {
  console.error(`❌ [BOT ERROR] for ${ctx.updateType}:`, err)
})

// GLOBAL MIDDLEWARE: Clear state on any command to prevent state machine locks
bot.use((ctx, next) => {
  if (ctx.message?.text?.startsWith('/') && ctx.from?.id !== undefined) {
    delete userStates[ctx.from.id]
  }
  return next()
})

function getStakeButtons(frontendUrl) {
  const baseUrl = frontendUrl.replace(/\/$/, '')
  return [
    [
      { text: '🎮 Play 10 ETB', web_app: { url: `${baseUrl}/select-card?stake=10` } },
      { text: '🎮 Play 50 ETB', web_app: { url: `${baseUrl}/select-card?stake=50` } }
    ],
    [
      { text: '🎮 Play 100 ETB', web_app: { url: `${baseUrl}/select-card?stake=100` } }
    ]
  ]
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function botText(lang, key, values = {}) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, () => escapeHtml(value)),
    botTranslations[lang]?.[key] || botTranslations.en[key]
  )
}

try {
  bot.telegram.setChatMenuButton({
    menu_button: { type: 'commands' }
  }).catch(console.error)

  bot.telegram.setMyCommands([
    { command: 'start', description: 'start' },
    { command: 'play', description: 'play' },
    { command: 'invite', description: 'invite' },
    { command: 'menu', description: 'menu' },
    { command: 'balance', description: 'balance' },
    { command: 'deposit', description: 'deposit' },
    { command: 'withdraw', description: 'withdraw' },
    { command: 'register', description: 'register' },
    { command: 'help', description: 'help' }
  ]).catch(console.error)
} catch (e) {
  console.error('Bot setup error:', e)
}

async function getUserLanguage(ctx) {
  try {
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (user?.language === 'en' || user?.language === 'am') return user.language
  } catch (e) {
    console.error('Failed to load user language:', e.message)
  }
  return ctx.from?.language_code?.toLowerCase().startsWith('am') ? 'am' : 'en'
}

function getMainMenu(lang = 'en') {
  const t = botTranslations[lang] || botTranslations.en
  const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL
  return {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        ...getStakeButtons(frontendUrl),
        [{ text: t.checkBalance, callback_data: 'menu_balance' }, { text: t.deposit, callback_data: 'menu_deposit' }],
        [{ text: t.withdraw, callback_data: 'menu_withdraw' }, { text: t.help, callback_data: 'menu_help' }],
        [{ text: '👥 Invite Friends', callback_data: 'show_invite' }]
      ]
    }
  }
}

async function showInvite(ctx) {
  try {
    const lang = await getUserLanguage(ctx)

    const username = ctx.from?.username || null
    const telegramId = ctx.from?.id
    let startPayload = ''

    if (username) {
      startPayload = `u_${username}`
    } else {
      startPayload = `i_${telegramId}`
    }

    const botUsername = (process.env.BOT_USERNAME || 'GoBingoBot').replace(/^@/, '')
    const refLink = `https://t.me/${botUsername}?start=${encodeURIComponent(startPayload)}`

    const shareText = botText(lang, 'shareText')
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`
    const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL
    console.log('[BOT] showInvite rendered with stake buttons')
    return await ctx.reply(`${botText(lang, 'inviteEarn', { link: refLink })}\n\n${botText(lang, 'selectStake')}${SUPPORT_TEXT}`, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: botText(lang, 'shareGroup'), url: shareUrl }],
          ...getStakeButtons(frontendUrl)
        ]
      }
    })
  } catch (err) {
    console.error('[INVITE] Crash:', err)
    return ctx.reply(`❌ Error: ${escapeHtml(err.message)}`, { parse_mode: 'HTML' }).catch(() => {})
  }
}

bot.start(async (ctx) => {
  const lang = await getUserLanguage(ctx)
  const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL
  ctx.reply(botText(lang, 'selectLanguage') + SUPPORT_TEXT, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🇬🇧 English', callback_data: 'lang_en' },
          { text: '🇪🇹 አማርኛ', callback_data: 'lang_am' }
        ],
        ...getStakeButtons(frontendUrl),
        [
          { text: '👥 Invite Friends & Earn 5%', callback_data: 'show_invite' }
        ]
      ]
    }
  }).catch(e => console.error('Start error:', e))
})

bot.command('menu', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  ctx.reply(botText(lang, 'mainMenu') + SUPPORT_TEXT, getMainMenu(lang)).catch(() => {})
})

bot.command(['invite', 'referral'], async (ctx) => {
  delete userStates[ctx.from.id]
  await showInvite(ctx)
})

bot.command('play', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL
  ctx.reply(botText(lang, 'launchPrompt') + SUPPORT_TEXT, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: getStakeButtons(frontendUrl) }
  }).catch(() => {})
})

bot.command('balance', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  try {
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (user) ctx.reply(botText(lang, 'balance', { amount: Number(user.wallet_balance || 0).toFixed(2) }) + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
    else ctx.reply(botText(lang, 'userNotFound') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
  } catch (e) {
    ctx.reply(botText(lang, 'balanceFailed') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
  }
})

bot.command('help', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  ctx.reply(botText(lang, 'helpMessage') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
})

bot.command('register', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.reply(
    botText(lang, 'registerPrompt') + SUPPORT_TEXT,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.keyboard([
        [Markup.button.contactRequest(botText(lang, 'sharePhone'))]
      ]).resize().oneTime().reply_markup
    }
  )
})

bot.command('deposit', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  ctx.reply(botText(lang, 'depositInstructions', {
    name: process.env.TELEBIRR_RECEIVER_NAME,
    phone: process.env.TELEBIRR_RECEIVER_NUMBER,
  }) + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
})

bot.command('withdraw', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  ctx.reply(botText(lang, 'withdrawPrompt') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
})

bot.action('show_invite', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  return showInvite(ctx)
})

bot.action('lang_en', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try { await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'en' }) } catch (e) {}
  ctx.reply(botText('en', 'languageSet'), getMainMenu('en')).catch(() => {})
})

bot.action('lang_am', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try { await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'am' }) } catch (e) {}
  ctx.reply(botText('am', 'languageSet'), getMainMenu('am')).catch(() => {})
})

bot.action('menu_balance', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  try {
    await ctx.answerCbQuery().catch(() => {})
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (!user) return ctx.reply(botText(lang, 'userNotFound') + SUPPORT_TEXT, { parse_mode: 'HTML' })
    ctx.reply(botText(lang, 'balance', { amount: Number(user.wallet_balance || 0).toFixed(2) }) + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
  } catch (err) {
    console.error('Balance Error:', err)
    ctx.reply(botText(lang, 'balanceFailed') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
  }
})

bot.action('menu_deposit', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  const msg = botText(lang, 'depositInstructions', {
    name: process.env.TELEBIRR_RECEIVER_NAME,
    phone: process.env.TELEBIRR_RECEIVER_NUMBER,
  })
  ctx.reply(msg + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
})

bot.action('menu_withdraw', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  ctx.reply(botText(lang, 'withdrawPrompt') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
})

bot.action('menu_room', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  const frontendUrl = process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL
  await ctx.answerCbQuery().catch(() => {})
  ctx.reply(botText(lang, 'roomPrompt') + SUPPORT_TEXT, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: getStakeButtons(frontendUrl) }
  }).catch(() => {})
})

bot.action('menu_help', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.answerCbQuery().catch(() => {})
  ctx.reply(botText(lang, 'helpMessage') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
})

bot.on('inline_query', async (ctx) => {
  const query = ctx.inlineQuery.query.trim().replace(/^start=/, '')
  const referralRef = query.startsWith('@') || /^\d+$/.test(query) ? query : null
  if (!referralRef) return ctx.answerInlineQuery([], { cache_time: 0 })

  const startPayload = referralRef.startsWith('@') ? `u_${referralRef.slice(1)}` : `i_${referralRef}`
  const botUsername = (process.env.BOT_USERNAME || 'GoBingoBot').replace(/^@/, '')
  const refLink = `https://t.me/${botUsername}?start=${encodeURIComponent(startPayload)}`

  await ctx.answerInlineQuery([{
    type: 'article',
    id: 'Gobingo-referral',
    title: 'Play GoBingo!',
    description: 'Tap to join the game and play.',
    input_message_content: {
      message_text: `🎰 Join me on GoBingo and play!\n${refLink}`,
      disable_web_page_preview: true
    },
    reply_markup: {
      inline_keyboard: [[{ text: '🎮 Play Now', url: refLink }]],
    },
  }], { cache_time: 0, is_personal: true })
})

bot.on('contact', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  try {
    const contact = ctx.message.contact
    const telegramId = ctx.from.id
    const phoneNumber = contact.phone_number

    const existingUser = await db('users').where({ telegram_id: telegramId }).first()
    if (existingUser && existingUser.phone_number) {
      await ctx.reply(
        botText(lang, 'alreadyRegistered') + SUPPORT_TEXT,
        { parse_mode: 'HTML', reply_markup: Markup.removeKeyboard().reply_markup }
      )
      return
    }

    const updated = await db('users')
      .where({ telegram_id: telegramId })
      .update({ phone_number: phoneNumber })

    if (updated) {
      await ctx.reply(
        botText(lang, 'phoneSaved', { phone: phoneNumber }) + SUPPORT_TEXT,
        { parse_mode: 'HTML', reply_markup: Markup.removeKeyboard().reply_markup }
      )
    } else {
      await db('users').insert({
        telegram_id: telegramId,
        first_name: ctx.from.first_name || botText(lang, 'player'),
        phone_number: phoneNumber,
        wallet_balance: 0
      })
      await ctx.reply(
        botText(lang, 'registrationComplete', { phone: phoneNumber }) + SUPPORT_TEXT,
        { parse_mode: 'HTML', reply_markup: Markup.removeKeyboard().reply_markup }
      )
    }
  } catch (err) {
    console.error('Contact save error:', err)
    await ctx.reply(botText(lang, 'contactFailed') + SUPPORT_TEXT, { parse_mode: 'HTML' })
  }
})

// IMPORTANT: This MUST be the last handler in the file
bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text

    // STRICT GUARD: Ignore commands entirely
    if (text && text.startsWith('/')) {
      return
    }

    const lang = await getUserLanguage(ctx)
    const state = userStates[ctx.from.id]
    if (!state) return

    if (state === 'WAITING_FOR_RECEIPT') {
      const {
        parseTelebirrSMS,
        extractTelebirrReceipt,
        creditVerifiedDeposit,
        PaymentVerificationError,
      } = require('../services/paymentService')
      const smsText = ctx.message.text
      const extractedReceipt = extractTelebirrReceipt(smsText)
      if (!extractedReceipt.reference) {
        return ctx.reply(botText(lang, 'invalidReference') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
      }

      const parsedFromSMS = parseTelebirrSMS(smsText)
      if (!parsedFromSMS) {
        return ctx.reply(botText(lang, 'invalidReceipt') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
      }

      const user = await db('users').where({ telegram_id: ctx.from.id }).first()
      if (!user) {
        return ctx.reply(botText(lang, 'userNotFound') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
      }

      let deposit
      try {
        deposit = await creditVerifiedDeposit({
          userId: user.id,
          reference: extractedReceipt.reference,
          amount: parsedFromSMS.amount,
          receiptUrl: extractedReceipt.url,
        })
      } catch (err) {
        if (err.code === '23505') {
          return ctx.reply(botText(lang, 'receiptUsed') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
        }
        const message = err instanceof PaymentVerificationError
          ? err.message
          : botText(lang, 'unableDeposit')
        return ctx.reply(botText(lang, 'verificationFailed', { error: message }) + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
      }

      ctx.reply(botText(lang, 'depositSubmitted', { amount: deposit.amount.toFixed(2) }) + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
      delete userStates[ctx.from.id]
      return
    }

    if (state === 'WAITING_FOR_WITHDRAW_AMOUNT') {
      const amount = Number(ctx.message.text)
      if (isNaN(amount) || amount < 100) {
        return ctx.reply(botText(lang, 'invalidWithdrawal') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
      }

      const user = await db('users').where({ telegram_id: ctx.from.id }).first()
      if (!user) return ctx.reply(botText(lang, 'userNotFound') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})

      if (Number(user.wallet_balance) < amount) {
        return ctx.reply(botText(lang, 'insufficientBalance', { amount: Number(user.wallet_balance).toFixed(2) }) + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
      }

      await db.transaction(async (trx) => {
        await trx('users')
          .where({ id: user.id })
          .decrement('wallet_balance', amount);

        await trx('payments').insert({
          user_id: user.id,
          amount: amount,
          provider: 'telebirr',
          status: 'pending',
          type: 'withdrawal',
          transaction_reference: `WD-${Date.now()}-${user.id}`
        });
      })

      ctx.reply(botText(lang, 'withdrawalPending', { amount: amount.toFixed(2) }) + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
      delete userStates[ctx.from.id]
      return
    }
  } catch (err) {
    console.error('Text Handler Error:', err)
    const lang = await getUserLanguage(ctx)
    ctx.reply(botText(lang, 'requestFailed') + SUPPORT_TEXT, { parse_mode: 'HTML' }).catch(() => {})
  }
})

module.exports = { bot, getMainMenu }