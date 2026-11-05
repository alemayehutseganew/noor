const db = require('../db')

const LINKS_ET_VERIFY_URL = 'https://links.et/api/verify'
const LINKS_ET_REQUEST_TIMEOUT_MS = 35_000
const LINKS_ET_POLL_INTERVAL_MS = 2_000
const LINKS_ET_POLL_ATTEMPTS = 5
const LINKS_ET_RETRY_ATTEMPTS = 3
const LINKS_ET_RETRY_DELAY_MS = 3_000

class PaymentVerificationError extends Error {}
class RetryableVerificationError extends PaymentVerificationError {}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchLinksEt(url, options) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), LINKS_ET_REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    throw new RetryableVerificationError(err.message)
  } finally {
    clearTimeout(timeoutId)
  }
}

async function readLinksEtResponse(response) {
  console.log('[TELEBIRR VERIFY] HTTP status:', response.status)

  let data
  try {
    data = await response.json()
  } catch (err) {
    if (response.status !== 200 && response.status !== 202) {
      throw new PaymentVerificationError(
        `links.et verification failed with HTTP ${response.status}.`
      )
    }
    throw new RetryableVerificationError(`Invalid response from links.et: ${err.message}`)
  }

  if (response.status !== 202 && data?.ok === false) {
    throw new PaymentVerificationError(
      typeof data.error === 'string' && data.error
        ? data.error
        : 'Receipt was not found or could not be verified.'
    )
  }

  return data
}

async function requestLinksEtVerification({ reference, url, apiKey, userId }) {
  const response = await fetchLinksEt(LINKS_ET_VERIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'Idempotency-Key': `verify-${reference}-${userId}`,
    },
    body: JSON.stringify(url ? { url, waitMs: 30_000 } : { reference, waitMs: 30_000 }),
  })
  let data = await readLinksEtResponse(response)

  if (response.status === 202) {
    if (!data?.requestId && !data?.pollUrl) {
      throw new PaymentVerificationError(
        data?.error || 'Verification is still processing, but links.et did not provide a polling URL.'
      )
    }

    let pollUrl
    try {
      pollUrl = new URL(
        data.pollUrl || `${LINKS_ET_VERIFY_URL}/${encodeURIComponent(data.requestId)}`,
        LINKS_ET_VERIFY_URL
      )
      if (pollUrl.protocol !== 'https:' || pollUrl.hostname !== 'links.et') {
        throw new Error('Invalid links.et polling URL')
      }
    } catch {
      throw new PaymentVerificationError('links.et returned an invalid polling URL.')
    }

    for (let attempt = 0; attempt < LINKS_ET_POLL_ATTEMPTS; attempt += 1) {
      await delay(LINKS_ET_POLL_INTERVAL_MS)
      const pollResponse = await fetchLinksEt(pollUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'x-api-key': apiKey,
        },
      })
      data = await readLinksEtResponse(pollResponse)

      if (pollResponse.status === 200) return data
      if (pollResponse.status !== 202) {
        throw new PaymentVerificationError(
          data?.error || `links.et verification failed with HTTP ${pollResponse.status}.`
        )
      }
    }

    throw new RetryableVerificationError('links.et verification remained pending after polling.')
  }

  if (response.status !== 200) {
    throw new PaymentVerificationError(
      data?.error || `links.et verification failed with HTTP ${response.status}.`
    )
  }

  return data
}

function parseTelebirrSMS(smsText) {
  if (!smsText) return null

  const { reference: transactionId, url: receiptUrl } = extractTelebirrReceipt(smsText)

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
    receiptUrl,
    amount,
    payerName,
    receiverName,
    receiverNumber,
    rawText: smsText,
  }
}

function extractTelebirrReceipt(smsText) {
  const transactionMatch = smsText.match(
    /(?:transaction\s+number(?:\s+is)?|reference)[\s:#]*([A-Z0-9]{6,20})(?![A-Z0-9])/i
  )
  const receiptMatch = smsText.match(
    /https:\/\/transactioninfo\.ethiotelecom\.et\/receipt\/([A-Z0-9]{10})(?![A-Z0-9])/i
  )
  const reference = (transactionMatch?.[1] || receiptMatch?.[1] || '').toUpperCase() || null

  return {
    reference,
    url: receiptMatch
      ? `https://transactioninfo.ethiotelecom.et/receipt/${receiptMatch[1].toUpperCase()}`
      : null,
  }
}

function normalizeAccountPrefix(accountNumber) {
  if (accountNumber.startsWith('251')) {
    return accountNumber.slice(3)
  }
  if (accountNumber.startsWith('0')) {
    return accountNumber.slice(1)
  }
  return accountNumber
}

function isAccountMatch(maskedReceiptAccount, expectedTelebirrNumber) {
  if (!maskedReceiptAccount || !expectedTelebirrNumber) return false

  const cleanMasked = normalizeAccountPrefix(
    String(maskedReceiptAccount).replace(/[^0-9*]/g, '')
  )
  const cleanExpected = normalizeAccountPrefix(
    String(expectedTelebirrNumber).replace(/[^0-9]/g, '')
  )
  if (!cleanExpected) return false

  if (!cleanMasked.includes('*')) {
    return cleanMasked === cleanExpected
  }

  const parts = cleanMasked.split('*').filter(Boolean)
  if (parts.length === 0) return false

  const firstPart = parts[0]
  const lastPart = parts[parts.length - 1]
  if (!cleanExpected.startsWith(firstPart) || !cleanExpected.endsWith(lastPart)) {
    return false
  }

  if (parts.length > 2) {
    let searchIndex = firstPart.length
    const suffixStart = cleanExpected.length - lastPart.length
    for (let i = 1; i < parts.length - 1; i++) {
      const index = cleanExpected.indexOf(parts[i], searchIndex)
      if (index === -1 || index + parts[i].length > suffixStart) return false
      searchIndex = index + parts[i].length
    }
  }

  return true
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

async function verifyTelebirrReference({ reference, expectedAmount, userId, receiptUrl }) {
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

  let url
  if (receiptUrl) {
    try {
      const parsedUrl = new URL(receiptUrl)
      const expectedPath = `/receipt/${reference}`
      if (
        parsedUrl.protocol !== 'https:' ||
        parsedUrl.hostname !== 'transactioninfo.ethiotelecom.et' ||
        parsedUrl.pathname.toUpperCase() !== expectedPath.toUpperCase() ||
        parsedUrl.username ||
        parsedUrl.password
      ) {
        throw new Error('Invalid Telebirr receipt URL')
      }
      url = `https://transactioninfo.ethiotelecom.et${expectedPath}`
    } catch {
      throw new PaymentVerificationError('Telebirr receipt link does not match the transaction reference.')
    }
  }

  let data
  for (let attempt = 1; attempt <= LINKS_ET_RETRY_ATTEMPTS; attempt += 1) {
    try {
      data = await requestLinksEtVerification({ reference, url, apiKey, userId })
      break
    } catch (err) {
      console.error('[TELEBIRR VERIFY] Attempt failed:', err.message)
      if (!(err instanceof RetryableVerificationError)) throw err
      if (attempt === LINKS_ET_RETRY_ATTEMPTS) {
        throw new PaymentVerificationError(
          "Telebirr's server is currently slow. Please try again in a few minutes."
        )
      }
      await delay(LINKS_ET_RETRY_DELAY_MS)
    }
  }

  if (data?.ok !== true || !data.receipt || typeof data.receipt !== 'object') {
    throw new PaymentVerificationError('Receipt was not found or could not be verified.')
  }

  const receipt = data.receipt
  if (receipt.transactionStatus !== 'Completed') {
    throw new PaymentVerificationError('Telebirr transaction is not completed.')
  }

  if (!isAccountMatch(receipt.creditedPartyAccountNo, process.env.TELEBIRR_RECEIVER_NUMBER)) {
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

async function creditVerifiedDeposit({ userId, reference, amount, receiptUrl }) {
  const verified = await verifyTelebirrReference({
    reference,
    expectedAmount: amount,
    userId,
    receiptUrl,
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
  extractTelebirrReceipt,
}
