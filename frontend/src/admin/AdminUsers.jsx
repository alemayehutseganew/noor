import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchApi } from '../services/api'

export default function AdminUsers() {
  const { t } = useTranslation()
  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(null)
  const [amount, setAmount] = useState(0)
  const [type, setType] = useState('add')
  const token = localStorage.getItem('adminToken')

  const load = () => {
    fetchApi('/admin/users', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => {})
  }

  useEffect(load, [token])

  const adjust = async () => {
    await fetchApi(`/admin/users/${modal.id}/adjust-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount: Number(amount), type }),
    })
    setModal(null)
    load()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">{t('users')}</h1>
      <table className="w-full text-sm">
        <thead className="bg-gray-800">
          <tr>
            <th className="p-2 text-left">{t('id')}</th>
            <th className="p-2 text-left">{t('telegramId')}</th>
            <th className="p-2 text-left">{t('name')}</th>
            <th className="p-2 text-left">{t('phoneNumberLabel')}</th>
            <th className="p-2 text-left">{t('balance')}</th>
            <th className="p-2 text-left">{t('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-gray-700 hover:bg-gray-800">
              <td className="p-2">{u.id}</td>
              <td className="p-2">{u.telegram_id}</td>
              <td className="p-2">{u.first_name || t('unknown')}</td>
              <td className="p-2">
                {u.phone_number ? (
                  <span className="font-mono text-green-400">{u.phone_number}</span>
                ) : (
                  <span className="text-xs italic text-gray-500">{t('notRegistered')}</span>
                )}
              </td>
              <td className="p-2">{u.wallet_balance}</td>
              <td className="p-2">
                <button
                  onClick={() => setModal(u)}
                  className="bg-blue-600 px-2 py-1 rounded text-xs"
                >
                  {t('adjust')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
          <div className="bg-gray-800 p-4 rounded w-80 space-y-2">
            <h3 className="font-bold">{t('adjustBalance', { name: modal.first_name })}</h3>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full bg-gray-700 p-2 rounded"
            >
              <option value="add">{t('add')}</option>
              <option value="subtract">{t('subtract')}</option>
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-gray-700 p-2 rounded"
            />
            <div className="flex gap-2">
              <button onClick={adjust} className="flex-1 bg-green-600 py-1 rounded">{t('save')}</button>
              <button onClick={() => setModal(null)} className="flex-1 bg-gray-600 py-1 rounded">{t('cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
