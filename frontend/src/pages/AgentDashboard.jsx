import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../services/api'
import { useWallet } from '../WalletContext'

const WITHDRAWAL_THRESHOLD = 1000

export default function AgentDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { referralBalance, refreshBalance } = useWallet()
  const [referrals, setReferrals] = useState(null)
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadReferrals = useCallback(async () => {
    const response = await fetchApi('/users/referrals', { cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || t('referral_load_failed'))
    setReferrals(data)
  }, [t])

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      navigate('/')
      return
    }

    let active = true
    const load = async () => {
      setLoading(true)
      try {
        await loadReferrals()
        await refreshBalance()
      } catch (loadError) {
        console.error('Failed to load agent dashboard:', loadError)
        if (active) setError(loadError.message || t('referral_load_failed'))
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [loadReferrals, navigate, refreshBalance, t])

  const botUsername = (import.meta.env.VITE_BOT_USERNAME || 'GoBingoBot').replace(/^@/, '')
  const referralLink = useMemo(() => {
    if (!referrals?.referral_code) return ''
    return `https://t.me/${botUsername}?start=ref_${encodeURIComponent(referrals.referral_code)}`
  }, [botUsername, referrals?.referral_code])

  const copyLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(referralLink)
      } else {
        const temporaryInput = document.createElement('textarea')
        temporaryInput.value = referralLink
        temporaryInput.setAttribute('readonly', '')
        temporaryInput.style.position = 'absolute'
        temporaryInput.style.left = '-9999px'
        document.body.appendChild(temporaryInput)
        let copied
        try {
          temporaryInput.select()
          copied = document.execCommand('copy')
        } finally {
          temporaryInput.remove()
        }
        if (!copied) throw new Error('Clipboard copy was rejected.')
      }
      setNotice(t('link_copied'))
      setError('')
    } catch (copyError) {
      console.error('Failed to copy referral link:', copyError)
      setError(t('copy_failed'))
      setNotice('')
    }
  }

  const shareLink = () => {
    const telegram = window.Telegram?.WebApp
    if (typeof telegram?.switchInlineQuery === 'function') {
      telegram.switchInlineQuery(`ref_${referrals.referral_code}`, ['groups', 'channels'])
      return
    }

    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}`
    window.open(shareUrl, '_blank', 'noopener,noreferrer')
  }

  const withdraw = async () => {
    const amount = withdrawAmount === '' ? referralBalance : Number(withdrawAmount)
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const response = await fetchApi('/wallet/withdraw-agent', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          provider: 'telebirr',
          phoneNumber,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || t('referral_withdrawal_failed'))
      }

      setNotice(data.message || t('referral_withdrawal_success'))
      setWithdrawAmount('')
      setReferrals((previous) => ({
        ...previous,
        referral_balance: data.referralBalance,
      }))
      loadReferrals().catch((refreshError) => console.error('Failed to refresh referral data:', refreshError))
      refreshBalance().catch((refreshError) => console.error('Failed to refresh wallet data:', refreshError))
    } catch (withdrawError) {
      console.error('Agent withdrawal failed:', withdrawError)
      setError(withdrawError.message || t('referral_withdrawal_failed'))
    } finally {
      setSubmitting(false)
    }
  }

  const currentReferralBalance = Number(referralBalance) || 0
  const progress = Math.min(Math.max((currentReferralBalance / WITHDRAWAL_THRESHOLD) * 100, 0), 100)

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0f2027] via-[#203a43] to-[#2c5364] px-4 py-6 text-white">
      <div className="mx-auto max-w-xl">
        <button onClick={() => navigate('/')} className="mb-5 text-yellow-400 hover:text-yellow-300">
          ← {t('back')}
        </button>
        <header className="mb-6">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-yellow-400">GOBINGO</p>
          <h1 className="mt-1 text-3xl font-black">{t('agent_dashboard')}</h1>
        </header>

        {loading ? (
          <p className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-gray-300">
            {t('loading')}
          </p>
        ) : (
          <>
            <section className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-xl">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-300">{t('referral_link')}</h2>
              <p className="break-all rounded-xl bg-black/20 p-3 font-mono text-sm text-yellow-200">{referralLink}</p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  onClick={copyLink}
                  className="rounded-xl bg-yellow-400 px-4 py-3 font-bold text-[#10252c] transition hover:bg-yellow-300"
                >
                  {t('copy_link')}
                </button>
                <button
                  onClick={shareLink}
                  className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 font-bold transition hover:bg-white/20"
                >
                  {t('share_to_telegram')}
                </button>
              </div>
            </section>

            <section className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-xl">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-300">{t('total_earned')}</h2>
                <p className="mt-2 text-3xl font-black text-emerald-300">
                  {Number(referrals?.total_earned || 0).toFixed(2)} <span className="text-base">ETB</span>
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-xl">
                <h2 className="text-sm font-bold uppercase tracking-wide text-gray-300">{t('agent_balance')}</h2>
                <p className="mt-2 text-3xl font-black text-white">
                  {currentReferralBalance.toFixed(2)} <span className="text-base">ETB</span>
                </p>
                <div
                  className="mt-4 h-3 overflow-hidden rounded-full bg-black/40"
                  role="progressbar"
                  aria-label={t('agent_balance')}
                  aria-valuemin={0}
                  aria-valuemax={WITHDRAWAL_THRESHOLD}
                  aria-valuenow={Math.min(currentReferralBalance, WITHDRAWAL_THRESHOLD)}
                >
                  <div className="h-full rounded-full bg-gradient-to-r from-green-400 to-yellow-300 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-2 text-right text-xs text-gray-400">
                  {t('referral_progress', { amount: currentReferralBalance.toFixed(2) })}
                </p>
                {currentReferralBalance < WITHDRAWAL_THRESHOLD && (
                  <p className="mt-2 text-xs text-yellow-300">{t('referral_threshold')}</p>
                )}
              </div>
            </section>

            {currentReferralBalance >= WITHDRAWAL_THRESHOLD && (
              <section className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-xl">
                <label htmlFor="agent-withdraw-phone" className="mb-2 block text-sm font-bold text-gray-200">
                  {t('phoneNumber')}
                </label>
                <input
                  id="agent-withdraw-phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder={t('phoneNumber')}
                  className="mb-3 w-full rounded-xl border border-white/15 bg-black/20 p-3 text-white outline-none focus:border-yellow-400"
                />
                <label htmlFor="agent-withdraw-amount" className="mb-2 block text-sm font-bold text-gray-200">
                  {t('withdrawal_amount')}
                </label>
                <input
                  id="agent-withdraw-amount"
                  type="number"
                  min="100"
                  max={currentReferralBalance}
                  step="0.01"
                  value={withdrawAmount}
                  onChange={(event) => setWithdrawAmount(event.target.value)}
                  placeholder={currentReferralBalance.toFixed(2)}
                  className="w-full rounded-xl border border-white/15 bg-black/20 p-3 text-white outline-none focus:border-yellow-400"
                />
                <button
                  onClick={withdraw}
                  disabled={submitting || currentReferralBalance < WITHDRAWAL_THRESHOLD}
                  className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-3 font-bold text-[#08251b] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? t('loading') : t('withdraw_agent_earnings')}
                </button>
              </section>
            )}

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-xl">
              <h2 className="mb-4 text-lg font-bold">{t('invited_players')}</h2>
              {!referrals?.referred_users?.length ? (
                <p className="text-sm text-gray-400">{t('no_referrals_yet')}</p>
              ) : (
                <ul className="divide-y divide-white/10">
                  {referrals.referred_users.map((player, index) => (
                    <li key={`${player.joined_at}-${index}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="font-medium">{player.name}</span>
                      <time className="shrink-0 text-xs text-gray-400">
                        {new Date(player.joined_at).toLocaleDateString()}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {(error || notice) && (
          <p className={`mt-4 rounded-xl p-3 text-center text-sm ${error ? 'bg-red-500/15 text-red-300' : 'bg-green-500/15 text-green-300'}`}>
            {error || notice}
          </p>
        )}
      </div>
    </main>
  )
}
