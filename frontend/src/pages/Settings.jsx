import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function Settings() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [soundEnabled, setSoundEnabled] = useState(localStorage.getItem('soundEnabled') !== 'false')

  const toggleSound = () => {
    const next = !soundEnabled
    setSoundEnabled(next)
    localStorage.setItem('soundEnabled', String(next))
  }

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'am' : 'en')
  }

  const clearCache = () => {
    localStorage.clear()
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-[#112A46] text-white p-4">
      <button onClick={() => navigate('/')} className="mb-4 text-yellow-400">← {t('back')}</button>
      <h1 className="text-2xl font-bold mb-4">{t('settings')}</h1>

      <div className="bg-white/10 rounded-lg p-4 mb-4 flex items-center justify-between">
        <span>{t('sound')}</span>
        <button onClick={toggleSound} className={`px-3 py-1 rounded ${soundEnabled ? 'bg-green-500' : 'bg-gray-500'}`}>
          {soundEnabled ? t('on') : t('off')}
        </button>
      </div>

      <div className="bg-white/10 rounded-lg p-4 mb-4 flex items-center justify-between">
        <span>{t('language')}</span>
        <button onClick={toggleLanguage} className="bg-white text-[#112A46] text-xs font-bold px-3 py-1.5 rounded-full">
          {i18n.language === 'en' ? 'AM' : 'EN'}
        </button>
      </div>

      <button onClick={clearCache} className="w-full bg-red-500 text-white font-bold py-2 rounded">
        {t('clearCache')}
      </button>
    </div>
  )
}
