import { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, CreditCard, Shield, Car, BarChart2, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/invoiceCalculations';
import { clientDisplayName } from '../lib/clientHelpers';
import KpiCard from '../components/ui/KpiCard';
import type { Vehicle, InvoiceRecord, Language } from '../types';

interface AnalyticsProps {
  t: (key: string) => string;
  language: Language;
}

const SL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Avg', 'Sep', 'Okt', 'Nov', 'Dec'];
const IT_MONTHS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

function fmt(amount: number) {
  return `€ ${formatCurrency(amount)}`;
}

export default function Analytics({ t, language }: AnalyticsProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: vData, error: vErr }, { data: iData, error: iErr }] = await Promise.all([
        supabase
          .from('vehicles')
          .select('*, client:clients(id, company_name, company_name_additional)')
          .not('client_id', 'is', null),
        supabase
          .from('invoices')
          .select('*, client:clients(id, company_name, company_name_additional)')
          .neq('status', 'cancelled')
          .order('invoice_date', { ascending: true }),
      ]);
      if (vErr) throw vErr;
      if (iErr) throw iErr;
      setVehicles((vData as Vehicle[]) ?? []);
      setInvoices((iData as InvoiceRecord[]) ?? []);
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Vehicle aggregates ──────────────────────────────────────────────────────
  const activeVehicles = vehicles.filter(v => v.status === 'active' || v.status === null);
  const leasingVehicles = activeVehicles.filter(v => v.ownership_status === 'LEASING');

  const totalReceivedMonthly = activeVehicles.reduce((s, v) => s + (v.received_installment ?? 0), 0);
  const totalLeasingMonthly  = leasingVehicles.reduce((s, v) => s + (v.lease_installment ?? 0), 0);
  const netMonthly           = totalReceivedMonthly - totalLeasingMonthly;
  const totalInsuranceAnnual = vehicles.reduce((s, v) => s + (v.annual_insurance_cost ?? 0), 0);
  const totalInsuranceMonthly = totalInsuranceAnnual / 12;
  const insurancePerVehiclePerDay = vehicles.length > 0
    ? totalInsuranceAnnual / vehicles.length / 365
    : 0;

  // ── Monthly revenue chart — last 12 months ──────────────────────────────────
  const monthLabels = language === 'sl' ? SL_MONTHS : IT_MONTHS;

  const last12 = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (11 - i));
    return { month: d.getMonth() + 1, year: d.getFullYear(), d };
  });

  const monthlyRevenue = last12.map(({ month, year, d }) => {
    const mi = invoices.filter(inv =>
      inv.billing_month === month &&
      inv.invoice_year === year &&
      (inv.status === 'paid' || inv.status === 'sent' || inv.status === 'confirmed')
    );
    return {
      label: `${monthLabels[d.getMonth()]} ${String(year).slice(2)}`,
      total: mi.reduce((s, i) => s + i.total, 0),
      paid:  mi.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0),
    };
  });

  const maxBar = Math.max(...monthlyRevenue.map(m => m.total), 1);

  // ── Payment status breakdown — current year ─────────────────────────────────
  const currentYear = new Date().getFullYear();
  const yearInvoices = invoices.filter(inv => inv.invoice_year === currentYear);
  const yearTotal = yearInvoices.reduce((s, i) => s + i.total, 0);

  const sb = {
    paid:      yearInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0),
    sent:      yearInvoices.filter(i => i.status === 'sent').reduce((s, i) => s + i.total, 0),
    confirmed: yearInvoices.filter(i => i.status === 'confirmed').reduce((s, i) => s + i.total, 0),
    draft:     yearInvoices.filter(i => i.status === 'draft').reduce((s, i) => s + i.total, 0),
  };
  const pct = (v: number) => yearTotal > 0 ? (v / yearTotal) * 100 : 0;

  // ── Per-vehicle profitability ────────────────────────────────────────────────
  const vehicleRows = activeVehicles
    .map(v => {
      const insMonthly = v.monthly_insurance ?? (v.annual_insurance_cost ?? 0) / 12;
      const leasingAmt  = v.ownership_status === 'LEASING' ? (v.lease_installment ?? 0) : null;
      const diff = v.profit_difference
        ?? ((v.received_installment ?? 0) - (leasingAmt ?? 0));
      return {
        plate:     v.registration_number,
        name:      v.vehicle_name ?? '—',
        client:    v.client ? clientDisplayName(v.client as Parameters<typeof clientDisplayName>[0]) : '—',
        received:  v.received_installment ?? 0,
        leasing:   leasingAmt,
        insurance: insMonthly,
        diff,
      };
    })
    .sort((a, b) => b.diff - a.diff);

  const totals = {
    received:  vehicleRows.reduce((s, r) => s + r.received, 0),
    leasing:   vehicleRows.reduce((s, r) => s + (r.leasing ?? 0), 0),
    insurance: vehicleRows.reduce((s, r) => s + r.insurance, 0),
    diff:      vehicleRows.reduce((s, r) => s + r.diff, 0),
  };

  // ── Top 10 clients ───────────────────────────────────────────────────────────
  const clientMap: Record<string, { name: string; total: number; paid: number; unpaid: number }> = {};
  for (const inv of invoices) {
    if (!inv.client_id || !inv.client) continue;
    const key = inv.client_id;
    if (!clientMap[key]) clientMap[key] = {
      name:   clientDisplayName(inv.client as Parameters<typeof clientDisplayName>[0]),
      total: 0, paid: 0, unpaid: 0,
    };
    clientMap[key].total += inv.total;
    if (inv.status === 'paid') clientMap[key].paid += inv.total;
    else clientMap[key].unpaid += inv.total;
  }
  const topClients = Object.values(clientMap).sort((a, b) => b.total - a.total).slice(0, 10);

  // ── Expiry alerts ────────────────────────────────────────────────────────────
  const today = new Date();
  const expiryAlerts = vehicles
    .flatMap(v => [
      { plate: v.registration_number, name: v.vehicle_name ?? '', type: t('analytics.expiry_registration'), date: v.registration_expiry },
      { plate: v.registration_number, name: v.vehicle_name ?? '', type: t('analytics.expiry_inspection'),   date: v.next_inspection },
      { plate: v.registration_number, name: v.vehicle_name ?? '', type: t('analytics.expiry_insurance'),    date: v.insurance_expiry },
    ])
    .filter(a => !!a.date)
    .map(a => ({
      ...a,
      daysLeft: Math.ceil((new Date(a.date!).getTime() - today.getTime()) / 86_400_000),
    }))
    .filter(a => a.daysLeft <= 60)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  // ── Loading skeleton ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-52 bg-accent-soft/50 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5 h-24 animate-pulse bg-accent-soft/30" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5 h-64 animate-pulse bg-accent-soft/20" />
          <div className="card p-5 h-64 animate-pulse bg-accent-soft/20" />
        </div>
      </div>
    );
  }

  if (invoices.length === 0 && vehicles.length === 0) {
    return (
      <div className="p-12 text-center">
        <BarChart2 size={40} strokeWidth={1} className="text-accent-muted mx-auto mb-3" />
        <p className="text-sm text-text-muted">{t('analytics.no_data')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="page-title">{t('analytics.title')}</h2>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          icon={TrendingUp}
          label={t('analytics.received_monthly')}
          value={fmt(totalReceivedMonthly)}
          iconColor="text-success"
        />
        <KpiCard
          icon={CreditCard}
          label={t('analytics.leasing_monthly')}
          value={fmt(totalLeasingMonthly)}
          iconColor="text-warning"
        />
        <KpiCard
          icon={netMonthly >= 0 ? TrendingUp : TrendingDown}
          label={t('analytics.difference')}
          value={fmt(netMonthly)}
          subtitle="= Prejeto − Leasing"
          iconColor={netMonthly >= 0 ? 'text-success' : 'text-danger'}
        />
        <KpiCard
          icon={Shield}
          label={t('analytics.insurance_annual')}
          value={fmt(totalInsuranceAnnual)}
          iconColor="text-blue-600"
        />
        <KpiCard
          icon={Shield}
          label={t('analytics.insurance_monthly')}
          value={fmt(totalInsuranceMonthly)}
          subtitle="= Letno / 12"
          iconColor="text-blue-400"
        />
        <KpiCard
          icon={Car}
          label={t('analytics.insurance_per_vehicle')}
          value={fmt(insurancePerVehiclePerDay)}
          subtitle={`${vehicles.length} vozil × 365`}
          iconColor="text-purple-500"
        />
      </div>

      {/* ── Revenue chart + Payment status ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Bar chart — last 12 months */}
        <div className="card p-5">
          <h3 className="section-title mb-4">{t('analytics.monthly_revenue')}</h3>
          <div className="flex items-end gap-1.5 h-44 overflow-x-auto pb-6 relative">
            {/* Y-axis lines */}
            <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
              {[100, 75, 50, 25, 0].map(p => (
                <div key={p} className="w-full border-t border-accent-soft/60 relative">
                  <span className="absolute -top-2 left-0 text-[9px] text-text-muted whitespace-nowrap">
                    {fmt((maxBar * p) / 100)}
                  </span>
                </div>
              ))}
            </div>

            {/* Bars */}
            <div className="flex items-end gap-1 ml-14 flex-1 h-full">
              {monthlyRevenue.map((m, i) => {
                const totalH  = maxBar > 0 ? (m.total / maxBar) * 100 : 0;
                const paidH   = maxBar > 0 ? (m.paid  / maxBar) * 100 : 0;
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-0.5 flex-1 min-w-[26px] group relative"
                  >
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-text-dark text-white text-[10px] rounded px-1.5 py-1 whitespace-nowrap z-10 left-1/2 -translate-x-1/2 pointer-events-none">
                      <div className="font-semibold">{m.label}</div>
                      <div>Tot: {fmt(m.total)}</div>
                      <div>Pag: {fmt(m.paid)}</div>
                    </div>
                    <div className="flex items-end gap-px w-full flex-1">
                      <div
                        className="flex-1 rounded-t transition-all duration-300"
                        style={{
                          height: `${totalH}%`,
                          minHeight: m.total > 0 ? 2 : 0,
                          background: 'var(--color-accent-muted)',
                        }}
                      />
                      <div
                        className="flex-1 rounded-t transition-all duration-300"
                        style={{
                          height: `${paidH}%`,
                          minHeight: m.paid > 0 ? 2 : 0,
                          background: 'var(--color-primary)',
                        }}
                      />
                    </div>
                    <span className="text-[8px] text-text-muted truncate">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex gap-4 pt-2 border-t border-accent-soft">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--color-accent-muted)' }} />
              <span className="text-xs text-text-muted">{t('analytics.total_invoiced')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--color-primary)' }} />
              <span className="text-xs text-text-muted">{t('analytics.total_collected')}</span>
            </div>
          </div>
        </div>

        {/* Payment status bar */}
        <div className="card p-5">
          <h3 className="section-title mb-1">{t('analytics.payment_status')}</h3>
          <p className="text-xs text-text-muted mb-4">{language === 'sl' ? `Leto ${currentYear}` : `Anno ${currentYear}`}</p>
          <div className="space-y-4">
            <div className="flex h-7 rounded-lg overflow-hidden bg-gray-100">
              {pct(sb.paid)      > 0 && <div className="bg-success   transition-all duration-500" style={{ width: `${pct(sb.paid)}%` }} />}
              {pct(sb.sent)      > 0 && <div className="bg-warning   transition-all duration-500" style={{ width: `${pct(sb.sent)}%` }} />}
              {pct(sb.confirmed) > 0 && <div className="bg-blue-500 transition-all duration-500" style={{ width: `${pct(sb.confirmed)}%` }} />}
              {pct(sb.draft)     > 0 && <div className="bg-gray-400 transition-all duration-500" style={{ width: `${pct(sb.draft)}%` }} />}
            </div>
            <div className="space-y-2">
              {([
                { key: 'paid',      label: language === 'sl' ? 'Plačano'   : 'Pagato',    val: sb.paid,      color: 'bg-success' },
                { key: 'sent',      label: language === 'sl' ? 'Poslano'   : 'Inviato',   val: sb.sent,      color: 'bg-warning' },
                { key: 'confirmed', label: language === 'sl' ? 'Potrjeno'  : 'Confermato',val: sb.confirmed, color: 'bg-blue-500' },
                { key: 'draft',     label: language === 'sl' ? 'Osnutek'   : 'Bozza',     val: sb.draft,     color: 'bg-gray-400' },
              ] as const).filter(r => r.val > 0).map(({ key, label, val, color }) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
                    <span className="text-xs text-text-muted">{label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-text-dark">{pct(val).toFixed(1)}%</span>
                    <span className="text-xs text-text-muted w-24 text-right">{fmt(val)}</span>
                  </div>
                </div>
              ))}
            </div>
            {yearTotal > 0 && (
              <div className="pt-2 border-t border-accent-soft flex justify-between">
                <span className="text-xs text-text-muted">Total</span>
                <span className="text-xs font-semibold text-text-dark">{fmt(yearTotal)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Summary totals ── */}
      <div className="card p-5">
        <h3 className="section-title mb-4">{t('analytics.summary')}</h3>
        <div className="divide-y divide-accent-soft/50">
          {([
            { label: t('analytics.received_monthly'),     value: totalReceivedMonthly,     color: 'text-success',    note: null },
            { label: t('analytics.leasing_monthly'),      value: totalLeasingMonthly,      color: 'text-warning',    note: null },
            { label: t('analytics.difference'),           value: netMonthly,               color: netMonthly >= 0 ? 'text-success' : 'text-danger', note: '= Prejeto − Leasing' },
            { label: t('analytics.insurance_annual'),     value: totalInsuranceAnnual,     color: 'text-text-dark',  note: null },
            { label: t('analytics.insurance_monthly'),    value: totalInsuranceMonthly,    color: 'text-text-dark',  note: '= Letno / 12' },
            { label: t('analytics.insurance_per_vehicle'),value: insurancePerVehiclePerDay,color: 'text-purple-600', note: `= Letno / ${vehicles.length} vozil / 365` },
          ] as const).map(({ label, value, color, note }) => (
            <div key={label} className="flex items-start justify-between py-3">
              <div>
                <p className="text-sm font-medium text-text-dark">{label}</p>
                {note && <p className="text-xs text-text-muted mt-0.5">{note}</p>}
              </div>
              <p className={`text-sm font-bold font-mono ${color} ml-4 whitespace-nowrap`}>{fmt(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Expiry alerts ── */}
      {expiryAlerts.length > 0 && (
        <div className="card p-5">
          <h3 className="section-title mb-4">{t('analytics.expiry_alerts')}</h3>
          <div className="space-y-1.5">
            {expiryAlerts.map((a, i) => {
              const expired = a.daysLeft < 0;
              const soon    = !expired && a.daysLeft <= 30;
              const rowBg   = expired ? 'bg-red-50' : soon ? 'bg-amber-50' : 'bg-accent-soft/20';
              const txtCol  = expired ? 'text-danger' : soon ? 'text-warning' : 'text-success';
              return (
                <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg ${rowBg}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <AlertTriangle
                      size={14}
                      strokeWidth={1.8}
                      className={expired || soon ? txtCol : 'text-text-muted'}
                    />
                    <span className="font-mono font-semibold text-sm text-primary shrink-0">{a.plate}</span>
                    <span className="text-xs text-text-muted truncate hidden sm:block">{a.name}</span>
                    <span className="text-xs text-text-muted shrink-0">{a.type}</span>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-xs text-text-muted">{a.date}</p>
                    <p className={`text-xs font-semibold ${txtCol}`}>
                      {expired
                        ? t('analytics.expired')
                        : `${a.daysLeft} ${t('analytics.days_left')}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Per-vehicle profitability table ── */}
      {vehicleRows.length > 0 && (
        <div className="card p-5">
          <h3 className="section-title mb-4">{t('analytics.per_vehicle')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">{t('vehicles.registration_number')}</th>
                  <th className="table-header">{t('vehicles.vehicle_name')}</th>
                  <th className="table-header">{t('vehicles.client')}</th>
                  <th className="table-header text-right">{t('analytics.received_monthly')}</th>
                  <th className="table-header text-right">{t('analytics.leasing_monthly')}</th>
                  <th className="table-header text-right">{t('analytics.insurance_monthly')}</th>
                  <th className="table-header text-right">{t('analytics.difference')}</th>
                </tr>
              </thead>
              <tbody>
                {vehicleRows.map((r, i) => (
                  <tr key={i} className="table-row">
                    <td className="table-cell font-mono font-semibold text-primary text-sm">{r.plate}</td>
                    <td className="table-cell text-text-muted text-sm">{r.name}</td>
                    <td className="table-cell text-text-muted text-sm">{r.client}</td>
                    <td className="table-cell text-right font-medium text-sm">{fmt(r.received)}</td>
                    <td className="table-cell text-right text-text-muted text-sm">
                      {r.leasing !== null ? fmt(r.leasing) : '—'}
                    </td>
                    <td className="table-cell text-right text-text-muted text-sm">{fmt(r.insurance)}</td>
                    <td className={`table-cell text-right font-semibold text-sm ${r.diff >= 0 ? 'text-success' : 'text-danger'}`}>
                      {fmt(r.diff)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-accent">
                  <td className="table-cell font-bold text-text-dark text-sm" colSpan={3}>{t('analytics.total_row')}</td>
                  <td className="table-cell text-right font-bold text-sm">{fmt(totals.received)}</td>
                  <td className="table-cell text-right font-bold text-sm">{fmt(totals.leasing)}</td>
                  <td className="table-cell text-right font-bold text-sm">{fmt(totals.insurance)}</td>
                  <td className={`table-cell text-right font-bold text-sm ${totals.diff >= 0 ? 'text-success' : 'text-danger'}`}>
                    {fmt(totals.diff)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Top clients ── */}
      {topClients.length > 0 && (
        <div className="card p-5">
          <h3 className="section-title mb-4">{t('analytics.top_clients')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">{t('vehicles.client')}</th>
                  <th className="table-header text-right">{t('analytics.total_invoiced')}</th>
                  <th className="table-header text-right">{t('analytics.total_collected')}</th>
                  <th className="table-header text-right">{t('analytics.pending')}</th>
                </tr>
              </thead>
              <tbody>
                {topClients.map((c, i) => (
                  <tr key={i} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted w-5 shrink-0">{i + 1}.</span>
                        <span className="font-medium text-text-dark text-sm">{c.name}</span>
                      </div>
                    </td>
                    <td className="table-cell text-right font-medium text-sm">{fmt(c.total)}</td>
                    <td className="table-cell text-right text-success font-medium text-sm">{fmt(c.paid)}</td>
                    <td className={`table-cell text-right text-sm ${c.unpaid > 0 ? 'text-warning font-medium' : 'text-text-muted'}`}>
                      {fmt(c.unpaid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
