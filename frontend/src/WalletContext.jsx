import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchApi } from './services/api'
import SocketService from './services/socket'

const WalletContext = createContext(null)

export function WalletProvider({ children }) {
  const [balance, setBalance] = useState(() => {
    const storedBalance = Number(localStorage.getItem('walletBalance'))
    return Number.isFinite(storedBalance) ? storedBalance : 0
  })
  const [referralBalance, setReferralBalance] = useState(() => {
    const storedBalance = Number(localStorage.getItem('referralBalance'))
    return Number.isFinite(storedBalance) ? storedBalance : 0
  })
  const [loading, setLoading] = useState(true)

  const refreshBalance = useCallback(async () => {
    const userId = localStorage.getItem('dbUserId')
    if (!userId) {
      setLoading(false)
      return
    }

    try {
      const response = await fetchApi(`/wallet/balance?userId=${encodeURIComponent(userId)}&t=${Date.now()}`, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`Wallet balance request failed: ${response.status}`)
      }

      const data = await response.json()
      const nextBalance = Number(data.balance)
      if (!Number.isFinite(nextBalance)) {
        throw new Error('Wallet balance response was invalid.')
      }

      setBalance(nextBalance)
      localStorage.setItem('walletBalance', String(nextBalance))
      const nextReferralBalance = Number(data.referral_balance)
      if (!Number.isFinite(nextReferralBalance)) {
        throw new Error('Referral balance response was invalid.')
      }
      setReferralBalance(nextReferralBalance)
      localStorage.setItem('referralBalance', String(nextReferralBalance))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const socket = SocketService.connect()
    const updateBalance = ({ newBalance, referralBalance: nextReferralBalance } = {}) => {
      if (newBalance !== undefined) {
        const nextBalance = Number(newBalance)
        if (!Number.isFinite(nextBalance)) {
          console.error('Received invalid wallet balance update.')
        } else {
          setBalance(nextBalance)
          localStorage.setItem('walletBalance', String(nextBalance))
        }
      }

      if (nextReferralBalance !== undefined) {
        const nextReferralAmount = Number(nextReferralBalance)
        if (!Number.isFinite(nextReferralAmount)) {
          console.error('Received invalid referral balance update.')
        } else {
          setReferralBalance(nextReferralAmount)
          localStorage.setItem('referralBalance', String(nextReferralAmount))
        }
      }
    }
    const refresh = () => {
      refreshBalance().catch((err) => console.error('Failed to refresh wallet balance:', err))
    }

    socket.on('wallet_updated', updateBalance)
    window.addEventListener('focus', refresh)
    window.addEventListener('wallet-refresh', refresh)
    refresh()

    return () => {
      socket.off('wallet_updated', updateBalance)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('wallet-refresh', refresh)
    }
  }, [refreshBalance])

  return (
    <WalletContext.Provider value={{ balance, referralBalance, loading, refreshBalance }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used within WalletProvider')
  return context
}
