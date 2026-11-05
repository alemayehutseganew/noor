import { useTranslation } from 'react-i18next'

export default function Game() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-[#112A46] text-white flex items-center justify-center">
      <p>{t('gameComingSoon')}</p>
    </div>
  )
}
