import { useState, useEffect, useCallback } from 'react';
import { BarChart2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import type { Invoice, Language } from '../types';

interface AnalyticsProps {
  t: (key: string) => string;
  language: Language;
}

function formatCurrency(amount: number): string {
  return `€${amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTHS_SHORT = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
];

interface MonthlyRevenue {
  label: string;
  invoiced: number;
  collected: number;
}

interface VehicleProfit {
  plate: string;
  makeModel: string;
  invoiced: number;
  collected: number;
  pending: number;
}

interface ClientTop {
  name: string;
  invoiced: number;
  collected: number;
}

export default function Analytics({ t }: AnalyticsProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, client:clients(*), vehicle:vehicles(*)')
        .order('billing_year', { ascending: true })
        .order('billing_month', { ascending: true });

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

  // Build last 12 months of data
  const now = new Date();
  const monthlyRevenue: MonthlyRevenue[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const label = `${MONTHS_SHORT[d.getMonth()]} ${String(year).slice(2)}`;

    const monthInvoices = invoices.filter(
      (inv) => inv.billing_month === month && inv.billing_year === year
    );

    const invoiced = monthInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
    const collected = monthInvoices
      .filter((inv) => inv.status === 'paid')
      .reduce((sum, inv) => sum + inv.total_amount, 0);

    monthlyRevenue.push({ label, invoiced, collected });
  }

  const maxRevenue = Math.max(...monthlyRevenue.map((m) => m.invoiced), 1);

  // Payment rate overall
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
  const totalCollected = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.total_amount, 0);
  const totalOverdue = invoices
    .filter((inv) => inv.status === 'overdue')
    .reduce((sum, inv) => sum + inv.total_amount, 0);
  const totalPending = invoices
    .filter((inv) => inv.status === 'sent' || inv.status === 'draft')
    .reduce((sum, inv) => sum + inv.total_amount, 0);

  const paidPct = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;
  const overduePct = totalInvoiced > 0 ? (totalOverdue / totalInvoiced) * 100 : 0;
  const pendingPct = totalInvoiced > 0 ? (totalPending / totalInvoiced) * 100 : 0;

  // Per-vehicle profitability
  const vehicleMap: Record<string, VehicleProfit> = {};
  for (const inv of invoices) {
    if (!inv.vehicle_id || !inv.vehicle) continue;
    const key = inv.vehicle_id;
    if (!vehicleMap[key]) {
      vehicleMap[key] = {
        plate: inv.vehicle.plate,
        makeModel: `${inv.vehicle.make} ${inv.vehicle.model}`,
        invoiced: 0,
        collected: 0,
        pending: 0,
      };
    }
    vehicleMap[key].invoiced += inv.total_amount;
    if (inv.status === 'paid') {
      vehicleMap[key].collected += inv.total_amount;
    } else {
      vehicleMap[key].pending += inv.total_amount;
    }
  }
  const vehicleProfits = Object.values(vehicleMap).sort((a, b) => b.invoiced - a.invoiced);

  // Top clients
  const clientMap: Record<string, ClientTop> = {};
  for (const inv of invoices) {
    if (!inv.client_id || !inv.client) continue;
    const key = inv.client_id;
    if (!clientMap[key]) {
      clientMap[key] = {
        name: inv.client.name,
        invoiced: 0,
        collected: 0,
      };
    }
    clientMap[key].invoiced += inv.total_amount;
    if (inv.status === 'paid') {
      clientMap[key].collected += inv.total_amount;
    }
  }
  const topClients = Object.values(clientMap).sort((a, b) => b.invoiced - a.invoiced).slice(0, 5);
  const maxClientInvoiced = Math.max(...topClients.map((c) => c.invoiced), 1);

  if (loading) {
    return (
      <div className="p-12 flex justify-center">
        <div className="spinner" />
      </div>
    );
  }

  if (invoices.length === 0) {
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

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">
            {t('analytics.total_invoiced')}
          </p>
          <p className="text-xl font-bold text-text-dark">{formatCurrency(totalInvoiced)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">
            {t('analytics.total_collected')}
          </p>
          <p className="text-xl font-bold text-success">{formatCurrency(totalCollected)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">
            {t('analytics.pending')}
          </p>
          <p className="text-xl font-bold text-warning">{formatCurrency(totalPending + totalOverdue)}</p>
        </div>
      </div>

      {/* Monthly Revenue Bar Chart */}
      <div className="card p-5">
        <h3 className="section-title mb-4">{t('analytics.monthly_revenue')}</h3>
        <div className="flex items-end gap-2 h-40 overflow-x-auto pb-6 relative">
          {/* Y-axis guide lines */}
          <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between pointer-events-none">
            {[100, 75, 50, 25, 0].map((pct) => (
              <div key={pct} className="w-full border-t border-accent-soft/60 relative">
                <span className="absolute -top-2 right-full pr-1 text-[10px] text-text-muted whitespace-nowrap">
                  {formatCurrency((maxRevenue * pct) / 100)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-end gap-1.5 ml-12 flex-1 h-full">
            {monthlyRevenue.map((month, idx) => {
              const invoicedH = maxRevenue > 0 ? (month.invoiced / maxRevenue) * 100 : 0;
              const collectedH = maxRevenue > 0 ? (month.collected / maxRevenue) * 100 : 0;

              return (
                <div
                  key={idx}
                  className="flex flex-col items-center gap-0.5 flex-1 min-w-[28px] group relative"
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-1 bg-text-dark text-white text-[10px] rounded px-1.5 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 left-1/2 -translate-x-1/2">
                    <div>{month.label}</div>
                    <div>Fatt: {formatCurrency(month.invoiced)}</div>
                    <div>Inc: {formatCurrency(month.collected)}</div>
                  </div>

                  <div className="flex items-end gap-0.5 w-full flex-1">
                    {/* Invoiced bar */}
                    <div
                      className="flex-1 bg-accent-muted rounded-t transition-all duration-300"
                      style={{ height: `${invoicedH}%`, minHeight: month.invoiced > 0 ? 2 : 0 }}
                    />
                    {/* Collected bar */}
                    <div
                      className="flex-1 bg-primary rounded-t transition-all duration-300"
                      style={{ height: `${collectedH}%`, minHeight: month.collected > 0 ? 2 : 0 }}
                    />
                  </div>
                  <span className="text-[9px] text-text-muted mt-1">{month.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-2 pt-3 border-t border-accent-soft">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-accent-muted" />
            <span className="text-xs text-text-muted">{t('analytics.total_invoiced')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-primary" />
            <span className="text-xs text-text-muted">{t('analytics.total_collected')}</span>
          </div>
        </div>
      </div>

      {/* Payment Rate */}
      <div className="card p-5">
        <h3 className="section-title mb-4">{t('analytics.payment_rate')}</h3>
        <div className="space-y-3">
          {/* Segmented bar */}
          <div className="flex h-6 rounded-full overflow-hidden bg-gray-100">
            {paidPct > 0 && (
              <div
                className="bg-success transition-all duration-500"
                style={{ width: `${paidPct}%` }}
                title={`${t('status.paid')}: ${paidPct.toFixed(1)}%`}
              />
            )}
            {pendingPct > 0 && (
              <div
                className="bg-warning transition-all duration-500"
                style={{ width: `${pendingPct}%` }}
                title={`${t('analytics.pending')}: ${pendingPct.toFixed(1)}%`}
              />
            )}
            {overduePct > 0 && (
              <div
                className="bg-danger transition-all duration-500"
                style={{ width: `${overduePct}%` }}
                title={`${t('analytics.overdue_label')}: ${overduePct.toFixed(1)}%`}
              />
            )}
          </div>

          {/* Labels */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-success" />
              <span className="text-xs text-text-muted">
                {t('status.paid')}: {paidPct.toFixed(1)}% ({formatCurrency(totalCollected)})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-warning" />
              <span className="text-xs text-text-muted">
                {t('analytics.pending')}: {pendingPct.toFixed(1)}% ({formatCurrency(totalPending)})
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-danger" />
              <span className="text-xs text-text-muted">
                {t('analytics.overdue_label')}: {overduePct.toFixed(1)}% ({formatCurrency(totalOverdue)})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Per-Vehicle Profitability */}
      {vehicleProfits.length > 0 && (
        <div className="card p-5">
          <h3 className="section-title mb-4">{t('analytics.vehicle_profitability')}</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">{t('vehicles.plate')}</th>
                  <th className="table-header">{t('vehicles.make')}/{t('vehicles.model')}</th>
                  <th className="table-header">{t('analytics.total_invoiced')}</th>
                  <th className="table-header">{t('analytics.total_collected')}</th>
                  <th className="table-header">{t('analytics.pending')}</th>
                  <th className="table-header">Rate</th>
                </tr>
              </thead>
              <tbody>
                {vehicleProfits.map((vp, idx) => {
                  const rate = vp.invoiced > 0 ? (vp.collected / vp.invoiced) * 100 : 0;
                  return (
                    <tr key={idx} className="table-row">
                      <td className="table-cell font-mono font-semibold text-primary">{vp.plate}</td>
                      <td className="table-cell text-text-muted">{vp.makeModel}</td>
                      <td className="table-cell font-medium">{formatCurrency(vp.invoiced)}</td>
                      <td className="table-cell text-success font-medium">
                        {formatCurrency(vp.collected)}
                      </td>
                      <td className="table-cell text-warning">{formatCurrency(vp.pending)}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-accent-soft rounded-full overflow-hidden">
                            <div
                              className="h-full bg-success rounded-full transition-all duration-300"
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="text-xs text-text-muted w-10 text-right">
                            {rate.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Clients */}
      {topClients.length > 0 && (
        <div className="card p-5">
          <h3 className="section-title mb-4">{t('analytics.top_clients')}</h3>
          <div className="space-y-3">
            {topClients.map((client, idx) => {
              const pct = (client.invoiced / maxClientInvoiced) * 100;
              return (
                <div key={idx} className="flex items-center gap-4">
                  <div className="flex items-center gap-2 w-40 flex-shrink-0">
                    <span className="text-xs font-semibold text-text-muted w-4">{idx + 1}.</span>
                    <span className="text-sm font-medium text-text-dark truncate">{client.name}</span>
                  </div>
                  <div className="flex-1 h-3 bg-accent-soft rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-right flex-shrink-0 w-28">
                    <div className="text-sm font-semibold text-text-dark">
                      {formatCurrency(client.invoiced)}
                    </div>
                    <div className="text-xs text-text-muted">
                      {formatCurrency(client.collected)} {t('analytics.total_collected').toLowerCase()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
