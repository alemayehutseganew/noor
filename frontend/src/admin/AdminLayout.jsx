import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function AdminLayout() {
  const { t } = useTranslation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin/login');
  };

  const navItems = [
    { name: t('dashboard'), path: '/admin/dashboard', icon: '📊' },
    { name: t('users'), path: '/admin/users', icon: '👥' },
    { name: t('games'), path: '/admin/games', icon: '🎮' },
    { name: t('payments'), path: '/admin/payments', icon: '💳' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 flex">
      <div className="lg:hidden fixed top-0 w-full bg-slate-800 z-50 p-4 flex justify-between items-center shadow-lg">
        <span className="text-white text-2xl">🎮</span>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-white">
          {isSidebarOpen ? '✕' : '☰'}
        </button>
      </div>

      <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-800 shadow-2xl transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6">
          <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-500 mb-8 hidden lg:block">{t('adminTitle')}</h2>
          <nav className="space-y-2 mt-16 lg:mt-0">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                >
                  <span>{item.icon}</span>
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
            <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-red-400 hover:bg-red-500/10 transition-all mt-8">
              <span>🚪</span>
              <span className="font-medium">{t('logout')}</span>
            </button>
          </nav>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 pt-16 lg:pt-0">
        <main className="flex-1 p-4 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}