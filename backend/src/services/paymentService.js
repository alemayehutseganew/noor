const db = require('../db')

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

async function verifyTelebirrReceipt(reference) {
  try {
    const apiKey = process.env.LINKS_ET_API_KEY;
    if (!apiKey) {
      console.error('[links.et] API key is missing');
      return { success: false, error: 'Verification service not configured.' };
    }

    const response = await fetch('https://links.et/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        reference: reference // e.g., "DK23KZROXJ"
      })
    });

    const data = await response.json();

    if (!data.ok) {
      return { 
        success: false, 
        error: data.error || 'Receipt not found or invalid.' 
      };
    }

    const receipt = data.receipt || {};

    if (receipt.source !== 'telebirr-html') {
      return { success: false, error: 'This is not a valid Telebirr receipt.' };
    }

    const amountString = receipt.settledAmount || receipt.totalPaidAmount;
    const amountMatch = String(amountString).match(/([0-9.]+)/);
    const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

    if (amount <= 0) {
      return { success: false, error: 'Could not extract a valid amount from the receipt.' };
    }

    const VALID_RECEIVER_NAMES = ['Kenaw Nuru Muhabe', 'Kenaw Nuru Muhabe'];
    const receiverName = receipt.creditedPartyName || '';
    const isValidName = VALID_RECEIVER_NAMES.some(name => receiverName.toUpperCase().includes(name));
    if (receiverName && !isValidName) {
      return { 
        success: false, 
        error: `Receipt was sent to ${receiverName}, not to our platform account.` 
      };
    }

    if (receipt.transactionStatus && receipt.transactionStatus !== 'Completed') {
      return { 
        success: false, 
        error: `Transaction status is "${receipt.transactionStatus}", not completed.` 
      };
    }

    return {
      success: true,
      amount: amount,
      payerName: receipt.payerName || 'Unknown',
      receiverName: receiverName,
      transactionId: receipt.receiptNo || reference,
      status: 'Completed'
    };
  } catch (err) {
    console.error('[links.et] Verification error:', err.message);
    return { 
      success: false, 
      error: 'Unable to reach verification service. Please try again later.' 
    };
  }
}

async function processDeposit(userId, amount, reference) {
  const existing = await db('payments').where({ transaction_reference: reference }).first()
  if (existing) return { error: 'This receipt has already been used.' }

  const verify = await verifyTelebirrReceipt(reference)
  if (!verify.success) return { error: 'Invalid receipt' }
  if (Math.abs(verify.amount - Number(amount)) > 0.001) {
    return { error: 'Amount mismatch' }
  }

  let newBalance
  await db.transaction(async (trx) => {
    await trx('payments').insert({
      user_id: userId,
      type: 'deposit',
      provider: 'telebirr',
      amount: verify.amount,
      status: 'VERIFIED',
      transaction_reference: reference,
      provider_response: { payerName: verify.payerName },
    })
    await trx('users').where({ id: userId }).increment('wallet_balance', verify.amount)
    const hasLedger = await trx.schema.hasTable('financial_ledger')
    if (hasLedger) {
      await trx('financial_ledger').insert({
        user_id: userId,
        type: 'DEPOSIT',
        amount: verify.amount,
        reference: reference,
        created_at: new Date(),
      })
    }
    const u = await trx('users').where({ id: userId }).first()
    newBalance = u.wallet_balance
  })

  return { success: true, newBalance }
}

module.exports = { verifyTelebirrReceipt, processDeposit, parseTelebirrSMS }
