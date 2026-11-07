import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

export default function ReferralPromo() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <section className="mb-6 rounded-2xl border border-purple-700 bg-gradient-to-br from-purple-900 to-indigo-900 p-5 text-white shadow-lg">
      <h2 className="mb-2 text-xl font-bold">{t('promo_title')}</h2>
      <p className="mb-4 text-sm text-purple-200">{t('promo_subtitle')}</p>

      <p className="mb-4 text-center text-xs font-semibold text-yellow-400">
        {t('promo_threshold_note')}
      </p>

      <button
        type="button"
        onClick={() => navigate('/agent')}
        className="w-full rounded-lg bg-green-500 px-4 py-3 font-bold text-white transition-colors hover:bg-green-600"
      >
        {t('promo_cta')}
      </button>
    </section>
  )
}
