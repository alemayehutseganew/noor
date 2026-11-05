import { useEffect, useState } from 'react'
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
      }
    } catch (err) {
      console.error('Failed to load user:', err)
    }
  }

  useEffect(() => {
    if (!localStorage.getItem('dbUserId')) {
      navigate('/')
    }
  }, [navigate])

  useEffect(() => {
    loadUser()
  }, [token])

  useEffect(() => {
    refreshBalance().catch((err) => console.error('Failed to refresh wallet balance:', err))
    const onFocus = () => refreshBalance().catch((err) => console.error('Failed to refresh wallet balance:', err))
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
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
        refreshBalance().catch((err) => console.error('Failed to refresh wallet balance:', err))
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

  const withdraw = async () => {
    setSubmitting(true)
    setMessage('')
    setMessageType('')
    try {
      const res = await fetchApi('/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount: Number(withdrawAmount), provider: 'telebirr', phoneNumber }),
      })
      const data = await res.json()
      if (data.success) {
        setMessage(data.message || t('withdrawalSubmitted'))
        setMessageType('success')
        loadUser()
        refreshBalance().catch((err) => console.error('Failed to refresh wallet balance:', err))
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

  const inputClass = "w-full bg-[#1e3a5f] text-white placeholder-gray-400 border-2 border-gray-600 rounded-lg p-3 focus:outline-none focus:border-yellow-500"

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f2027] via-[#203a43] to-[#2c5364] text-white p-4">
      <button onClick={() => navigate('/')} className="mb-4 text-yellow-400">← {t('back')}</button>
      <h1 className="text-2xl font-bold mb-4">{t('wallet')}</h1>

      {/* Balance Card */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-4">
        <p className="text-sm text-gray-300 uppercase font-bold">{t('balance')}</p>
        <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500">
          ETB {balance}
        </p>
      </div>

      {/* Manual Deposit */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-4">
        <h2 className="text-lg font-bold mb-3">{t('manualDeposit')}</h2>
        <div className="bg-[#1e3a5f] border-2 border-yellow-500 rounded-xl p-4 mb-4">
          <p className="text-sm text-gray-300 mb-2">{t('sendDeposit')}</p>
          <div className="flex items-center justify-between bg-[#112A46] rounded-lg p-3">
            <span className="text-2xl font-black text-yellow-400 tracking-wider">0989002307</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText('0989002307');
                alert(t('numberCopied'))
              }}
              className="bg-yellow-500 text-[#112A46] px-3 py-1 rounded text-sm font-bold"
            >
              {t('copy')}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">{t('accountName')} <strong>Kenaw Nuru Muhabe</strong></p>
          <p className="text-xs text-gray-400">{t('pasteReceipt')}</p>
        </div>
        <div className="mb-3">
          <label className="block text-sm mb-1">{t('amountToDeposit')}</label>
          <input
            type="number"
            placeholder={t('exampleAmount')}
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            className="w-full bg-[#1e3a5f] text-white placeholder-gray-400 border-2 border-gray-600 rounded-lg p-3 focus:outline-none focus:border-yellow-500"
          />
        </div>
        <div className="mb-3">
          <label className="block text-sm mb-1">{t('receiptReference')}</label>
          <input
            type="text"
            placeholder={t('exampleReference')}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full bg-[#1e3a5f] text-white placeholder-white border-2 border-gray-600 rounded-lg p-3"
          />
        </div>
        <button
          onClick={deposit}
          disabled={loading || submitting}
          className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-[#0f2027] font-bold py-2 rounded disabled:opacity-50 mt-2"
        >
          {t('verifyDeposit')}
        </button>
      </div>

      {/* Withdraw */}
      <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 mb-4">
        <h2 className="text-lg font-bold mb-2">{t('withdraw')}</h2>
        <p className="text-sm text-gray-300 mb-2">{t('minimumWithdrawal')}</p>
        <input
          type="number"
          placeholder={t('amount')}
          value={withdrawAmount}
          onChange={(e) => setWithdrawAmount(e.target.value)}
          className="w-full bg-[#1e3a5f] text-white placeholder-white border-2 border-gray-600 rounded-lg p-3 mb-2"
        />
        <input
          type="text"
          placeholder={t('phoneNumber')}
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          className="w-full bg-[#1e3a5f] text-white placeholder-white border-2 border-gray-600 rounded-lg p-3 mb-2"
        />
        <button
          onClick={withdraw}
          disabled={loading || submitting}
          className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-[#0f2027] font-bold py-2 rounded disabled:opacity-50 mt-2"
        >
          {t('withdraw')}
        </button>
      </div>

      {message && (
        <p className={`mt-4 text-center font-bold ${messageType === 'success' ? 'text-green-400' : 'text-red-400'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
