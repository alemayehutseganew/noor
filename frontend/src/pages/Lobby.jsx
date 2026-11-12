import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../LanguageContext'
import { fetchApi } from '../services/api'
import { useWallet } from '../WalletContext'
import SocketService from '../services/socket'
import ReferralPromo from '../components/ReferralPromo'

const stakes = [10, 50, 100]

const AMHARIC_INSTRUCTIONS = `እንኳን ወደ ጎቢንጎ በደህና መጡ!

የጨዋታ መመሪያ፦

ከላይ ካለው ዝርዝር ውስጥ የሚፈልጉትን ውለታ (Stake) ይምረጡ።

ከ1-400 የካርድ መምረጫ ቦርድ ውስጥ እስከ 2 የመጫወቻ ካርድ ይምረጡ።

ጨዋታው ሲጀመር ሲስተሙ ከ1 እስከ 75 ያሉ ቁጥሮችን ያስነብባል።

በካርድዎ ላይ ያሉትን ቁጥሮች በመንካት ያጥቁሩ (Shade)።

ወደጎን፣ ወደታች፣ ወይም ወደ ሁለቱም አግዳሚ መስመር ካሳዩ ወይም 4 ማእዘናትን ካሟሉ አሸናፊ ይሆናሉ።

አሸንፈዋል ብለው ሲያምኑ "BINGO" የሚለውን ቁልፍ ይጫኑ።

መልካም ጨዋታ!`

export default function Lobby() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { changeLanguage } = useLanguage()
  const { balance: walletBalance, refreshBalance } = useWallet()

  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [connectionError, setConnectionError] = useState('')

  const toggleLanguage = () => {
    changeLanguage(i18n.language === 'en' ? 'am' : 'en')
  }

  useEffect(() => {
    let isActive = true
    const savedRoom = localStorage.getItem('activeGameRoom')
    if (!savedRoom) return () => { isActive = false }

    const restoreActiveRoom = async () => {
      let activeRoom
      try {
        activeRoom = JSON.parse(savedRoom)
      } catch (err) {
        console.error('Saved active room data is invalid:', err)
        localStorage.removeItem('activeGameRoom')
        return
      }

      if (!activeRoom?.roomId) {
        localStorage.removeItem('activeGameRoom')
        return
      }

      try {
        const response = await fetchApi(
          `/rooms/${encodeURIComponent(activeRoom.roomId)}/my-cards`,
          { cache: 'no-store' },
        )
        if (!isActive) return

        if (response.status === 403 || response.status === 404) {
          localStorage.removeItem('activeGameRoom')
          return
        }
        if (!response.ok) {
          throw new Error(`Active room check failed: ${response.status}`)
        }

        const data = await response.json()
        if (!isActive) return
        setConnectionError('')
        if (!Array.isArray(data.cards) || data.cards.length === 0) {
          localStorage.removeItem('activeGameRoom')
          return
        }

        const stake = Number(activeRoom.stake) || 10
        navigate(`/game?roomId=${encodeURIComponent(activeRoom.roomId)}&stake=${stake}`)
      } catch (err) {
        if (isActive) {
          console.error('Failed to restore active game room:', err)
          setConnectionError('Connection slow. Please refresh.')
        }
      }
    }

    restoreActiveRoom()
    return () => { isActive = false }
  }, [navigate])

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

  const handleJoin = async (stake) => {
    // Navigate to card selection instead of calling join directly
    const sanitizedStake = stake && stake > 0 ? stake : 10
    navigate(`/select-card?stake=${sanitizedStake}`)
  }

  const handleLogout = () => {
    localStorage.clear()
    SocketService.connect(null)
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.close()
    } else {
      window.location.reload()
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-b from-[#0f172a] via-[#1e293b] to-[#020617] font-sans text-white">
      
      {/* Decorative background glow */}
      <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-yellow-500/15 blur-[120px]" />

      {/* Top Navigation Bar */}
      <div className="relative z-10 mx-3 mt-3 flex items-center justify-between rounded-2xl border border-slate-600/50 bg-slate-800/50 p-3 shadow-2xl backdrop-blur-lg sm:mx-4">
        <button 
          type="button"
          aria-label={t('playerMenu')}
          onClick={() => setIsMenuOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-600/50 bg-slate-700/80 text-slate-100 shadow-[0_4px_0_rgb(30,41,59)] transition-all hover:bg-slate-600 active:translate-y-1 active:shadow-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        
        <div className="flex items-center gap-2 sm:gap-3">
          <button 
            type="button"
            onClick={toggleLanguage}
            className="min-h-11 min-w-11 rounded-full border border-slate-600/50 bg-slate-700/80 px-3 text-xs font-bold text-white shadow-[0_4px_0_rgb(30,41,59)] transition-all hover:bg-slate-600 active:translate-y-1 active:shadow-none"
          >
            {i18n.language === 'en' ? 'AM' : 'EN'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/wallet')}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-600 bg-gradient-to-r from-slate-900 to-slate-800 px-3 font-extrabold text-white shadow-inner transition-transform hover:scale-[1.02] sm:px-4"
          >
            <span className="text-lg text-yellow-400" aria-hidden="true">💰</span>
            <span>ETB {walletBalance.toFixed(2)}</span>
          </button>
        </div>
      </div>

      {/* Header */}
      <div className="relative z-10 mb-8 mt-6 px-4 text-center">
        <h1 className="mb-2 bg-gradient-to-r from-yellow-300 via-orange-400 to-yellow-300 bg-clip-text text-4xl font-black tracking-widest text-transparent drop-shadow-[0_0_20px_rgba(250,204,21,0.3)] sm:text-5xl">
          GOBINGO
        </h1>
        <p className="mt-2 text-xs font-medium uppercase tracking-widest text-slate-400">
          {t('playTagline')}
        </p>
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex-1 px-4 pb-10">
        <div className="relative mx-auto mb-6 max-w-md">
          <div aria-hidden="true" className="absolute inset-2 rounded-2xl bg-purple-500/40 blur-xl" />
          <div className="relative [&>div]:mb-0 [&>div]:rounded-2xl [&>div]:border-purple-400/30 [&>div]:backdrop-blur-md [&>div]:shadow-[0_0_25px_rgba(168,85,247,0.4)]">
            <ReferralPromo />
          </div>
        </div>
        {connectionError && (
          <p role="alert" className="mb-4 text-center text-red-400">{connectionError}</p>
        )}
        <h2 className="mb-6 text-center text-xl font-bold text-white">
          {t('chooseStake')}
        </h2>

        <div className="mx-auto flex max-w-md flex-col gap-4">
          {stakes.map((stake) => (
            <div 
              key={stake} 
              className="group relative mb-1 flex items-center justify-between overflow-hidden rounded-2xl border border-slate-600/50 bg-gradient-to-b from-slate-700 to-slate-800 p-4 shadow-[0_8px_0_#0f172a] backdrop-blur-xl transition-all duration-100 hover:from-slate-600 hover:to-slate-700 active:translate-y-2 active:shadow-none"
            >
              {/* Left side: Stake Value */}
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('stake')}</span>
                <span className="bg-gradient-to-b from-yellow-300 to-yellow-500 bg-clip-text text-3xl font-black text-transparent">
                  {stake} <span className="text-lg">ETB</span>
                </span>
              </div>

              {/* Right side: Join Button */}
              <button
                type="button"
                onClick={() => handleJoin(stake)}
                className="min-h-11 rounded-xl bg-gradient-to-r from-orange-500 to-yellow-500 px-6 py-2 text-base font-black text-white shadow-[0_4px_0_#9a3412] transition-all group-active:translate-y-1 group-active:shadow-none"
              >
                {t('joinGame')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Decorative Element */}
      <div className="relative z-10 pb-6 text-center">
        <p className="text-xs text-slate-500">{t('securePayments')}</p>
      </div>

      {/* Slide-out Menu Drawer */}
      {isMenuOpen && (
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex" onClick={() => setIsMenuOpen(false)}>
    <div 
      className="w-72 bg-gradient-to-b from-[#0f2027] to-[#203a43] h-full p-6 flex flex-col shadow-2xl border-r border-white/10"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/10">
        <div>
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">GOBINGO</h2>
          <p className="text-xs text-gray-400 mt-1">{t('playerMenu')}</p>
        </div>
        <button onClick={() => setIsMenuOpen(false)} className="text-white text-3xl hover:text-yellow-400 transition-colors">&times;</button>
      </div>

      {/* Profile Snapshot */}
      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 mb-6 border border-white/10">
        <p className="text-xs text-gray-400 uppercase font-bold">{t('walletBalance')}</p>
        <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-500">
          ETB {walletBalance.toFixed(2)}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-2">
        <button onClick={() => { setIsMenuOpen(false); navigate('/wallet'); }} className="flex items-center gap-3 w-full text-left text-white font-bold text-base p-3 rounded-xl hover:bg-white/10 transition-all group">
          <span className="text-2xl group-hover:scale-110 transition-transform">💰</span> 
          <span>{t('myWallet')}</span>
        </button>
        <button onClick={() => { setIsMenuOpen(false); navigate('/agent'); }} className="flex items-center gap-3 w-full text-left text-white font-bold text-base p-3 rounded-xl hover:bg-white/10 transition-all group">
          <span className="text-2xl group-hover:scale-110 transition-transform">👥</span>
          <span>{t('agent_dashboard')}</span>
        </button>
        <button onClick={() => { setIsMenuOpen(false); setHelpOpen(true); }} className="flex items-center gap-3 w-full text-left text-white font-bold text-base p-3 rounded-xl hover:bg-white/10 transition-all group">
          <span className="text-2xl group-hover:scale-110 transition-transform">❓</span> 
          <span>{t('helpRules')}</span>
        </button>
      </nav>

      {/* Logout at bottom */}
      <div className="mt-auto pt-6 border-t border-white/10">
        <button onClick={handleLogout} className="w-full bg-red-600/20 text-red-400 border border-red-600/30 font-bold py-3 rounded-xl hover:bg-red-600 hover:text-white transition-all">
          {t('logout')}
        </button>
      </div>
    </div>
  </div>
)}

      {/* Help Modal */}
      {helpOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setHelpOpen(false)}>
          <div 
            className="bg-[#0f2027] p-6 rounded-2xl max-w-sm w-full border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-yellow-400 mb-4">{t('help')}</h2>
            <p className="text-white text-sm whitespace-pre-wrap">{i18n.language === 'am' ? AMHARIC_INSTRUCTIONS : t('helpInstructions')}</p>
            <button onClick={() => setHelpOpen(false)} className="mt-6 w-full bg-yellow-500 text-[#0f2027] font-bold py-3 rounded-xl">{t('close')}</button>
          </div>
        </div>
      )}
    </div>
  )
}