import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchApi } from '../services/api';

export default function AdminPayments() {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const fetchPayments = async () => {
      try {
        const token = localStorage.getItem('adminToken');
        const res = await fetchApi('/admin/payments', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || t('failedLoadPayments'));
        }
        if (active) {
          setTransactions(data.transactions || []);
          setError('');
        }
      } catch (err) {
        console.error('Failed to load payments:', err);
        if (active) setError(err.message || t('failedLoadPayments'));
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchPayments();
    return () => {
      active = false;
    };
  }, [t]);

  const handlePaymentAction = async (tx, action) => {
    if (
      action === 'reject' &&
      String(tx.type).toLowerCase() === 'withdrawal' &&
      !window.confirm('Reject this withdrawal? The funds will be refunded to the original balance.')
    ) {
      return
    }

    setProcessingId(tx.id);
    setError('');
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetchApi(`/admin/payments/${tx.id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('failedAction', { action: t(action === 'approve' ? 'approve' : 'reject') }));
      }
      const nextStatus = action === 'approve'
        ? String(tx.type).toLowerCase() === 'withdrawal' ? 'approved' : 'completed'
        : 'rejected'
      setTransactions((current) => current.map((payment) => (
        payment.id === tx.id
          ? { ...payment, status: nextStatus }
          : payment
      )));

      try {
        const refreshRes = await fetchApi('/admin/payments', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const refreshData = await refreshRes.json();
        if (!refreshRes.ok) throw new Error(refreshData.error || t('failedLoadPayments'));
        setTransactions(refreshData.transactions || []);
      } catch (refreshErr) {
        console.error('Failed to refresh payments:', refreshErr);
        setError(refreshErr.message || t('failedLoadPayments'));
      }
    } catch (err) {
      console.error(`Failed to ${action} payment:`, err);
      setError(err.message || t('failedAction', { action: t(action === 'approve' ? 'approve' : 'reject') }));
    } finally {
      setProcessingId(null);
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    const search = searchTerm.trim().toLowerCase();
    const searchableFields = [
      tx.first_name,
      tx.username,
      tx.telegram_id,
      tx.source,
      tx.type,
      tx.status,
      tx.reference_id,

    ];
    return searchableFields.some((value) => String(value || '').toLowerCase().includes(search));
  });

  const getTypeStyles = (type) => {
    switch (String(type).toLowerCase()) {
      case 'deposit':
        return 'bg-green-900/50 text-green-300';
      case 'withdrawal':
        return 'bg-orange-900/50 text-orange-300';
      default:
        return 'bg-slate-700 text-slate-300';
    }
  };

  const getStatusStyles = (status) => {
    switch (String(status).toLowerCase()) {
      case 'pending':
        return 'bg-yellow-900/50 text-yellow-300';
      case 'completed':
      case 'approved':
        return 'bg-green-900/50 text-green-300';
      case 'rejected':
        return 'bg-red-900/50 text-red-300';
      default:
        return 'bg-slate-700 text-slate-300';
    }
  };

  if (loading) {
    return <div className="p-6 text-white">{t('paymentsLoading')}</div>;
  }

  return (
    <div className="w-full min-w-0 p-4 lg:p-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{t('paymentsWithdrawals')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('reviewPayments')}</p>
        </div>
        <input
          type="search"
          aria-label={t('searchPayments')}
          placeholder={t('searchPaymentsPlaceholder')}
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none sm:max-w-sm"
        />
      </header>

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-red-800 bg-red-950/60 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="w-full overflow-x-auto rounded-2xl border border-gray-700 bg-slate-800 shadow-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-900/70 text-xs uppercase text-slate-400">
            <tr>
              <th scope="col" className="px-3 py-4 font-semibold sm:px-5">{t('user')}</th>
              <th scope="col" className="px-3 py-4 font-semibold sm:px-5">{t('type')}</th>
              <th scope="col" className="px-3 py-4 font-semibold sm:px-5">Source</th>
              <th scope="col" className="px-3 py-4 font-semibold sm:px-5">{t('amount')}</th>
              <th scope="col" className="px-3 py-4 font-semibold sm:px-5">{t('reference')}</th>
              <th scope="col" className="px-3 py-4 font-semibold sm:px-5">{t('status')}</th>
              <th scope="col" className="px-3 py-4 font-semibold sm:px-5">{t('date')}</th>
              <th scope="col" className="px-3 py-4 font-semibold sm:px-5">{t('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((tx) => {
              const status = String(tx.status || '').toLowerCase();
              const type = String(tx.type || '').toLowerCase();
              const isProcessing = processingId === tx.id;

              return (
                <tr key={tx.id} className="border-b border-gray-700 hover:bg-gray-800 transition-colors">
                  <td className="max-w-48 break-words px-3 py-4 sm:px-5">
                    <div className="font-semibold text-white">{tx.first_name || t('noName')}</div>
                    <div className="text-xs text-slate-500">
                      {tx.username ? `@${tx.username}` : tx.telegram_id || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-4 sm:px-5">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${getTypeStyles(type)}`}>
                      {t(`type_${type}`, { defaultValue: type || t('unknown') })}
                    </span>
                  </td>
                  <td className="px-3 py-4 sm:px-5">
                    {type === 'withdrawal' ? (['agent', 'referral'].includes(tx.source) ? 'Agent' : 'Playable') : '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 font-mono font-semibold text-white sm:px-5">
                    {Number(tx.amount || 0).toFixed(2)} ETB
                  </td>
                  <td className="max-w-40 break-all px-3 py-4 font-mono text-xs text-slate-400 sm:px-5">
                    {tx.reference_id || '—'}
                  </td>
                  <td className="px-3 py-4 sm:px-5">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold capitalize ${getStatusStyles(status)}`}>
                      {t(`status_${status}`, { defaultValue: status || t('unknown') })}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-slate-400 sm:px-5">
                    {new Date(tx.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-4 sm:px-5">
                    {status === 'pending' ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handlePaymentAction(tx, 'approve')}
                          className="rounded bg-green-600 px-3 py-1 text-sm text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t('approve')}
                        </button>
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => handlePaymentAction(tx, 'reject')}
                          className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t('reject')}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-semibold uppercase text-slate-400">
                        {t(`status_${status}`, { defaultValue: status || t('unknownStatus') })}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredTransactions.length === 0 && (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-slate-400">
                  {transactions.length === 0 ? t('noPayments') : t('noPaymentsMatch')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
