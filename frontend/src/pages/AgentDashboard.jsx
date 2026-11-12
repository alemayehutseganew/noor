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
    <main className="min-h-screen bg-gradient-to-b from-[#0f172a] via-[#1e293b] to-[#020617] px-4 py-6 text-white">
      <div className="mx-auto max-w-xl">
        <header className="mb-6 flex items-center gap-3 rounded-2xl border border-slate-600/50 bg-slate-800/50 p-3 shadow-2xl backdrop-blur-lg">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex min-h-11 items-center rounded-xl border border-slate-600/50 bg-slate-700/80 px-4 font-bold text-yellow-300 shadow-[0_4px_0_rgb(30,41,59)] transition-all hover:bg-slate-600 active:translate-y-1 active:shadow-none"
          >
            ← {t('back')}
          </button>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-yellow-400">GOBINGO</p>
            <h1 className="mt-0.5 text-xl font-black sm:text-2xl">{t('agent_dashboard')}</h1>
          </div>
        </header>

        {loading ? (
          <p className="rounded-2xl border border-slate-700 bg-slate-800/60 p-6 text-center text-slate-300 shadow-lg backdrop-blur-md">
            {t('loading')}
          </p>
        ) : (
          <>
            <section className="mb-6 grid grid-cols-2 gap-3">
              <div className="flex flex-col justify-between rounded-2xl border border-slate-700 bg-slate-800/60 p-4 shadow-lg backdrop-blur-md">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('total_earned')}</h2>
                <p className="mt-2 text-xl font-black text-emerald-400 sm:text-2xl">
                  {Number(referrals?.total_earned || 0).toFixed(2)} <span className="text-sm">ETB</span>
                </p>
              </div>
              <div className="flex flex-col justify-between rounded-2xl border border-slate-700 bg-slate-800/60 p-4 shadow-lg backdrop-blur-md">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('agent_balance')}</h2>
                <p className="mt-2 text-xl font-black text-white sm:text-2xl">
                  {currentReferralBalance.toFixed(2)} <span className="text-sm">ETB</span>
                </p>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950/80 shadow-inner"
                  role="progressbar"
                  aria-label={t('agent_balance')}
                  aria-valuemin={0}
                  aria-valuemax={WITHDRAWAL_THRESHOLD}
                  aria-valuenow={Math.min(currentReferralBalance, WITHDRAWAL_THRESHOLD)}
                >
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-yellow-300 transition-all" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-2 text-right text-[10px] text-slate-400 sm:text-xs">
                  {t('referral_progress', { amount: currentReferralBalance.toFixed(2) })}
                </p>
                {currentReferralBalance < WITHDRAWAL_THRESHOLD && (
                  <p className="mt-1 text-[10px] text-yellow-300 sm:text-xs">{t('referral_threshold')}</p>
                )}
              </div>
            </section>

            <section className="mb-4 rounded-2xl border border-indigo-500/30 bg-indigo-900/40 p-5 shadow-[0_0_20px_rgba(99,102,241,0.2)] backdrop-blur-lg">
              <h2 className="mb-2 text-sm font-bold text-indigo-200">{t('referral_link')}</h2>
              <p className="break-all rounded-lg border border-slate-700 bg-slate-900/80 p-3 font-mono text-xs text-slate-300">{referralLink}</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="min-h-11 rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-[0_4px_0_#312e81] transition-all active:translate-y-1 active:shadow-none"
                >
                  {t('copy_link')}
                </button>
                <button
                  type="button"
                  onClick={shareLink}
                  className="min-h-11 rounded-lg bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-[0_4px_0_#0c4a6e] transition-all active:translate-y-1 active:shadow-none"
                >
                  {t('share_to_telegram')}
                </button>
              </div>
            </section>

            {currentReferralBalance >= WITHDRAWAL_THRESHOLD && (
              <section className="mb-4 rounded-2xl border border-slate-600/50 bg-slate-800/60 p-5 shadow-xl backdrop-blur-lg">
                <label htmlFor="agent-withdraw-phone" className="mb-2 block text-sm font-bold text-slate-200">
                  {t('phoneNumber')}
                </label>
                <input
                  id="agent-withdraw-phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder={t('phoneNumber')}
                  className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white shadow-inner outline-none focus:border-blue-500"
                />
                <label htmlFor="agent-withdraw-amount" className="mb-2 block text-sm font-bold text-slate-200">
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
                  className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white shadow-inner outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={withdraw}
                  disabled={submitting || currentReferralBalance < WITHDRAWAL_THRESHOLD}
                  className="mt-3 min-h-12 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 px-4 py-3 font-bold text-slate-950 shadow-[0_5px_0_#065f46] transition-all active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? t('loading') : t('withdraw_agent_earnings')}
                </button>
              </section>
            )}

            <section className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-800/60 shadow-lg backdrop-blur-md">
              <div className="border-b border-slate-700/50 p-4">
                <h2 className="font-bold text-white">{t('invited_players')}</h2>
              </div>
              {!referrals?.referred_users?.length ? (
                <p className="p-4 text-sm text-slate-400">{t('no_referrals_yet')}</p>
              ) : (
                <ul className="max-h-60 divide-y divide-slate-700/50 overflow-y-auto">
                  {referrals.referred_users.map((player, index) => (
                    <li key={`${player.joined_at}-${index}`} className="flex items-center justify-between gap-3 p-4">
                      <span className="text-sm font-medium text-slate-300">{player.name}</span>
                      <time className="shrink-0 text-xs text-slate-500">
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
          <p className={`mt-4 rounded-xl border p-3 text-center text-sm ${error ? 'border-red-400/20 bg-red-500/10 text-red-300' : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'}`}>
            {error || notice}
          </p>
        )}
      </div>
    </main>
  )
}
