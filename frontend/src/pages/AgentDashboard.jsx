import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useWallet } from '../WalletContext'
import { fetchApi } from '../services/api'
import ReferralPromo from '../components/ReferralPromo'

const REFERRAL_THRESHOLD = 1000

export default function AgentDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { referralBalance } = useWallet()
  const [referrals, setReferrals] = useState(null)
  const [error, setError] = useState('')
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    let active = true

    const fetchReferrals = async () => {
      try {
        const response = await fetchApi('/users/referrals')
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || t('referral_load_failed'))
        if (active) {
          setReferrals(data)
          setError('')
        }
      } catch (err) {
        console.error('[FRONTEND] Failed to fetch agent data:', err)
        if (active) setError(err.message || t('referral_load_failed'))
      }
    }

    fetchReferrals()
    window.addEventListener('wallet-refresh', fetchReferrals)

    return () => {
      active = false
      window.removeEventListener('wallet-refresh', fetchReferrals)
    }
  }, [t])

  const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'GoBingoBot').replace(/^@/, '')
  const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user
  const username = telegramUser?.username || localStorage.getItem('telegramUsername') || referrals?.username
  const telegramId = telegramUser?.id || localStorage.getItem('telegramId') || referrals?.telegram_id
  const referralRef = username ? `@${username}` : String(telegramId || referrals?.referral_code || '')
  const startPayload = username
    ? `u_${username}`
    : telegramId
      ? `i_${telegramId}`
      : ''
  const referralLink = startPayload
    ? `https://t.me/${botUsername}?start=${encodeURIComponent(startPayload)}`
    : ''
  const threshold = Number(referrals?.referral_threshold) || REFERRAL_THRESHOLD
  const agentBalance = Number(referrals?.referral_balance ?? referralBalance) || 0
  const progress = Math.min(Math.max((agentBalance / threshold) * 100, 0), 100)

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink)
      setCopyMessage(t('link_copied'))
    } catch (err) {
      console.error('Failed to copy referral link:', err)
      setCopyMessage(t('copy_failed'))
    }
  }

  const shareToTelegram = async () => {
    const telegram = window.Telegram?.WebApp
    if (telegram?.switchInlineQuery && referralRef) {
      telegram.switchInlineQuery(`start=${referralRef}`, ['groups', 'channels', 'users'])
      return
    }

    await copyLink()
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f2027] via-[#203a43] to-[#2c5364] text-white p-4">
      <button onClick={() => navigate('/')} className="mb-4 text-yellow-400">
        ← {t('back')}
      </button>
      <h1 className="text-2xl font-bold mb-4">{t('agent_dashboard')}</h1>
      <ReferralPromo />

      {error ? (
        <p role="alert" className="bg-red-500/10 border border-red-400/30 text-red-200 rounded-xl p-4">
          {error}
        </p>
      ) : !referrals ? (
        <p className="text-gray-300">{t('loading')}</p>
      ) : (
        <div className="max-w-xl mx-auto space-y-4">
          <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm text-gray-300 uppercase font-bold">{t('your_referral_link')}</h2>
            <p className="text-sm text-gray-300 mt-2">{t('tg_username')}</p>
            <p className="text-xl font-black text-yellow-400 mt-1 break-all">
              {username ? `@${username}` : telegramId || referrals.referral_code || '—'}
            </p>
            {!username && <p className="text-sm text-yellow-300 mt-2">{t('no_tg_username_warning')}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              <button
                onClick={copyLink}
                disabled={!referralLink}
                className="w-full bg-yellow-500 text-[#0f2027] font-bold py-3 rounded-xl"
              >
                {t('copy_bot_link')}
              </button>
              <button
                onClick={shareToTelegram}
                disabled={!referralRef}
                className="w-full bg-sky-600 text-white font-bold py-3 rounded-xl"
              >
                {t('share_to_group')}
              </button>
            </div>
            {copyMessage && <p role="status" className="text-sm text-gray-300 mt-2">{copyMessage}</p>}
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h2 className="text-sm text-gray-300 uppercase font-bold">{t('total_earned')}</h2>
              <p className="text-2xl font-black text-green-400 mt-2">
                {Number(referrals.total_earned || 0).toFixed(2)} ETB
              </p>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <h2 className="text-sm text-gray-300 uppercase font-bold">{t('agent_balance')}</h2>
              <p className="text-2xl font-black mt-2">
                {agentBalance.toFixed(2)} / {threshold} ETB
              </p>
              <div
                className="w-full bg-gray-900 rounded-full h-2.5 mt-3"
                role="progressbar"
                aria-label={t('agent_balance')}
                aria-valuemin={0}
                aria-valuemax={threshold}
                aria-valuenow={Math.min(Math.max(agentBalance, 0), threshold)}
              >
                <div className="bg-blue-500 h-2.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </section>

          <section className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-5">
            <h2 className="text-lg font-bold mb-3">{t('invited_players')}</h2>
            {referrals.referred_users.length === 0 ? (
              <p className="text-sm text-gray-300">{t('no_referrals_yet')}</p>
            ) : (
              <ul className="divide-y divide-white/10">
                {referrals.referred_users.map((player) => (
                  <li key={player.id} className="flex items-center justify-between gap-4 py-3">
                    <span className="font-medium">{player.name}</span>
                    <time className="text-sm text-gray-400 shrink-0">
                      {player.joined_at ? new Date(player.joined_at).toLocaleDateString() : ''}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
