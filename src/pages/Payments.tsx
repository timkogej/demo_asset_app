import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Download, CheckCircle, Send } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { generateInvoicePDF } from '../lib/pdf';
import Badge from '../components/ui/Badge';
import type { Invoice, Language } from '../types';

interface PaymentsProps {
  t: (key: string) => string;
  language: Language;
}

function formatCurrency(amount: number): string {
  return `€${amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'dd/MM/yyyy');
  } catch {
    return '—';
  }
}

const MONTHS_IT = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
];

export default function Payments({ t }: PaymentsProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState<number>(0); // 0 = all
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, client:clients(*), vehicle:vehicles(*)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setInvoices((data as Invoice[]) || []);
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = invoices.filter((inv) => {
    const matchesMonth = filterMonth === 0 || inv.billing_month === filterMonth;
    const matchesYear = inv.billing_year === filterYear;
    const matchesStatus = filterStatus === 'all' || inv.status === filterStatus;
    return matchesMonth && matchesYear && matchesStatus;
  });

  const handleDownloadPDF = (invoice: Invoice) => {
    try {
      generateInvoicePDF(invoice);
    } catch (err) {
      console.error(err);
      toast.error(t('error.pdf_failed'));
    }
  };

  const handleMarkPaid = async (invoice: Invoice) => {
    setActionLoading(invoice.id);
    try {
      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from('invoices')
        .update({ status: 'paid', paid_at: now })
        .eq('id', invoice.id);

      if (updateError) throw updateError;

      // Create payment record
      const { error: paymentError } = await supabase.from('payments').insert({
        invoice_id: invoice.id,
        client_id: invoice.client_id,
        amount: invoice.total_amount,
        payment_date: now.split('T')[0],
        confirmed: true,
      });

      if (paymentError) throw paymentError;

      toast.success(t('payments.marked_paid'));
      fetchData();
    } catch {
      toast.error(t('error.save_failed'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendEmail = async (invoice: Invoice) => {
    setActionLoading(invoice.id + '_send');
    try {
      const now = new Date().toISOString();

      const { error } = await supabase
        .from('invoices')
        .update({ status: 'sent', sent_at: now })
        .eq('id', invoice.id);

      if (error) throw error;

      toast.success(t('payments.email_sent'));
      fetchData();
    } catch {
      toast.error(t('error.save_failed'));
    } finally {
      setActionLoading(null);
    }
  };

  const years = Array.from(
    new Set(invoices.map((inv) => inv.billing_year))
  ).sort((a, b) => b - a);

  if (!years.includes(new Date().getFullYear())) {
    years.unshift(new Date().getFullYear());
  }

  const statusOptions = [
    { value: 'all', label: t('payments.filter_all') },
    { value: 'draft', label: t('status.draft') },
    { value: 'sent', label: t('status.sent') },
    { value: 'paid', label: t('status.paid') },
    { value: 'overdue', label: t('status.overdue') },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="page-title">{t('payments.title')}</h2>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Year selector */}
        <select
          className="input-field w-auto"
          value={filterYear}
          onChange={(e) => setFilterYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {/* Month selector */}
        <select
          className="input-field w-auto"
          value={filterMonth}
          onChange={(e) => setFilterMonth(Number(e.target.value))}
        >
          <option value={0}>{t('payments.filter_all')}</option>
          {MONTHS_IT.map((m, idx) => (
            <option key={idx + 1} value={idx + 1}>
              {m}
            </option>
          ))}
        </select>

        {/* Status filter */}
        <div className="flex gap-1 bg-bg border border-accent-muted rounded-10 p-1">
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={`px-3 py-1 rounded-10 text-xs font-medium transition-colors duration-150 ${
                filterStatus === opt.value
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:text-text-dark hover:bg-accent-soft'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <CreditCard size={40} strokeWidth={1} className="text-accent-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">{t('payments.no_payments')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">{t('payments.invoice_number')}</th>
                  <th className="table-header">{t('payments.client')}</th>
                  <th className="table-header">{t('payments.vehicle')}</th>
                  <th className="table-header">{t('payments.billing_month')}</th>
                  <th className="table-header">{t('payments.base_amount')}</th>
                  <th className="table-header">{t('payments.penalties')}</th>
                  <th className="table-header">{t('payments.total')}</th>
                  <th className="table-header">{t('payments.status')}</th>
                  <th className="table-header">{t('payments.sent_date')}</th>
                  <th className="table-header">{t('payments.paid_date')}</th>
                  <th className="table-header">{t('payments.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((invoice) => (
                  <tr key={invoice.id} className="table-row">
                    <td className="table-cell font-mono text-xs font-semibold text-primary">
                      {invoice.invoice_number}
                    </td>
                    <td className="table-cell">{invoice.client?.company_name || '—'}</td>
                    <td className="table-cell font-mono text-xs">
                      {invoice.vehicle?.plate || '—'}
                    </td>
                    <td className="table-cell text-text-muted">
                      {MONTHS_IT[(invoice.billing_month - 1) % 12]} {invoice.billing_year}
                    </td>
                    <td className="table-cell">{formatCurrency(invoice.base_amount)}</td>
                    <td className="table-cell">
                      {invoice.penalties_total > 0 ? (
                        <span className="text-danger font-medium">
                          {formatCurrency(invoice.penalties_total)}
                        </span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="table-cell font-semibold">
                      {formatCurrency(invoice.total_amount)}
                    </td>
                    <td className="table-cell">
                      <Badge status={invoice.status} t={(k) => {
                        const key = k.replace('status.', '');
                        return t(`status.${key}`);
                      }} />
                    </td>
                    <td className="table-cell text-text-muted text-xs">
                      {formatDate(invoice.sent_at)}
                    </td>
                    <td className="table-cell text-text-muted text-xs">
                      {formatDate(invoice.paid_at)}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        {/* Download PDF */}
                        <button
                          onClick={() => handleDownloadPDF(invoice)}
                          className="text-text-muted hover:text-primary transition-colors"
                          title={t('btn.download_pdf')}
                        >
                          <Download size={15} strokeWidth={1.8} />
                        </button>

                        {/* Send Email - only for draft */}
                        {(invoice.status === 'draft' || invoice.status === 'overdue') && (
                          <button
                            onClick={() => handleSendEmail(invoice)}
                            disabled={actionLoading === invoice.id + '_send'}
                            className="text-text-muted hover:text-accent transition-colors disabled:opacity-50"
                            title={t('btn.send_email')}
                          >
                            <Send size={15} strokeWidth={1.8} />
                          </button>
                        )}

                        {/* Mark Paid - only for non-paid */}
                        {invoice.status !== 'paid' && (
                          <button
                            onClick={() => handleMarkPaid(invoice)}
                            disabled={actionLoading === invoice.id}
                            className="text-text-muted hover:text-success transition-colors disabled:opacity-50"
                            title={t('btn.mark_paid')}
                          >
                            <CheckCircle size={15} strokeWidth={1.8} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
