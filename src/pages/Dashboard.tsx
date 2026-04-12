import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Users, FileText, DollarSign, RefreshCw, AlertCircle, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { getSettings } from '../lib/settings';
import { clientDisplayName } from '../lib/clientHelpers';
import KpiCard from '../components/ui/KpiCard';
import Badge from '../components/ui/Badge';
import type { Vehicle, InvoiceRecord, Language } from '../types';

interface DashboardProps {
  t: (key: string) => string;
  language: Language;
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
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

function getExpiryStatus(dateStr: string | null): 'expired' | 'warning' | 'ok' | 'none' {
  if (!dateStr) return 'none';
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const days = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'expired';
  if (days <= 30) return 'warning';
  return 'ok';
}

function ExpiryCell({ dateStr }: { dateStr: string | null }) {
  const status = getExpiryStatus(dateStr);
  if (status === 'none') return <span className="text-text-muted">—</span>;
  const text = formatDate(dateStr);
  if (status === 'expired') {
    return (
      <span className="flex items-center gap-1 text-danger text-xs font-medium">
        <AlertCircle size={12} strokeWidth={1.8} />
        {text}
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
        <Clock size={12} strokeWidth={1.8} />
        {text}
      </span>
    );
  }
  return <span className="text-xs">{text}</span>;
}

const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

function OwnershipBadge({ status, t }: { status: 'LEASING' | "PROPRIETA'"; t: (k: string) => string }) {
  if (status === 'LEASING') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-soft text-primary">
        {t('veh.leasing')}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}
    >
      {t('veh.proprieta')}
    </span>
  );
}

function ProfitCell({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-text-muted text-xs">—</span>;
  if (value > 0) {
    return (
      <span className="flex items-center gap-1 text-success text-xs font-medium">
        <TrendingUp size={12} strokeWidth={1.8} />
        {formatCurrency(value)}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="flex items-center gap-1 text-danger text-xs font-medium">
        <TrendingDown size={12} strokeWidth={1.8} />
        {formatCurrency(value)}
      </span>
    );
  }
  return <span className="text-text-muted text-xs">€0.00</span>;
}

export default function Dashboard({ t }: DashboardProps) {
  const navigate = useNavigate();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showMonthlyConfirm, setShowMonthlyConfirm] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [generationResult, setGenerationResult] = useState<{
    created: number; skipped: number; errors: number; period: string;
  } | null>(null);
  const [genMonth, setGenMonth] = useState(() => new Date().getMonth() + 1);
  const [genYear, setGenYear] = useState(() => new Date().getFullYear());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vehiclesRes, invoicesRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select(`*, client:clients(id, company_name, company_name_additional, email, country)`)
          .order('created_at', { ascending: false }),
        supabase
          .from('invoices')
          .select('*, client:clients(*), vehicle:vehicles(*)')
          .order('created_at', { ascending: false }),
      ]);

      if (vehiclesRes.error) throw vehiclesRes.error;
      if (invoicesRes.error) throw invoicesRes.error;

      setVehicles((vehiclesRes.data as Vehicle[]) || []);
      setInvoices((invoicesRes.data as InvoiceRecord[]) || []);
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const activeVehicles = vehicles.filter((v) => v.status === 'active');
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const paidThisMonth = invoices.filter(
    (inv) =>
      inv.status === 'paid' &&
      inv.billing_month === currentMonth &&
      inv.invoice_year === currentYear
  ).length;

  const totalInvoices = invoices.length;

  const pendingAmount = invoices
    .filter((inv) => inv.status === 'sent' || inv.status === 'confirmed')
    .reduce((sum, inv) => sum + inv.total, 0);

  async function handleGenerateMonthlyClick() {
    const settings = await getSettings();
    if (!settings?.n8n_monthly_webhook_url) {
      toast.error(t('inv.webhook_not_configured'));
      return;
    }
    setShowMonthlyConfirm(true);
  }

  async function executeMonthlyGeneration() {
    setGenerating(true);
    const settings = await getSettings();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(settings.n8n_monthly_webhook_url!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: genMonth, year: genYear, triggered_by: 'App' }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`Webhook error: ${response.status}`);
      const result = await response.json();
      setShowMonthlyConfirm(false);
      setGenerationResult({
        created: result.created || 0,
        skipped: result.skipped || 0,
        errors: result.errors || 0,
        period: result.period || `${MONTHS_IT[genMonth - 1]} ${genYear}`,
      });
      setShowResultModal(true);
      await fetchData();
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        toast.error(
          'Generiranje traja dlje kot pričakovano. Preveri stran Računi čez minuto. / ' +
          'La generazione sta impiegando più tempo del previsto. Controlla la pagina Fatture tra un minuto.'
        );
      } else {
        toast.error(t('error.generate_failed'));
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="page-title">{t('dashboard.title')}</h2>
        <button
          onClick={handleGenerateMonthlyClick}
          disabled={generating || loading}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw size={15} strokeWidth={2} className={generating ? 'animate-spin' : ''} />
          {generating ? t('dashboard.generating') : t('dashboard.generate_invoices')}
        </button>
      </div>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="card p-5 h-24 animate-pulse bg-accent-soft/40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            icon={Car}
            label={t('dashboard.active_leases')}
            value={activeVehicles.length}
            subtitle={`${vehicles.length} ${t('dashboard.live_vehicles')}`}
            iconColor="text-accent"
          />
          <KpiCard
            icon={Users}
            label={t('dashboard.paid_this_month')}
            value={paidThisMonth}
            subtitle={`${t('common.of')} ${invoices.filter((i) => i.billing_month === currentMonth && i.invoice_year === currentYear).length}`}
            iconColor="text-success"
          />
          <KpiCard
            icon={FileText}
            label={t('dashboard.total_invoices')}
            value={totalInvoices}
            iconColor="text-primary"
          />
          <KpiCard
            icon={DollarSign}
            label={t('dashboard.pending_amount')}
            value={formatCurrency(pendingAmount)}
            iconColor="text-warning"
          />
        </div>
      )}

      {/* Live vehicles table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-accent-soft">
          <h3 className="section-title">{t('dashboard.live_vehicles')}</h3>
        </div>

        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="spinner" />
          </div>
        ) : activeVehicles.length === 0 ? (
          <div className="p-12 text-center">
            <Car size={40} strokeWidth={1} className="text-accent-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">{t('dashboard.no_vehicles')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">{t('vehicles.registration_number')}</th>
                  <th className="table-header">{t('vehicles.vehicle_name')}</th>
                  <th className="table-header">{t('vehicles.client')}</th>
                  <th className="table-header">{t('veh.ownership_status')}</th>
                  <th className="table-header">{t('vehicles.monthly_rate')}</th>
                  <th className="table-header">{t('veh.profit_difference')}</th>
                  <th className="table-header">{t('veh.registration_expiry')}</th>
                  <th className="table-header">{t('vehicles.status')}</th>
                </tr>
              </thead>
              <tbody>
                {activeVehicles.map((vehicle) => (
                  <tr
                    key={vehicle.id}
                    className="table-row cursor-pointer"
                    onClick={() => navigate('/vehicles')}
                  >
                    <td className="table-cell font-mono font-semibold text-primary">
                      {vehicle.registration_number}
                    </td>
                    <td className="table-cell">
                      <span className="font-medium">{vehicle.vehicle_name ?? '—'}</span>
                      {vehicle.year && (
                        <span className="text-text-muted ml-1 text-xs">({vehicle.year})</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {vehicle.client ? (
                        <span>{clientDisplayName(vehicle.client)}</span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <OwnershipBadge status={vehicle.ownership_status} t={t} />
                    </td>
                    <td className="table-cell font-medium">
                      {formatCurrency(vehicle.received_installment)}
                    </td>
                    <td className="table-cell">
                      <ProfitCell value={vehicle.profit_difference} />
                    </td>
                    <td className="table-cell">
                      <ExpiryCell dateStr={vehicle.registration_expiry} />
                    </td>
                    <td className="table-cell">
                      <Badge status={vehicle.status ?? ''} t={(k) => t(k)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* ---- Monthly generation confirm modal ---- */}
      {showMonthlyConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !generating && setShowMonthlyConfirm(false)}>
          <div className="bg-white rounded-10 shadow-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title mb-2">{t('inv.generate_confirm_title')}</h3>
            <div className="flex gap-3 mb-4">
              <select
                value={genMonth}
                onChange={(e) => setGenMonth(Number(e.target.value))}
                className="input-field flex-1"
                disabled={generating}
              >
                {MONTHS_IT.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
              <input
                type="number"
                value={genYear}
                onChange={(e) => setGenYear(Number(e.target.value))}
                className="input-field w-24"
                min={2020}
                max={2099}
                disabled={generating}
              />
            </div>
            <p className="text-sm text-text-muted mb-4">{t('inv.generate_confirm_body')}</p>
            {generating && (
              <p className="text-xs text-text-muted mb-3">
                To lahko traja do 30 sekund / Potrebbe richiedere fino a 30 secondi
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowMonthlyConfirm(false)} className="btn-secondary" disabled={generating}>
                {t('btn.cancel')}
              </button>
              <button onClick={executeMonthlyGeneration} disabled={generating} className="btn-primary flex items-center gap-2">
                {generating && <RefreshCw size={14} strokeWidth={2} className="animate-spin" />}
                {generating ? t('inv.generating') : t('inv.generate_monthly')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Generation results modal ---- */}
      {showResultModal && generationResult && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowResultModal(false)}>
          <div className="bg-white rounded-10 shadow-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title mb-4">
              {t('inv.generate_result_title')} — {generationResult.period}
            </h3>
            <div className="space-y-2 text-sm mb-2">
              <p>✅ {t('inv.generate_created')}: <strong>{generationResult.created}</strong></p>
              <p>⏭ {t('inv.generate_skipped')}: <strong>{generationResult.skipped}</strong></p>
              <p>❌ {t('inv.generate_errors')}: <strong>{generationResult.errors}</strong></p>
            </div>
            <p className="text-xs text-text-muted mb-1">{t('inv.draft_status_note')}</p>
            <p className="text-xs text-text-muted mb-5">
              Pojdi na stran Računi za pregled in pošiljanje. / Vai alla pagina Fatture per revisione e invio.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowResultModal(false)} className="btn-secondary">
                {t('common.close')}
              </button>
              <button
                onClick={() => {
                  setShowResultModal(false);
                  navigate(`/invoices?status=draft&month=${genMonth}&year=${genYear}`);
                }}
                className="btn-primary"
              >
                {t('inv.go_to_invoices')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
