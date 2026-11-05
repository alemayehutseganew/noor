import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchApi } from '../services/api';

export default function AdminGames() {
  const { t } = useTranslation();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const res = await fetchApi('/admin/games', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.games) setGames(data.games);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchGames();
  }, []);

  if (loading) return <div className="text-white p-6">{t('gamesLoading')}</div>;

  return (
    <div className="p-4 lg:p-8">
      <h1 className="text-3xl font-bold text-white mb-6">{t('gameHistoryTitle')}</h1>
      
      {/* DESKTOP TABLE VIEW */}
      <div className="hidden md:block bg-slate-800 rounded-2xl shadow-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/50 text-xs uppercase font-bold text-slate-400">
            <tr>
              <th className="px-6 py-4">{t('roomId')}</th>
              <th className="px-6 py-4">{t('stake')}</th>
              <th className="px-6 py-4">{t('players')}</th>
              <th className="px-6 py-4">{t('status')}</th>
              <th className="px-6 py-4">{t('winner')}</th>
              <th className="px-6 py-4">{t('date')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {games.map((game) => (
              <tr key={game.id} className="hover:bg-slate-700/30 transition-colors">
                <td className="px-6 py-4 font-mono text-gray-400">...{game.id.slice(-6)}</td>
                <td className="px-6 py-4 font-bold text-green-400">{game.stake_amount} ETB</td>
                <td className="px-6 py-4">{game.total_players}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${game.status === 'FINISHED' ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'}`}>
                    {t(`gameState_${game.status}`, { defaultValue: game.status })}
                  </span>
                </td>
                <td className="px-6 py-4 font-semibold text-yellow-400">{game.winner_name}</td>
                <td className="px-6 py-4 text-sm">{new Date(game.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MOBILE CARD VIEW */}
      <div className="md:hidden space-y-4">
        {games.map((game) => (
          <div key={game.id} className="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-lg">
            <div className="flex justify-between items-center mb-3">
              <span className="font-mono text-sm text-gray-400">...{game.id.slice(-6)}</span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${game.status === 'FINISHED' ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300'}`}>
                {t(`gameState_${game.status}`, { defaultValue: game.status })}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-slate-500 text-xs uppercase">{t('stake')}</p>
                <p className="font-bold text-green-400">{game.stake_amount} ETB</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs uppercase">{t('players')}</p>
                <p className="text-white">{game.total_players}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs uppercase">{t('winner')}</p>
                <p className="font-semibold text-yellow-400">{game.winner_name}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs uppercase">{t('date')}</p>
                <p className="text-gray-300 text-xs">{new Date(game.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}