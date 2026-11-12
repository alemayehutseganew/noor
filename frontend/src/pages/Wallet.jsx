import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useWallet } from '../WalletContext'
import { fetchApi } from '../services/api'

export default function Wallet() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { balance, loading, refreshBalance } = useWallet()
  const [user, setUser] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const [connectionError, setConnectionError] = useState('')
  const [depositAmount, setDepositAmount] = useState('')
  const [reference, setReference] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState(100)
  const [phoneNumber, setPhoneNumber] = useState('')

  const token = localStorage.getItem('token')
  const userId = user?.id || localStorage.getItem('dbUserId')

  const loadUser = async () => {
    try {
      const res = await fetchApi('/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const data = await res.json()
        setUser(data)
        setConnectionError('')
      } else {
        throw new Error(`Failed to load user: ${res.status}`)
      }
    } catch (err) {
      console.error('Failed to load user:', err)
      setConnectionError('Connection slow. Please refresh.')
    }
  }

  const refreshWalletBalance = useCallback(async () => {
    try {
      await refreshBalance()
      setConnectionError('')
    } catch (err) {
      console.error('Failed to refresh wallet balance:', err)
      setConnectionError('Connection slow. Please refresh.')
    }
  }, [refreshBalance])

  useEffect(() => {
    if (!localStorage.getItem('dbUserId')) {
      navigate('/')
    }
  }, [navigate])

  useEffect(() => {
    loadUser()
  }, [token])

  useEffect(() => {
    let isActive = true
    const updateBalance = async () => {
      try {
        await refreshBalance()
        if (isActive) setConnectionError('')
      } catch (err) {
        console.error('Failed to refresh wallet balance:', err)
        if (isActive) setConnectionError('Connection slow. Please refresh.')
      }
    }

    updateBalance()
    const onFocus = () => updateBalance()
    window.addEventListener('focus', onFocus)
    return () => {
      isActive = false
      window.removeEventListener('focus', onFocus)
    }
  }, [refreshBalance])

  const deposit = async () => {
    setSubmitting(true)
    setMessage('')
    setMessageType('')
    try {
      const res = await fetchApi('/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount: Number(depositAmount), reference }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage(t('depositVerified'))
        setMessageType('success')
        loadUser()
        refreshWalletBalance()
      } else {
        setMessage(data.error || t('verificationFailed'))
        setMessageType('error')
      }
    } catch (e) {
      setMessage(t('networkError'))
      setMessageType('error')
    } finally {
      setSubmitting(false)
    }
  }

  const withdraw = async (source = 'wallet', amount = withdrawAmount) => {
    setSubmitting(true)
    setMessage('')
    setMessageType('')
    try {
      const res = await fetchApi('/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount: Number(amount), provider: 'telebirr', phoneNumber, source }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage(data.message || t('withdrawalSubmitted'))
        setMessageType('success')
        loadUser()
        refreshWalletBalance()
      } else {
        setMessage(data.error || t('withdrawalFailed'))
        setMessageType('error')
      }
    } catch (e) {
      setMessage(t('networkError'))
      setMessageType('error')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass = "w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white placeholder-slate-500 shadow-inner focus:border-blue-500 focus:outline-none"

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f172a] via-[#1e293b] to-[#020617] p-4 text-white">
      <div className="mx-auto max-w-2xl">
        <header className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-600/50 bg-slate-800/50 p-3 shadow-2xl backdrop-blur-lg">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex min-h-11 items-center rounded-xl border border-slate-600/50 bg-slate-700/80 px-4 font-bold text-yellow-300 shadow-[0_4px_0_rgb(30,41,59)] transition-all hover:bg-slate-600 active:translate-y-1 active:shadow-none"
          >
            ← {t('back')}
          </button>
          <h1 className="text-xl font-black text-white sm:text-2xl">{t('wallet')}</h1>
        </header>
        {connectionError && (
          <p role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-center text-red-300">{connectionError}</p>
        )}

      {/* Balance Card */}
      <div className="relative mb-4 overflow-hidden rounded-3xl border border-slate-600/50 bg-gradient-to-br from-slate-800/80 to-slate-900/90 p-6 text-center shadow-[0_0_30px_rgba(59,130,246,0.15)] backdrop-blur-lg">
        <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-blue-500 to-emerald-400" />
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-slate-400">{t('playable_balance')}</p>
        <p className="bg-gradient-to-r from-emerald-300 to-emerald-500 bg-clip-text text-4xl font-black text-transparent drop-shadow-[0_0_15px_rgba(52,211,153,0.4)] sm:text-5xl">
          {balance} ETB
        </p>
        <p className="mt-1 text-xs text-slate-400">{t('withdraw_anytime')}</p>
      </div>

      {/* Manual Deposit */}
      <div className="mb-4 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-5 shadow-xl backdrop-blur-lg sm:p-6">
        <h2 className="mb-3 text-lg font-bold text-slate-100">{t('manualDeposit')}</h2>
        <div className="mb-4 rounded-xl border border-yellow-500/50 bg-gradient-to-br from-slate-800 to-slate-900 p-4 shadow-inner">
          <p className="mb-2 text-sm text-slate-300">{t('sendDeposit')}</p>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950/80 p-3">
            <span className="text-xl font-black tracking-wider text-yellow-400 sm:text-2xl">0989002307</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText('0989002307');
                alert(t('numberCopied'))
              }}
              className="min-h-11 rounded-lg bg-gradient-to-b from-yellow-300 to-amber-500 px-4 text-sm font-bold text-slate-950 shadow-[0_4px_0_#92400e] transition-all active:translate-y-1 active:shadow-none"
            >
              {t('copy')}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">{t('accountName')} <strong className="text-slate-200">Kenaw Nuru Muhabe</strong></p>
          <p className="text-xs text-slate-400">{t('pasteReceipt')}</p>
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-slate-200">{t('amountToDeposit')}</label>
          <input
            type="number"
            placeholder={t('exampleAmount')}
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="mb-3">
          <label className="mb-1 block text-sm font-medium text-slate-200">{t('receiptReference')}</label>
          <input
            type="text"
            placeholder={t('exampleReference')}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className={inputClass}
          />
        </div>
        <button
          type="button"
          onClick={deposit}
          disabled={loading || submitting}
          className="mt-2 min-h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-3.5 font-bold text-white shadow-[0_5px_0_#1e3a8a] transition-all active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('verifyDeposit')}
        </button>
      </div>

      {/* Withdraw */}
      <div className="mb-4 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-5 shadow-xl backdrop-blur-lg sm:p-6">
        <h2 className="mb-2 text-lg font-bold text-slate-100">{t('withdraw')}</h2>
        <p className="mb-2 text-sm text-slate-300">{t('minimumWithdrawal')}</p>
        <input
          type="number"
          placeholder={t('amount')}
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value)}
          className={`${inputClass} mb-2`}
        />
        <input
          type="text"
          placeholder={t('phoneNumber')}
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          className={`${inputClass} mb-2`}
        />
        <button
          type="button"
          onClick={withdraw}
          disabled={loading || submitting}
          className="mt-2 min-h-12 w-full rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 py-3.5 font-bold text-white shadow-[0_5px_0_#1e3a8a] transition-all active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('withdraw')}
        </button>
      </div>

      {message && (
        <p className={`mt-4 rounded-xl border p-3 text-center font-bold ${messageType === 'success' ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300' : 'border-red-400/20 bg-red-500/10 text-red-300'}`}>
          {message}
        </p>
      )}
      </div>
    </div>
  )
}
