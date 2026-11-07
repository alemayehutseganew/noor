const { Telegraf, Markup } = require('telegraf')
const db = require('../db')
const {
  parseTelebirrSMS,
  extractTelebirrReceipt,
  creditVerifiedDeposit,
  PaymentVerificationError,
} = require('../services/paymentService')

const userStates = {}
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
    helpMessage: '📖 How to Play GOBINGO\n\n1. Open the Mini App.\n2. Select a stake.\n3. Choose a card.\n4. Wait for game start.\n5. Tap numbers when called.\n6. Complete a line and press BINGO!\n\nGood luck!\n\nFor more support: https://t.me/Knoor1221',
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
    phoneSaved: '✅ Phone number saved: {{phone}}\n\nYou can now use the bot normally.',
    registrationComplete: '✅ Registration complete! Phone number: {{phone}}',
    contactFailed: '❌ Failed to save your contact. Please try again.',
    inviteEarn: '🎉 *Invite & Earn 5%!*\n\nShare your unique link with friends. When they win a game, you get 5% of their prize!\n\n🔗 Your Link:\n`{{link}}`\n\n*(You can withdraw your earnings once you reach 1,000 ETB!)*',
    shareGroup: '📢 Share to Group/Channel',
    openGame: '🎮 Open Game',
    shareText: 'Join me on YogaBingo and win big! 🎰'
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
    helpMessage: '📖 ጎቢንጎን እንዴት መጫወት ይቻላል\n\n1. ሚኒ አፑን ይክፈቱ።\n2. የውለታ መጠን ይምረጡ።\n3. ካርድ ይምረጡ።\n4. ጨዋታው እስኪጀምር ይጠብቁ።\n5. ቁጥሮች ሲጠሩ ይንኩ።\n6. መስመር አሟልተው BINGO! ይጫኑ።\n\nመልካም ዕድል!\n\nለተጨማሪ ድጋፍ፦ https://t.me/Knoor1221',
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
    phoneSaved: '✅ ስልክ ቁጥሩ ተቀምጧል፦ {{phone}}\n\nአሁን ቦቱን በመደበኛው መንገድ መጠቀም ይችላሉ።',
    registrationComplete: '✅ ምዝገባው ተጠናቋል! ስልክ ቁጥር፦ {{phone}}',
    contactFailed: '❌ የእውቂያ መረጃዎን ማስቀመጥ አልተሳካም። እባክዎ እንደገና ይሞክሩ።',
    inviteEarn: '🎉 *ይጋብዙ እና 5% ያግቡ!*\n\nልዩ ሊንክዎን ለጓደኞችዎ ያጋሩ። እነሱ ሲያሸንፉ የሽልማታቸውን 5% ያገኛሉ!\n\n🔗 የእርስዎ ሊንክ፦\n`{{link}}`\n\n*(ገቢዎን 1,000 ብር ሲደርስ ማውጣት ይችላሉ!)*',
    shareGroup: '📢 ለቡድን/ቻናል አጋራ',
    openGame: '🎮 ጨዋታውን ክፈት',
    shareText: 'በዮጋቢንጎ ይቀላቀሉኝ እና ትልቅ ያሸንፉ! 🎰'
  },
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)
bot.use((ctx, next) => {
  if (ctx.message?.text?.startsWith('/') && ctx.from?.id !== undefined) {
    delete userStates[ctx.from.id]
  }
  return next()
})

if (false) {
const { Telegraf, Markup } = require('telegraf')
const db = require('../db')
const { parseTelebirrSMS, creditVerifiedDeposit } = require('../services/paymentService')
const { getT } = require('./translations')

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://ked-seven.vercel.app'
const userStates = {}
let commandRegistrationPromise
let botInfoPromise

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN)

bot.catch((err, ctx) => {
  console.error(`[BOT] Error for ${ctx.updateType}:`, err.message)
})

async function getUserLanguage(telegramId) {
  try {
    const user = await db('users').where({ telegram_id: telegramId }).first()
    return user?.language || 'en'
  } catch (err) {
    console.error('Failed to fetch user language:', err.message)
    return 'en'
  }
}

function getMainMenu(lang = 'en') {
  const t = getT(lang)
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: t.play_btn, web_app: { url: FRONTEND_URL } }],
        [{ text: '👥 Invite Friends & Earn 5%', callback_data: 'show_invite' }],
        [{ text: t.btn_balance, callback_data: 'menu_balance' }, { text: t.btn_deposit, callback_data: 'menu_deposit' }],
        [{ text: t.btn_withdraw, callback_data: 'menu_withdraw' }, { text: t.btn_room, callback_data: 'menu_room' }],
        [{ text: t.btn_help, callback_data: 'menu_help' }]
      ]
    }
  }
}

async function registerBotCommands() {
  if (!commandRegistrationPromise) {
    commandRegistrationPromise = bot.telegram.setMyCommands([
      { command: 'start', description: 'Start the bot and open the game' },
      { command: 'balance', description: 'Check your wallet balance' },
      { command: 'invite', description: 'Get your referral link to earn 5%' },
      { command: 'deposit', description: 'Deposit ETB to play' },
      { command: 'withdraw', description: 'Withdraw your winnings' },
      { command: 'menu', description: 'Open the game menu' },
      { command: 'play', description: 'Play the game' },
      { command: 'help', description: 'How to play the game' },
      { command: 'register', description: 'Register your phone number' }
    ]).catch((err) => {
      commandRegistrationPromise = null
      console.error('[BOT] Failed to register bot commands:', err)
      throw err
    })
  }
  return commandRegistrationPromise
}

registerBotCommands().catch((err) => {
  console.error('[BOT] Command menu initialization failed:', err)
})

async function sendInvite(ctx) {
  try {
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (!user) return ctx.reply('Please open the Mini App first to register.')

    const refId = user.username || user.telegram_id
    const botUsername = ctx.botInfo?.username || await getBotUsername()
    const refLink = `https://t.me/${botUsername}?start=REF_${encodeURIComponent(String(refId))}`
    const shareText = 'Join me on YogaBingo and win big! 🎰'
    const message = `🎉 Invite & Earn 5%!\n\nShare your unique link with friends. When they win a game, you get 5% of their prize!\n\n🔗 Your Link:\n${refLink}\n\nYou can withdraw your earnings once you reach 1,000 ETB!`
    const openGameButton = ctx.chat?.type === 'private'
      ? { text: '🎮 Open Game', web_app: { url: FRONTEND_URL } }
      : { text: '🎮 Open Game', url: FRONTEND_URL }

    return ctx.reply(message, {
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{
            text: '📢 Share to Group/Channel',
            url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`,
          }],
          [openGameButton],
        ],
      },
    })
  } catch (err) {
    console.error('Invite command error:', err)
    return ctx.reply('❌ Could not generate your invite link. Please try again later.')
  }
}

async function getBotUsername() {
  if (!botInfoPromise) {
    botInfoPromise = bot.telegram.getMe().catch((err) => {
      botInfoPromise = null
      throw err
    })
  }
  return (await botInfoPromise).username
}

bot.start(async (ctx) => {
  try {
    await registerBotCommands()
  } catch {
    // Keep /start available even if Telegram command-menu registration fails.
  }

  const payload = ctx.startPayload
  if (payload) {
    let webAppUrl = FRONTEND_URL
    try {
      const parsedUrl = new URL(FRONTEND_URL)
      const referral = payload.startsWith('REF_') ? payload.slice(4) : payload
      parsedUrl.searchParams.set('ref', /^\d+$/.test(referral) ? referral : `@${referral}`)
      webAppUrl = parsedUrl.toString()
    } catch (err) {
      console.error('[BOT] Invalid FRONTEND_URL for referral link:', err.message)
      return ctx.reply('The game link is temporarily unavailable.')
    }

    return ctx.reply('Welcome to YogaBingo! 🎰', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Open Game', web_app: { url: webAppUrl } }],
          [{ text: '👥 Invite Friends & Earn 5%', callback_data: 'show_invite' }],
        ],
      },
    }).catch((err) => console.error('Start error:', err.message))
  }

  ctx.reply(getT('en').choose_lang, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🇬🇧 English', callback_data: 'lang_en' }, { text: '🇪🇹 አማርኛ', callback_data: 'lang_am' }],
        [{ text: '👥 Invite Friends & Earn 5%', callback_data: 'show_invite' }],
      ]
    }
  }).catch((err) => console.error('Start error:', err.message))
})

bot.command(['invite', 'refer'], sendInvite)
bot.action('show_invite', async (ctx) => {
  await ctx.answerCbQuery().catch((err) => console.error('Invite callback error:', err))
  await sendInvite(ctx)
})

bot.on('inline_query', async (ctx) => {
  const query = ctx.inlineQuery.query.trim()
  const referral = query.startsWith('start=') ? query.slice('start='.length) : query
  if (!referral) {
    return ctx.answerInlineQuery([])
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || process.env.VITE_BOT_USERNAME || 'YogaBingoBot'
  const referralUrl = `https://t.me/${botUsername.replace(/^@/, '')}?start=${encodeURIComponent(referral)}`
  await ctx.answerInlineQuery([{
    type: 'article',
    id: 'yogabingo-referral',
    title: 'Play YogaBingo!',
    description: 'Tap to join the game and win big!',
    input_message_content: {
      message_text: `🎰 Join me on YogaBingo and win big!\n${referralUrl}`,
    },
    reply_markup: {
      inline_keyboard: [
        [{ text: '🎮 Play Now', url: referralUrl }],
      ],
    },
  }])
})

bot.action('lang_en', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try {
    await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'en' })
  } catch (err) {
    console.error('Failed to set English language:', err.message)
  }
  ctx.reply(getT('en').lang_set_en, getMainMenu('en')).catch(() => {})
})

bot.action('lang_am', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  try {
    await db('users').where({ telegram_id: ctx.from.id }).update({ language: 'am' })
  } catch (err) {
    console.error('Failed to set Amharic language:', err.message)
  }
  ctx.reply(getT('am').lang_set_am, getMainMenu('am')).catch(() => {})
})

bot.command('menu', async (ctx) => {
  const lang = await getUserLanguage(ctx.from.id)
  ctx.reply(getT(lang).main_menu, getMainMenu(lang)).catch(() => {})
})

bot.command('play', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  ctx.reply(t.play_prompt, {
    reply_markup: { inline_keyboard: [[{ text: t.play_btn, web_app: { url: FRONTEND_URL } }]] }
  }).catch(() => {})
})

bot.command('balance', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  try {
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (user) ctx.reply(`${t.my_balance}${Number(user.wallet_balance || 0).toFixed(2)}`)
    else ctx.reply(t.user_not_found)
  } catch (err) {
    console.error('[BOT ERROR] Failed to fetch balance for user:', ctx.from.id, err)
    ctx.reply(t.err_balance).catch(() => {})
  }
})

bot.command('help', async (ctx) => {
  ctx.reply(getT(await getUserLanguage(ctx.from.id)).help_text).catch(() => {})
})

bot.command('register', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  return ctx.reply(
    t.register_prompt,
    Markup.keyboard([
      [Markup.button.contactRequest(t.register_btn)]
    ]).resize().oneTime()
  )
})

bot.command('deposit', async (ctx) => {
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  ctx.reply(getT(await getUserLanguage(ctx.from.id)).deposit_inst).catch(() => {})
})

bot.command('withdraw', async (ctx) => {
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  ctx.reply(getT(await getUserLanguage(ctx.from.id)).withdraw_prompt).catch(() => {})
})

bot.action('menu_balance', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  try {
    await ctx.answerCbQuery().catch(() => {})
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (!user) return ctx.reply(t.user_not_found)
    ctx.reply(`${t.my_balance}${Number(user.wallet_balance || 0).toFixed(2)}`).catch(() => {})
  } catch (err) {
    console.error('Balance Error:', err)
    ctx.reply(t.err_balance).catch(() => {})
  }
})

bot.action('menu_deposit', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  const msg = getT(await getUserLanguage(ctx.from.id)).deposit_inst
  ctx.reply(msg).catch(() => {})
})

bot.action('menu_withdraw', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  ctx.reply(getT(await getUserLanguage(ctx.from.id)).withdraw_prompt).catch(() => {})
})

bot.action('menu_room', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  const t = getT(await getUserLanguage(ctx.from.id))
  ctx.reply(t.room_prompt, {
    reply_markup: { inline_keyboard: [[{ text: t.open_lobby, web_app: { url: FRONTEND_URL } }]] }
  }).catch(() => {})
})

bot.action('menu_help', async (ctx) => {
  await ctx.answerCbQuery().catch(() => {})
  ctx.reply(getT(await getUserLanguage(ctx.from.id)).help_text).catch(() => {})
})

bot.on('text', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  try {
    const state = userStates[ctx.from.id]
    if (!state) return

    if (state === 'WAITING_FOR_RECEIPT') {
      const parsedFromSMS = parseTelebirrSMS(ctx.message.text)
      if (!parsedFromSMS) {
        return ctx.reply('Could not find a valid transaction number in that SMS.').catch(() => {})
      }

      const user = await db('users').where({ telegram_id: ctx.from.id }).first()
      if (!user) {
        return ctx.reply(t.user_not_found).catch(() => {})
      }

      console.log('[TELEBIRR VERIFY] Extracted Reference:', parsedFromSMS.transactionId)

      let deposit
      try {
        deposit = await creditVerifiedDeposit({
          userId: user.id,
          reference: parsedFromSMS.transactionId,
          amount: parsedFromSMS.amount,
        })
      } catch (err) {
        if (err.code === '23505') {
          return ctx.reply(t.deposit_used).catch(() => {})
        }
        if (err.statusCode === 400) {
          return ctx.reply(`${t.deposit_verify_fail}${err.message}`).catch(() => {})
        }
        console.error('[BOT] Deposit processing failed:', err.message)
        return ctx.reply(t.deposit_verify_fail).catch(() => {})
      }

      ctx.reply(`${t.deposit_success}${deposit.amount.toFixed(2)}${t.deposit_success2}`).catch(() => {})
      delete userStates[ctx.from.id]
      return
    }

    if (state === 'WAITING_FOR_WITHDRAW_AMOUNT') {
      const amount = Number(ctx.message.text)
      if (isNaN(amount) || amount < 100) {
        return ctx.reply(t.withdraw_invalid).catch(() => {})
      }

      const user = await db('users').where({ telegram_id: ctx.from.id }).first()
      if (!user) return ctx.reply(t.user_not_found).catch(() => {})

      if (Number(user.wallet_balance) < amount) {
        return ctx.reply(`${t.withdraw_insufficient}${Number(user.wallet_balance).toFixed(2)}.`).catch(() => {})
      }

      await db.transaction(async (trx) => {
        await trx('users')
          .where({ id: user.id })
          .decrement('wallet_balance', amount)

        await trx('payments').insert({
          user_id: user.id,
          amount,
          provider: 'telebirr',
          status: 'pending',
          type: 'withdrawal',
          transaction_reference: `WD-${Date.now()}-${user.id}`
        })
      })

      ctx.reply(`${t.withdraw_success}${amount.toFixed(2)}${t.withdraw_pending}`).catch(() => {})
      delete userStates[ctx.from.id]
    }
  } catch (err) {
    console.error('Text Handler Error:', err)
    ctx.reply(t.err_general).catch(() => {})
  }
})

bot.on('contact', async (ctx) => {
  const t = getT(await getUserLanguage(ctx.from.id))
  try {
    const contact = ctx.message.contact
    const telegramId = ctx.from.id
    const phoneNumber = contact.phone_number

    const updated = await db('users')
      .where({ telegram_id: telegramId })
      .update({ phone_number: phoneNumber })

    if (updated) {
      await ctx.reply(
        `${t.phone_saved}${phoneNumber}${t.phone_saved_suffix}`,
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
        `${t.reg_complete}${phoneNumber}`,
        Markup.removeKeyboard()
      )
    }
  } catch (err) {
    console.error('Contact save error:', err)
    await ctx.reply(t.contact_save_failed)
  }
})

const handleUpdate = async (req, res) => {
  try {
    await bot.handleUpdate(req.body)
    res.status(200).send('OK')
  } catch (err) {
    console.error('Error handling update:', err)
    res.status(500).send('Error')
  }
}

module.exports = { bot, getMainMenu, handleUpdate }
}


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

function getReferralStartPayload(referralRef) {
  if (typeof referralRef !== 'string') return null
  const value = referralRef.trim()
  // Telegram usernames must be at least 5 characters
  if (value.startsWith('@') && /^[A-Za-z0-9_]{5,32}$/.test(value.slice(1))) {
    return `u_${value.slice(1)}`
  }
  if (/^\d+$/.test(value)) return `i_${value}`
  return null
}

function botText(lang, key, values = {}) {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, () => String(value)),
    botTranslations[lang]?.[key] || botTranslations.en[key]
  )
}

bot.catch((err, ctx) => {
  console.error(`[BOT] Error for ${ctx.updateType}:`, err.message)
})

try {
  bot.telegram.setChatMenuButton({
    menu_button: { type: 'commands' }
  }).then(() => console.log('✅ Menu button forced to COMMANDS mode')).catch(console.error)

  bot.telegram.setMyCommands([
    { command: 'start', description: 'Start' },
    { command: 'balance', description: 'balance' },
    { command: 'invite', description: 'Get your referral link to earn 5%' },
    { command: 'deposit', description: 'Deposit' },
    { command: 'withdraw', description: 'Withdraw' },
    { command: 'menu', description: 'menu' },
    { command: 'play', description: 'Play' },
    { command: 'help', description: 'Help' },
    { command: 'register', description: 'Register' }
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
        [{ text: t.help, callback_data: 'menu_help' }]
      ]
    }
  }
}

async function showInvite(ctx) {
  try {
    console.log('[INVITE DEBUG] Fetching user for telegram_id:', ctx.from.id)
    const lang = await getUserLanguage(ctx)
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (!user) {
      console.log('[INVITE DEBUG] User not found in DB.')
      return ctx.reply(botText(lang, 'userNotFound'))
    }

    let refId = user.username ? `@${user.username}` : String(user.telegram_id)
    let startPayload = getReferralStartPayload(refId)

    if (!startPayload) {
      console.log('[INVITE DEBUG] Username failed regex, falling back to telegram_id.')
      refId = String(user.telegram_id)
      startPayload = getReferralStartPayload(refId)
    }

    if (!startPayload) {
      console.log('[INVITE DEBUG] Failed to generate start payload entirely.')
      return ctx.reply('❌ Error generating link. Please contact support.')
    }

    const botUsername = ctx.botInfo?.username || process.env.BOT_USERNAME || 'YogaBingoBot'
    console.log('[INVITE DEBUG] Bot Username resolved to:', botUsername)
    const refLink = `https://t.me/${botUsername}?start=${encodeURIComponent(startPayload)}`

    const message = botText(lang, 'inviteEarn', { link: refLink })

    return ctx.replyWithMarkdown(message, {
      reply_markup: {
        inline_keyboard: [
          [{
            text: botText(lang, 'shareGroup'),
            url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(botText(lang, 'shareText'))}`,
          }],
          [{
            text: botText(lang, 'openGame'),
            web_app: { url: process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL },
          }],
        ],
      },
    })
  } catch (err) {
    console.error('[INVITE DEBUG] Invite command error:', err)
    return ctx.reply(`❌ Could not generate your invite link. Error: ${err.message}`)
  }
}

bot.start(async (ctx) => {
  const lang = await getUserLanguage(ctx)
  const referralRef = getReferralRefFromStartPayload(ctx.startPayload)
  ctx.reply(botText(lang, 'selectLanguage'), {
    reply_markup: {
      inline_keyboard: [
        [{ text: botText(lang, 'english'), callback_data: 'lang_en' }, { text: botText(lang, 'amharic'), callback_data: 'lang_am' }],
        [{ text: '🎮 Open Game', web_app: { url: getFrontendUrl(referralRef) } }],
        [{ text: '👥 Invite Friends & Earn 5%', callback_data: 'show_invite' }],
      ]
    }
  }).catch(e => console.error('Start error:', e))
})

bot.action('show_invite', async (ctx) => {
  await ctx.answerCbQuery()
  await showInvite(ctx)
})

bot.on('inline_query', async (ctx) => {
  const query = ctx.inlineQuery.query.trim().replace(/^start=/, '')
  const referralRef = query.startsWith('@') || /^\d+$/.test(query) ? query : null
  const startPayload = getReferralStartPayload(referralRef)
  
  if (!startPayload) {
    return ctx.answerInlineQuery([], { cache_time: 0, is_personal: true })
  }

  const botUsername = ctx.botInfo.username
  await ctx.answerInlineQuery([{
    type: 'article',
    id: 'yogabingo-referral',
    title: 'Play YogaBingo!',
    description: 'Tap to join the game and play.',
    input_message_content: {
      message_text: '🎰 Join me on YogaBingo and play!',
    },
    reply_markup: {
      inline_keyboard: [[{
        text: '🎮 Play Now',
        url: `https://t.me/${botUsername}?start=${encodeURIComponent(startPayload)}`,
      }]],
    },
  }], { cache_time: 0, is_personal: true })
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

bot.command('menu', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  ctx.reply(botText(lang, 'mainMenu'), getMainMenu(lang)).catch(() => {})
})

bot.command(['invite', 'refer'], async (ctx) => {
  delete userStates[ctx.from.id]
  await showInvite(ctx)
})

bot.command('play', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  ctx.reply(botText(lang, 'launchPrompt'), {
    reply_markup: { inline_keyboard: [[{ text: botText(lang, 'playBingo'), web_app: { url: process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL } }]] }
  }).catch(() => {})
})

bot.command('balance', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  try {
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (user) ctx.reply(botText(lang, 'balance', { amount: Number(user.wallet_balance || 0).toFixed(2) }))
    else ctx.reply(botText(lang, 'userNotFound'))
  } catch (e) {
    ctx.reply(botText(lang, 'balanceFailed')).catch(() => {})
  }
})

bot.command('help', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  ctx.reply(botText(lang, 'helpMessage')).catch(() => {})
})

bot.command('register', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  return ctx.reply(
    botText(lang, 'registerPrompt'),
    Markup.keyboard([
      [Markup.button.contactRequest(botText(lang, 'sharePhone'))]
    ]).resize().oneTime()
  )
})

bot.command('deposit', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  ctx.reply(botText(lang, 'depositInstructions', { name: 'Kedir Shifaw kebede', phone: '0930702649' })).catch(() => {})
})

bot.command('withdraw', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  ctx.reply(botText(lang, 'withdrawPrompt')).catch(() => {})
})

bot.action('menu_balance', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  try {
    await ctx.answerCbQuery().catch(() => {})
    const user = await db('users').where({ telegram_id: ctx.from.id }).first()
    if (!user) return ctx.reply(botText(lang, 'userNotFound'))
    ctx.reply(botText(lang, 'balance', { amount: Number(user.wallet_balance || 0).toFixed(2) })).catch(() => {})
  } catch (err) {
    console.error('Balance Error:', err)
    ctx.reply(botText(lang, 'balanceFailed')).catch(() => {})
  }
})

bot.action('menu_deposit', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_RECEIPT'
  const msg = botText(lang, 'depositInstructions', { name: 'Kedir Shifaw kebede', phone: '0930702649' })
  ctx.reply(msg).catch(() => {})
})

bot.action('menu_withdraw', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.answerCbQuery().catch(() => {})
  userStates[ctx.from.id] = 'WAITING_FOR_WITHDRAW_AMOUNT'
  ctx.reply(botText(lang, 'withdrawPrompt')).catch(() => {})
})

bot.action('menu_room', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.answerCbQuery().catch(() => {})
  ctx.reply(botText(lang, 'roomPrompt'), {
    reply_markup: { inline_keyboard: [[{ text: botText(lang, 'openLobby'), web_app: { url: process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL } }]] }
  }).catch(() => {})
})

bot.action('menu_help', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  await ctx.answerCbQuery().catch(() => {})
  ctx.reply(botText(lang, 'helpMessage')).catch(() => {})
})

bot.on('contact', async (ctx) => {
  const lang = await getUserLanguage(ctx)
  try {
    const contact = ctx.message.contact
    const telegramId = ctx.from.id
    const phoneNumber = contact.phone_number

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

bot.on('text', async (ctx) => {
  try {
    const text = ctx.message.text
    if (text && text.startsWith('/')) {
      return
    }

    const lang = await getUserLanguage(ctx)
    const state = userStates[ctx.from.id]
    if (!state) return

    if (state === 'WAITING_FOR_RECEIPT') {
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