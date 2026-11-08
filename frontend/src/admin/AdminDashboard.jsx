import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchApi } from '../services/api';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeGames: 0,
    totalWagered: '0.00',
    totalPayouts: '0.00',
    totalReferralCommissions: '0.00',
    platformProfit: '0.00'
  });
  const [loading, setLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const res = await fetchApi('/admin/stats', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        setStats({
          totalUsers: data.totalUsers || 0,
          activeGames: data.activeGames || 0,
          totalWagered: parseFloat(data.totalWagered || 0).toFixed(2),
          totalPayouts: parseFloat(data.totalPayouts || 0).toFixed(2),
          totalReferralCommissions: parseFloat(data.totalReferralCommissions || 0).toFixed(2),
          platformProfit: parseFloat(data.platformProfit || 0).toFixed(2)
        });
      } catch (err) {
        console.error('Failed to load stats', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <div className="text-white p-6">{t('dashboardLoading')}</div>;

  const metrics = [
    { id: 'users', title: t('totalUsers'), value: stats.totalUsers, color: 'text-blue-400', bg: 'bg-blue-500/10', icon: '👥', route: '/admin/users' },
    { id: 'games', title: t('activeGames'), value: stats.activeGames, color: 'text-green-400', bg: 'bg-green-500/10', icon: '🎮', route: '/admin/games' },
    { id: 'wagered', title: t('totalWagered'), value: `ETB ${stats.totalWagered}`, color: 'text-yellow-400', bg: 'bg-yellow-500/10', icon: '💰', route: '/admin/payments' },
    { id: 'profit', title: t('platformProfit'), value: `ETB ${stats.platformProfit}`, color: 'text-purple-400', bg: 'bg-purple-500/10', icon: '📈', route: '/admin/payments' },
  ];

  return (
    <div className="p-4 lg:p-8">
      <h1 className="text-3xl font-bold text-white mb-8">{t('dashboardOverview')}</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((m) => (
          <button
            key={m.id}
            onClick={() => navigate(m.route)}
            className="bg-slate-800 hover:bg-slate-700 transition-all rounded-2xl p-6 border border-slate-700 shadow-lg text-left group flex flex-col justify-between h-32"
          >
            <div className="flex justify-between items-start w-full">
              <span className="text-slate-400 font-semibold">{m.title}</span>
              <div className={`p-2 rounded-lg ${m.bg}`}>
                <span className={m.color}>{m.icon}</span>
              </div>
            </div>
            <div className="flex justify-between items-end w-full">
              <span className="text-2xl font-black text-white">{m.value}</span>
              <span className="text-slate-500 group-hover:text-white transition-colors">→</span>
            </div>
          </button>
        ))}
      </div>

      {selectedMetric && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-md border border-slate-700 shadow-2xl relative">
            <button 
              onClick={() => setSelectedMetric(null)} 
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              ✕
            </button>
            
            <h2 className="text-2xl font-bold text-white mb-4">{t('metricDetails')}</h2>
            
            <div className="space-y-4 text-slate-300">
              {selectedMetric === 'users' && (
                <>
                  <p><strong>{t('totalUsers')}:</strong> {stats.totalUsers}</p>
                  <p className="text-sm text-slate-400">{t('usersDescription')}</p>
                </>
              )}
              {selectedMetric === 'games' && (
                <>
                  <p><strong>{t('activeGames')}:</strong> {stats.activeGames}</p>
                  <p className="text-sm text-slate-400">{t('gamesDescription')}</p>
                </>
              )}
              {selectedMetric === 'wagered' && (
                <>
                  <p><strong>{t('totalWagered')}:</strong> ETB {stats.totalWagered}</p>
                  <div className="bg-slate-900 p-3 rounded-lg text-sm font-mono mt-2">
                    {t('wageredMath')}
                  </div>
                </>
              )}
              {selectedMetric === 'profit' && (
                <>
                  <p><strong>{t('platformProfit')}:</strong> ETB {stats.platformProfit}</p>
                  <div className="bg-slate-900 p-3 rounded-lg text-sm font-mono mt-2">
                    {t('profitMath', {
                      wagered: stats.totalWagered,
                      payouts: stats.totalPayouts,
                      commissions: stats.totalReferralCommissions,
                    })}<br/>
                    {t('profitMathResult', { profit: stats.platformProfit })}
                  </div>
                  <p className="text-sm text-slate-400 mt-2">{t('profitDescription')}</p>
                </>
              )}
            </div>
            
            <button 
              onClick={() => setSelectedMetric(null)}
              className="mt-6 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl transition-colors"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}