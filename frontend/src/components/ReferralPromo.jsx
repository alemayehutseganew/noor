import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

export default function ReferralPromo() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="max-w-md mx-auto mb-4 flex items-center justify-between gap-3 rounded-xl border border-purple-300/30 bg-gradient-to-r from-purple-700 to-indigo-600 p-3 shadow-lg sm:p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="shrink-0 rounded-full bg-white/20 p-2 text-xl" aria-hidden="true">
          🚀
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold leading-tight text-white">
            {t('referral_banner_title')}
          </h3>
          <p className="mt-0.5 text-xs leading-tight text-purple-100">
            {t('referral_banner_subtitle')}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate('/agent')}
        className="shrink-0 whitespace-nowrap rounded-lg bg-green-500 px-3 py-2 text-xs font-bold text-white shadow-md transition-transform hover:bg-green-400 active:scale-95 sm:px-4"
      >
        {t('referral_banner_btn')}
      </button>
    </div>
  )
}
