const db = require('../db')

const LINKS_ET_VERIFY_URL = 'https://links.et/api/verify'

class PaymentVerificationError extends Error {}

function parseTelebirrSMS(smsText) {
  if (!smsText) return null

  const idMatch = smsText.match(/Your transaction number is\s+([A-Z0-9]+)/i)
  const transactionId = idMatch ? idMatch[1] : null

  const amountMatch = smsText.match(/(?:paid|transferred)\s+ETB\s+([0-9.]+)/i)
  const amount = amountMatch ? parseFloat(amountMatch[1]) : null

  const payerMatch = smsText.match(/Dear\s+([A-Za-z\s]+)/i)
  const payerName = payerMatch ? payerMatch[1].trim() : null

  const receiverMatch = smsText.match(/to\s+([A-Za-z\s]+)\s+\(([0-9*]+)\)/i)
  const receiverName = receiverMatch ? receiverMatch[1].trim() : null
  const receiverNumber = receiverMatch ? receiverMatch[2] : null

  if (!transactionId || !amount || !receiverName) {
    return null
  }

  return {
    transactionId,
    amount,
    payerName,
    receiverName,
    receiverNumber,
    rawText: smsText,
  }
}

function normalizeAccountNumber(value) {
  let accountNumber = String(value || '').trim().replace(/\D/g, '')
  if (accountNumber.startsWith('251')) {
    accountNumber = accountNumber.slice(3)
  } else if (accountNumber.startsWith('0')) {
    accountNumber = accountNumber.slice(1)
  }
  return accountNumber
}

function parseSettledAmount(value) {
  const match = String(value ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*(?:birr)?\s*$/i)
  const amount = match ? Number(match[1]) : NaN
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PaymentVerificationError('Receipt has an invalid settled amount.')
  }
  return amount
}

function parseTelebirrPaymentDate(value) {
  const match = String(value || '').match(/^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!match) {
    throw new PaymentVerificationError('Receipt has an invalid payment date.')
  }

  const [, dayText, monthText, yearText, hourText, minuteText, secondText] = match
  const day = Number(dayText)
  const month = Number(monthText)
  const year = Number(yearText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  const utcTime = Date.UTC(year, month - 1, day, hour, minute, second)
  const checkDate = new Date(utcTime)

  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new PaymentVerificationError('Receipt has an invalid payment date.')
  }

  // Telebirr timestamps are in Ethiopia time (UTC+3).
  return utcTime - 3 * 60 * 60 * 1000
}

async function verifyTelebirrReference({ reference, expectedAmount, userId }) {
  if (typeof reference !== 'string' || !/^[A-Z0-9]{6,20}$/.test(reference)) {
    throw new PaymentVerificationError('Enter a valid Telebirr transaction reference.')
  }

  const amountToMatch = Number(expectedAmount)
  if (!Number.isFinite(amountToMatch) || amountToMatch <= 0) {
    throw new PaymentVerificationError('Enter a valid deposit amount.')
  }
  if (!userId) {
    throw new PaymentVerificationError('Unable to identify the deposit user.')
  }

  const apiKey = process.env.LINKS_ET_API_KEY
  if (!apiKey) {
    throw new PaymentVerificationError('Receipt verification is not configured.')
  }
  if (!process.env.TELEBIRR_RECEIVER_NUMBER) {
    throw new PaymentVerificationError('Telebirr receiver account is not configured.')
  }

  let response
  let data
  try {
    response = await fetch(LINKS_ET_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Idempotency-Key': `verify-${reference}-${userId}`,
      },
      body: JSON.stringify({ reference }),
    })
    if (!response.ok) {
      throw new PaymentVerificationError('Receipt verification service rejected the request.')
    }
    data = await response.json()
  } catch (err) {
    if (err instanceof PaymentVerificationError) throw err
    throw new PaymentVerificationError('Unable to verify this receipt right now.')
  }

  if (data?.ok !== true || !data.receipt || typeof data.receipt !== 'object') {
    throw new PaymentVerificationError('Receipt was not found or could not be verified.')
  }

  const receipt = data.receipt
  if (receipt.transactionStatus !== 'Completed') {
    throw new PaymentVerificationError('Telebirr transaction is not completed.')
  }

  const expectedAccount = normalizeAccountNumber(process.env.TELEBIRR_RECEIVER_NUMBER)
  const creditedAccount = normalizeAccountNumber(receipt.creditedPartyAccountNo)
  if (!expectedAccount || creditedAccount !== expectedAccount) {
    throw new PaymentVerificationError('Receipt was not paid to the configured Telebirr account.')
  }

  const amount = parseSettledAmount(receipt.settledAmount)
  if (Math.abs(amount - amountToMatch) > 0.01) {
    throw new PaymentVerificationError('Receipt amount does not match the deposit amount.')
  }

  const paymentTime = parseTelebirrPaymentDate(receipt.paymentDate)
  const now = Date.now()
  const maxAgeMinutes = Number(process.env.TELEBIRR_MAX_AGE_MINUTES || 15)
  const maxAgeMs = (Number.isFinite(maxAgeMinutes) && maxAgeMinutes > 0 ? maxAgeMinutes : 15) * 60 * 1000
  if (paymentTime - now > 2 * 60 * 1000) {
    throw new PaymentVerificationError('Receipt payment date is in the future.')
  }
  if (now - paymentTime > maxAgeMs) {
    throw new PaymentVerificationError('Receipt has expired. Use a recent Telebirr transaction.')
  }

  return { reference, amount, rawResponse: data }
}

async function creditVerifiedDeposit({ userId, reference, amount }) {
  const verified = await verifyTelebirrReference({
    reference,
    expectedAmount: amount,
    userId,
  })

  let newBalance
  await db.transaction(async (trx) => {
    await trx('verified_transactions').insert({
      reference: verified.reference,
      user_id: userId,
      amount: verified.amount,
      provider: 'telebirr',
      raw_response: verified.rawResponse,
    })

    await trx('users')
      .where({ id: userId })
      .increment('wallet_balance', verified.amount)

    await trx('financial_ledger').insert({
      user_id: userId,
      type: 'deposit',
      amount: verified.amount,
      reference: verified.reference,
    })

    await trx('payments').insert({
      user_id: userId,
      type: 'deposit',
      provider: 'telebirr',
      amount: verified.amount,
      status: 'approved',
      transaction_reference: verified.reference,
      provider_response: verified.rawResponse,
    })

    const user = await trx('users').where({ id: userId }).first()
    if (!user) throw new Error('Deposit user not found.')
    newBalance = Number(user.wallet_balance)
  })

  return {
    success: true,
    amount: verified.amount,
    newBalance,
  }
}

async function verifyTelebirrReceipt(reference, expectedAmount, userId) {
  try {
    const verified = await verifyTelebirrReference({ reference, expectedAmount, userId })
    const receipt = verified.rawResponse.receipt
    return {
      success: true,
      amount: verified.amount,
      payerName: receipt.payerName || 'Unknown',
      receiverName: receipt.creditedPartyName || '',
      transactionId: verified.reference,
      status: 'Completed',
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

async function processDeposit(userId, amount, reference) {
  try {
    return await creditVerifiedDeposit({ userId, reference, amount })
  } catch (err) {
    if (err.code === '23505') return { error: 'This transaction has already been used.' }
    return { error: err.message }
  }
}

module.exports = {
  PaymentVerificationError,
  verifyTelebirrReference,
  creditVerifiedDeposit,
  verifyTelebirrReceipt,
  processDeposit,
  parseTelebirrSMS,
}
