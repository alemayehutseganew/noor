import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../services/api'

export default function AdminLogin() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const login = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const res = await fetchApi('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (data.token) {
        localStorage.setItem('adminToken', data.token)
        navigate('/admin/dashboard')
      } else {
        setError(data.error || t('loginFailed'))
      }
    } catch (e) {
      setError(t('networkError'))
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <form onSubmit={login} className="bg-gray-800 p-6 rounded-lg w-80 space-y-4">
        <h1 className="text-2xl font-bold text-center">{t('adminLogin')}</h1>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <input
          className="w-full bg-gray-700 p-2 rounded"
          placeholder={t('username')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="password"
          className="w-full bg-gray-700 p-2 rounded"
          placeholder={t('password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="w-full bg-blue-600 py-2 rounded font-bold">{t('login')}</button>
      </form>
    </div>
  )
}
