import { useTranslation } from 'react-i18next'

export default function SelectCards() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-[#112A46] text-white flex items-center justify-center">
      <p>{t('selectCardsComingSoon')}</p>
    </div>
  )
}
