const { Telegraf, Markup } = require('telegraf')
const db = require('../db')

const userStates = {}
const SUPPORT_URL = 'https://t.me/Knoor1221'
const botTranslations = {
  en: {
    selectLanguage: 'Please select your language:',
    english: '🇬🇧 English',
    amharic: '🇪🇹 አማርኛ',
    player: 'Player',
    languageSet: 'Language set to English.',
    mainMenu: 'Main menu:',
    playGame: '🎮 Play Game',
    checkBalance: '💰 Check Balance',
    deposit: '💳 Deposit',
    withdraw: '💸 Withdraw',
    myRoom: '🏠 My Room',
    help: '❓ Help',
    launchPrompt: 'Tap the button below to launch the game:',
    playBingo: '🎰 Play Bingo',
    balance: '💰 Your current balance is: ETB {{amount}}',
    userNotFound: 'User not found. Please open the Mini App first to register.',
    balanceFailed: '❌ Failed to fetch balance.',
    systemBusy: '⏳ The system is currently busy. Please try again in a few seconds.',
    helpMessage: `✅ Game Card
1. To start the game, select a Bingo card from the 1-400 card selection board.
2. Inactive numbers on the board mean the card has already been selected by another player.
3. When you select a card, it will show the numbers at the bottom.
4. When the countdown timer reaches zero, you will automatically enter the game.

✅ How the game is played
1. After entering the game, you will find your selected card on the right side.
2. When the game starts, the system will randomly call numbers from 1 to 75.
3. From the numbers called by the system, select and mark (shade) the ones that match your card.

🏆 Ways to win
1. Based on the marked numbers on your card:
• Complete a horizontal or vertical line.
• Complete a diagonal line.
• Mark all four corners.

✅ If there is more than one winner, the prize pool is split among them.

For more support: @saleg122`,
    registerPrompt: 'To complete your registration, please share your phone number:',
    sharePhone: '📱 Share Phone Number',
    depositInstructions: '💳 To Deposit:\n\n👤 Name: {{name}}\n📱 Telebirr: {{phone}}\n\n1. Open your Telebirr app\n2. Send money to the number above\n3. Copy the SMS you receive\n\n👇 Now paste the full SMS here:\n\nFor more support: https://t.me/Knoor1221',
    withdrawPrompt: 'Enter the amount you want to withdraw (Minimum 100 ETB):\n\nFor more support: https://t.me/Knoor1221',
    roomPrompt: 'To join a room, please open the Mini App and select a stake.',
    openLobby: 'Open Lobby',
    invalidReference: 'Could not find a valid transaction number in that SMS.',
    invalidReceipt: '❌ Invalid receipt format. Please copy the entire SMS you received from Telebirr and paste it here.',
    receiptUsed: '❌ This Telebirr receipt has already been used.',
    unableDeposit: 'Unable to process this deposit.',
    verificationFailed: '❌ Verification failed: {{error}}',
    depositSubmitted: '✅ Receipt for ETB {{amount}} verified and submitted for admin approval. Your wallet will be credited after approval.',
    invalidWithdrawal: '❌ Invalid amount. Minimum withdrawal is 100 ETB.',
    insufficientBalance: '❌ Insufficient balance. You only have ETB {{amount}}.',
    withdrawalPending: '⏳ Your withdrawal request for ETB {{amount}} is pending admin approval.',
    requestFailed: '❌ Failed to process your request. Please try again.',
    alreadyRegistered: '✅ You are already registered.',
    phoneSaved: '✅ Phone number saved: {{phone}}\n\nYou can now use the bot normally.',
    registrationComplete: '✅ Registration complete! Phone number: {{phone}}',
    contactFailed: '❌ Failed to save your contact. Please try again.',
    inviteEarn: '🎉 Invite & Earn 5%!\n\nShare your unique link with friends. When they win a game, you get 5% of their prize!\n\n🔗 Your Link:\n{{link}}\n\n(You can withdraw your earnings once you reach 1,000 ETB!)',
    shareGroup: '📢 Share to Group/Channel',
    openGame: '🎮 Open Game',
    shareText: 'Join me on GoBingo and win big! 🎰'
  },
  am: {
    selectLanguage: 'እባክዎ ቋንቋ ይምረጡ:',
    english: '🇬🇧 እንግሊዝኛ',
    amharic: '🇪🇹 አማርኛ',
    player: 'ተጫዋች',
    languageSet: 'ቋንቋ ወደ አማርኛ ተቀይሯል።',
    mainMenu: 'ዋና ምናሌ፦',
    playGame: '🎮 ጨዋታ ይጫወቱ',
    checkBalance: '💰 ቀሪ ሂሳብ ይመልከቱ',
    deposit: '💳 ገንዘብ ያስገቡ',
    withdraw: '💸 ገንዘብ ያውጡ',
    myRoom: '🏠 ክፍሌ',
    help: '❓ እርዳታ',
    launchPrompt: 'ጨዋታውን ለመክፈት ከታች ያለውን ቁልፍ ይጫኑ፦',
    playBingo: '🎰 ቢንጎ ይጫወቱ',
    balance: '💰 የአሁኑ ቀሪ ሂሳብዎ፦ {{amount}} ብር',
    userNotFound: 'ተጠቃሚው አልተገኘም። ለመመዝገብ መጀመሪያ ሚኒ አፑን ይክፈቱ።',
    balanceFailed: '❌ ቀሪ ሂሳብን ማምጣት አልተሳካም።',
    systemBusy: '⏳ ስርዓቱ አሁን በስራ ላይ ነው። እባክዎ ከጥቂት ሰከንዶች በኋላ እንደገና ይሞክሩ።',
    helpMessage: `✅ መጫወቻ ካርድ
1. ጨዋታውን ለመጀመር ከ1-400 የካርድ መምረጫ ቦርድ ውስጥ አንድ የመጫወቻ ካርድ (ካርቴላ) ይምረጡ።
2. የካርድ መምረጫ ቦርድ ላይ Inactive ቁጥሮች የሚያሳዩት መጫወቻ ካርዱ (ካርቴላው) በሌላ ተጫዋች መመረጡን ነው።
3. የመጫወቻ ካርዱን (ካርቴላውን) ሲመርጡት ከታች የሚይዛቸውን ቁጥሮች ያሳያል።
4. ወደ ጨዋታው ለመግባት ለምዝገባ የተሰጠው ሰኮንድ ዜሮ ሲሆን ቀጥታ ወደ ጨዋታ ያስገባል።

✅ ጨዋታ እንዴት ይካሄዳል
1. ወደ ጨዋታው ከገቡ በኋላ በመረጡት የመጫወቻ ካርድ (ካርቴላ) በቀኝ በኩል ያገኙታል።
2. ጨዋታው ሲጀምር ሲስተሙ ከ1 እስከ 75 ያሉ ቁጥሮችን Randomly መጥራት ይጀምራል።
3. ሲስተሙ ከሚጠራቸው ቁጥሮች ውስጥ በራስዎ የመጫወቻ ካርድ (ካርቴላ) ላይ ካሉ በመምረጥ ያጥቁሩ።

🏆 አሸናፊ የሚሆኑባቸው መንገዶች
1. መጫወቻ ካርድ (ካርቴላ) ላይ የተጠቆሩት ቁጥሮች፦
• ወደጎን ወይም ወደታች መስመር ከሰሩ
• ወደሁለቱም አግዳሚ (Diagonal) መስመር ከሰሩ
• አራቱ ማእዘናት (ኮርነር) ከተጠሩ አሸናፊ ይሆናሉ።

✅ ከአንድ በላይ አሸናፊ ካለ ደራሽ ገንዘቡን ይከፋፈላሉ።

ለተጨማሪ ድጋፍ፦ @saleg122`,
    registerPrompt: 'ምዝገባዎን ለማጠናቀቅ እባክዎ ስልክ ቁጥርዎን ያጋሩ፦',
    sharePhone: '📱 ስልክ ቁጥር ያጋሩ',
    depositInstructions: '💳 ገንዘብ ለማስገባት፦\n\n👤 ስም፦ {{name}}\n📱 ቴሌብር፦ {{phone}}\n\n1. የቴሌብር መተግበሪያዎን ይክፈቱ።\n2. ከላይ ወደተጠቀሰው ቁጥር ገንዘብ ይላኩ።\n3. የደረሰዎትን ኤስኤምኤስ ኮፒ ያድርጉ።\n\n👇 አሁን ሙሉውን ኤስኤምኤስ እዚህ ይለጥፉ፦\n\nለተጨማሪ ድጋፍ፦ https://t.me/Knoor1221',
    withdrawPrompt: 'ማውጣት የሚፈልጉትን መጠን ያስገቡ (ዝቅተኛው 100 ብር)፦\n\nለተጨማሪ ድጋፍ፦ https://t.me/Knoor1221',
    roomPrompt: 'ክፍል ለመቀላቀል ሚኒ አፑን ከፍተው የውለታ መጠን ይምረጡ።',
    openLobby: 'ዋና ገጽን ክፈት',
    invalidReference: 'በዚያ ኤስኤምኤስ ውስጥ ትክክለኛ የግብይት ቁጥር አልተገኘም።',
    invalidReceipt: '❌ የደረሰኙ ቅርጸት ትክክል አይደለም። ከቴሌብር የተቀበሉትን ሙሉ ኤስኤምኤስ ኮፒ አድርገው እዚህ ይለጥፉ።',
    receiptUsed: '❌ ይህ የቴሌብር ደረሰኝ ከዚህ በፊት ጥቅም ላይ ውሏል።',
    unableDeposit: 'ይህን ገንዘብ ማስገባት አልተቻለም።',
    verificationFailed: '❌ ማረጋገጥ አልተሳካም፦ {{error}}',
    depositSubmitted: '✅ {{amount}} ብር የሚያሳየው ደረሰኝ ተረጋግጦ ለአስተዳዳሪ ማጽደቅ ተልኳል። ከተፈቀደ በኋላ ወደ ቦርሳዎ ይገባል።',
    invalidWithdrawal: '❌ የገባው መጠን ትክክል አይደለም። ዝቅተኛው የማውጣት መጠን 100 ብር ነው።',
    insufficientBalance: '❌ በቂ ቀሪ ሂሳብ የለም። ያለዎት {{amount}} ብር ብቻ ነው።',
    withdrawalPending: '⏳ {{amount}} ብር የማውጣት ጥያቄዎ የአስተዳዳሪ ማጽደቅ በመጠባበቅ ላይ ነው።',
    requestFailed: '❌ ጥያቄዎን ማስኬድ አልተሳካም። እባክዎ እንደገና ይሞክሩ።',
    alreadyRegistered: '✅ አስቀድመው ተመዝግበዋል።',
    phoneSaved: '✅ ስልክ ቁጥሩ ተቀምጧል፦ {{phone}}\n\nአሁን ቦቱን በመደበኛው መንገድ መጠቀም ይችላሉ።',
    registrationComplete: '✅ ምዝገባው ተጠናቋል! ስልክ ቁጥር፦ {{phone}}',
    contactFailed: '❌ የእውቂያ መረጃዎን ማስቀመጥ አልተሳካም። እባክዎ እንደገና ይሞክሩ።',
    inviteEarn: '🎉 ይጋብዙ እና 5% ያግቡ!\n\nልዩ ሊንክዎን ለጓደኞችዎ ያጋሩ። እነሱ ሲያሸንፉ የሽልማታቸውን 5% ያገኛሉ!\n\n🔗 የእርስዎ ሊንክ፦\n{{link}}\n\n(ገቢዎን 1,000 ብር ሲደርስ ማውጣት ይችላሉ!)',
    shareGroup: '📢 ለቡድን/ቻናል አጋራ',
    openGame: '🎮 ጨዋታውን ክፈት',
    shareText: 'በዮጋቢንጎ ይቀላለቁኝ እና ትልቅ ያሸንፉ! 🎰'
  },
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)

// GLOBAL MIDDLEWARE: Clear state on any command to prevent state machine locks
bot.use((ctx, next) => {
  if (ctx.message?.text?.startsWith('/') && ctx.from?.id !== undefined) {
    delete userStates[ctx.from.id]
  }
  return next()
})

const DEFAULT_FRONTEND_URL = 'https://noor-one-beta.vercel.app/'

function getFrontendUrl(referralRef) {
  const url = new URL(process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL)
  if (referralRef) url.searchParams.set('ref', referralRef)
  return url.toString()
}

function getReferralRefFromStartPayload(payload) {
  if (!payload) return null
  if (payload.startsWith('u_')) return `@${payload.slice(2)}`
  if (payload.startsWith('i_')) return payload.slice(2)
  if (payload.startsWith('@') || /^\d+$/.test(payload)) return payload
  if (payload.startsWith('REF_')) return payload
  return null
}

function botText(lang, key, values = {}) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, () => String(value)),
    botTranslations[lang]?.[key] || botTranslations.en[key]
  )
}

function withSupport(text) {
  const message = text.trimEnd()
  return message.endsWith(SUPPORT_URL) ? message : `${message}\n\n${SUPPORT_URL}`
}

function withSupportButton(options = {}) {
  const replyMarkup = options.reply_markup || {}
  const inlineKeyboard = replyMarkup.inline_keyboard || []
  const hasSupportButton = inlineKeyboard.some((row) =>
    row.some((button) => button.text === 'Contact Us' && button.url === SUPPORT_URL)
  )

  return {
    ...options,
    reply_markup: {
      ...replyMarkup,
      inline_keyboard: hasSupportButton
        ? inlineKeyboard
        : [...inlineKeyboard, [{ text: 'Contact Us', url: SUPPORT_URL }]]
    }
  }
}

function replyWithSupport(ctx, text, options = {}) {
  return ctx.reply(withSupport(text), withSupportButton(options))
}

bot.catch((err, ctx) => {
  console.error(`[BOT] Error for ${ctx.updateType}:`, err.message)
})

try {
  bot.telegram.setChatMenuButton({
    menu_button: { type: 'commands' }
  }).then(() => console.log('✅ Menu button forced to COMMANDS mode')).catch(console.error)

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
  ]).then(() => console.log('✅ Commands registered')).catch(console.error)
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
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.playGame, web_app: { url: process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL } }],
        [{ text: t.checkBalance, callback_data: 'menu_balance' }, { text: t.deposit, callback_data: 'menu_deposit' }],
        [{ text: t.withdraw, callback_data: 'menu_withdraw' }, { text: t.myRoom, callback_data: 'menu_room' }],
        [{ text: t.help, callback_data: 'menu_help' }],
        [{ text: 'Contact Us', url: SUPPORT_URL }]
      ]
    }
  }
}

async function showInvite(ctx) {
  let lang = 'en'
  try {
    console.log('[INVITE] Generating link for:', ctx.from.id)
    lang = await getUserLanguage(ctx)

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

    await replyWithSupport(ctx, botText(lang, 'inviteEarn', { link: refLink }), {
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: botText(lang, 'shareGroup'), url: shareUrl }],
          [{ text: botText(lang, 'openGame'), web_app: { url: frontendUrl } }]
        ]
      }
    })
    console.log('[INVITE] Link sent successfully')
  } catch (err) {
    console.error('[INVITE] Failed to generate invite:', err.message)
    return replyWithSupport(ctx, botText(lang, 'systemBusy')).catch(() => {})
  }
}

bot.start(async (ctx) => {
  const text = withSupport('Please select your language / እባክዎ ቋንቋ ይምረጡ:')
  const referralRef = getReferralRefFromStartPayload(ctx.startPayload)

  ctx.reply(text, withSupportButton({
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🇬🇧 English', callback_data: 'lang_en' },
          { text: '🇪🇹 አማርኛ', callback_data: 'lang_am' }
        ],
        [
          { text: '🎮 Open Game', web_app: { url: getFrontendUrl(referralRef) } }
        ],
        [
          { text: '👥 Invite Friends & Earn 5%', callback_data: 'show_invite' }
        ]
      ]
    }
  })).catch(e => console.error('Start error:', e))
})

bot.command('menu', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  replyWithSupport(ctx, botText(lang, 'mainMenu'), getMainMenu(lang)).catch(() => {})
})

bot.command(['invite', 'referral'], async (ctx) => {
  delete userStates[ctx.from.id]
  await showInvite(ctx)
})

bot.command('play', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  replyWithSupport(ctx, botText(lang, 'launchPrompt'), {
    reply_markup: { inline_keyboard: [[{ text: botText(lang, 'playBingo'), web_app: { url: process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL } }]] }
  }).catch(() => {})
})

bot.command('balance', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  try {
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (user) replyWithSupport(ctx, botText(lang, 'balance', { amount: Number(user.wallet_balance || 0).toFixed(2) })).catch(() => {})
    else replyWithSupport(ctx, botText(lang, 'userNotFound')).catch(() => {})
  } catch (e) {
    console.error('[DB ERROR] Balance fetch failed:', e.message)
    replyWithSupport(ctx, botText(lang, 'systemBusy')).catch(() => {})
  }
})

bot.command('help', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  replyWithSupport(ctx, botText(lang, 'helpMessage')).catch(() => {})
})

bot.command('register', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.reply(
    withSupport(botText(lang, 'registerPrompt')),
    Markup.keyboard([
      [Markup.button.contactRequest(botText(lang, 'sharePhone'))]
    ]).resize().oneTime()
  )
  return ctx.reply('Contact Us', withSupportButton())
})

bot.command('deposit', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  replyWithSupport(ctx, botText(lang, 'depositInstructions', { name: 'Kenaw Nuru Muhabe', phone: '0989002307' })).catch(() => {})
})

bot.command('withdraw', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  replyWithSupport(ctx, botText(lang, 'withdrawPrompt')).catch(() => {})
})

bot.action('show_invite', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  return showInvite(ctx)
})

bot.action('lang_en', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try { await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'en' }) } catch (e) {}
  replyWithSupport(ctx, botText('en', 'languageSet'), getMainMenu('en')).catch(() => {})
})

bot.action('lang_am', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try { await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'am' }) } catch (e) {}
  replyWithSupport(ctx, botText('am', 'languageSet'), getMainMenu('am')).catch(() => {})
})

bot.action('menu_balance', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  try {
    await ctx.answerCbQuery().catch(() => {})
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (!user) return replyWithSupport(ctx, botText(lang, 'userNotFound'))
    replyWithSupport(ctx, botText(lang, 'balance', { amount: Number(user.wallet_balance || 0).toFixed(2) })).catch(() => {})
  } catch (err) {
    console.error('Balance Error:', err)
    replyWithSupport(ctx, botText(lang, 'balanceFailed')).catch(() => {})
  }
})

bot.action('menu_deposit', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  const msg = botText(lang, 'depositInstructions', { name: 'Kenaw Nuru Muhabe', phone: '0989002307' })
  replyWithSupport(ctx, msg).catch(() => {})
})

bot.action('menu_withdraw', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  replyWithSupport(ctx, botText(lang, 'withdrawPrompt')).catch(() => {})
})

bot.action('menu_room', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.answerCbQuery().catch(() => {})
  replyWithSupport(ctx, botText(lang, 'roomPrompt'), {
    reply_markup: { inline_keyboard: [[{ text: botText(lang, 'openLobby'), web_app: { url: process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL } }]] }
  }).catch(() => {})
})

bot.action('menu_help', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.answerCbQuery().catch(() => {})
  replyWithSupport(ctx, botText(lang, 'helpMessage')).catch(() => {})
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
        botText(lang, 'alreadyRegistered'),
        Markup.removeKeyboard()
      )
      return
    }

    const updated = await db('users')
      .where({ telegram_id: telegramId })
      .update({ phone_number: phoneNumber })

    if (updated) {
      await ctx.reply(
        botText(lang, 'phoneSaved', { phone: phoneNumber }),
        Markup.removeKeyboard()
      )
    } else {
      await db('users').insert({
        telegram_id: telegramId,
        first_name: ctx.from.first_name || botText(lang, 'player'),
        phone_number: phoneNumber,
        wallet_balance: 0
      })
      await ctx.reply(
        botText(lang, 'registrationComplete', { phone: phoneNumber }),
        Markup.removeKeyboard()
      )
    }
  } catch (err) {
    console.error('Contact save error:', err)
    await ctx.reply(botText(lang, 'contactFailed'))
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
        return ctx.reply(botText(lang, 'invalidReference')).catch(() => {})
      }

      const parsedFromSMS = parseTelebirrSMS(smsText)
      if (!parsedFromSMS) {
        return ctx.reply(botText(lang, 'invalidReceipt')).catch(() => {})
      }

      const user = await db('users').where({ telegram_id: ctx.from.id }).first()
      if (!user) {
        return ctx.reply(botText(lang, 'userNotFound')).catch(() => {})
      }

      let deposit
      try {
        console.log('[DEBUG] Extracted Reference:', extractedReceipt.reference)
        deposit = await creditVerifiedDeposit({
          userId: user.id,
          reference: extractedReceipt.reference,
          amount: parsedFromSMS.amount,
          receiptUrl: extractedReceipt.url,
        })
      } catch (err) {
        if (err.code === '23505') {
          return ctx.reply(botText(lang, 'receiptUsed')).catch(() => {})
        }
        const message = err instanceof PaymentVerificationError
          ? err.message
          : botText(lang, 'unableDeposit')
        return ctx.reply(botText(lang, 'verificationFailed', { error: message })).catch(() => {})
      }

      ctx.reply(botText(lang, 'depositSubmitted', { amount: deposit.amount.toFixed(2) })).catch(() => {})
      delete userStates[ctx.from.id]
      return
    }

    if (state === 'WAITING_FOR_WITHDRAW_AMOUNT') {
      const amount = Number(ctx.message.text)
      if (isNaN(amount) || amount < 100) {
        return ctx.reply(botText(lang, 'invalidWithdrawal')).catch(() => {})
      }

      const user = await db('users').where({ telegram_id: ctx.from.id }).first()
      if (!user) return ctx.reply(botText(lang, 'userNotFound')).catch(() => {})

      if (Number(user.wallet_balance) < amount) {
        return ctx.reply(botText(lang, 'insufficientBalance', { amount: Number(user.wallet_balance).toFixed(2) })).catch(() => {})
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

      ctx.reply(botText(lang, 'withdrawalPending', { amount: amount.toFixed(2) })).catch(() => {})
      delete userStates[ctx.from.id]
      return
    }
  } catch (err) {
    console.error('Text Handler Error:', err)
    const lang = await getUserLanguage(ctx)
    ctx.reply(botText(lang, 'requestFailed')).catch(() => {})
  }
})

module.exports = { bot, getMainMenu }