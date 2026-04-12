import { useState, useEffect, useCallback } from 'react';
import { Banknote, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { clientDisplayName } from '../lib/clientHelpers';
import { formatCurrency } from '../lib/invoiceCalculations';
import type { Language, Payment } from '../types';

interface PaymentsProps {
  t: (key: string) => string;
  language: Language;
}

type PaymentFilter = 'all' | 'partial' | 'full';

const PAGE_SIZE = 50;

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export default function Payments({ t }: PaymentsProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<PaymentFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          invoice:invoices(id, invoice_number, total, status, invoice_date),
          client:clients(id, company_name, company_name_additional, email)
        `)
        .order('payment_date', { ascending: false });
      if (error) throw error;
      setPayments((data as Payment[]) || []);
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  // Filtering
  const filtered = payments.filter((p) => {
    const q = search.toLowerCase();
    const clientName = p.client ? clientDisplayName(p.client).toLowerCase() : '';
    const invoiceNum = p.invoice?.invoice_number?.toLowerCase() ?? '';
    const matchesSearch = !search || clientName.includes(q) || invoiceNum.includes(q);

    const matchesType =
      filterType === 'all' ||
      (filterType === 'partial' && p.is_partial) ||
      (filterType === 'full' && !p.is_partial);

    const matchesFrom = !dateFrom || p.payment_date >= dateFrom;
    const matchesTo = !dateTo || p.payment_date <= dateTo;

    return matchesSearch && matchesType && matchesFrom && matchesTo;
  });

  // KPIs
  const totalReceived = filtered.reduce((sum, p) => sum + p.amount, 0);
  const partialCount = filtered.filter((p) => p.is_partial).length;
  const totalOutstanding = filtered
    .filter((p) => p.is_partial)
    .reduce((sum, p) => sum + ((p.invoice_amount ?? 0) - p.amount), 0);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const goToPage = (p: number) => setCurrentPage(Math.min(Math.max(1, p), totalPages));

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [search, filterType, dateFrom, dateTo]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="page-title">{t('pay.title')}</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">{t('pay.total_received')}</p>
          <p className="text-2xl font-bold text-primary">€ {formatCurrency(totalReceived)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">{t('pay.partial_payments_count')}</p>
          <p className="text-2xl font-bold text-amber-600">{partialCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">{t('pay.total_outstanding')}</p>
          <p className="text-2xl font-bold text-danger">€ {formatCurrency(totalOutstanding)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} strokeWidth={1.8} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="input-field pl-8 text-sm w-full"
            placeholder={t('pay.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <input
          type="date"
          className="input-field text-sm"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <input
          type="date"
          className="input-field text-sm"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
        <div className="flex gap-1">
          {(['all', 'partial', 'full'] as PaymentFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilterType(f)}
              className={`px-3 py-1.5 rounded-10 text-xs font-medium transition-colors ${
                filterType === f
                  ? 'bg-primary text-white'
                  : 'bg-bg text-text-muted hover:bg-accent-soft border border-accent-muted'
              }`}
            >
              {f === 'all' ? t('pay.filter_all') : f === 'partial' ? t('pay.filter_partial') : t('pay.filter_full')}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 rounded bg-accent-soft animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3 text-text-muted">
            <Banknote size={36} strokeWidth={1.5} />
            <p className="text-sm">{t('pay.no_payments')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-accent-soft bg-bg">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">{t('pay.date')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">{t('pay.client')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">{t('pay.invoice')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">{t('pay.invoice_amount')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">{t('pay.amount')}</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">{t('pay.difference')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">{t('pay.method')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-accent-soft">
                {paginated.map((p) => {
                  const diff = (p.invoice_amount ?? 0) - p.amount;
                  return (
                    <tr key={p.id} className="hover:bg-accent-soft/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-text-muted whitespace-nowrap">
                        {formatDate(p.payment_date)}
                      </td>
                      <td className="px-4 py-3 text-text-dark font-medium max-w-[160px] truncate">
                        {p.client ? clientDisplayName(p.client) : '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-primary">
                        {p.invoice?.invoice_number ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-text-muted tabular-nums">
                        {p.invoice_amount != null ? `€ ${formatCurrency(p.invoice_amount)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-primary tabular-nums">
                        € {formatCurrency(p.amount)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {diff === 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent-soft text-primary">
                            {t('pay.full')}
                          </span>
                        ) : diff > 0 ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                              {t('pay.partial')}
                            </span>
                            <span className="text-xs text-danger font-medium">-€ {formatCurrency(diff)}</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted">
                        {p.method ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {p.confirmed && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent-soft text-primary">✓</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted max-w-[120px] truncate">
                        {p.notes ?? ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted text-xs">
            {t('pagination.showing')
              .replace('{from}', String((currentPage - 1) * PAGE_SIZE + 1))
              .replace('{to}', String(Math.min(currentPage * PAGE_SIZE, filtered.length)))
              .replace('{total}', String(filtered.length))}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded-10 text-text-muted hover:bg-accent-soft disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 py-1 text-xs font-medium text-text-dark">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-10 text-text-muted hover:bg-accent-soft disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
