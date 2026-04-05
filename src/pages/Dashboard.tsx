import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, Users, FileText, DollarSign, RefreshCw, AlertCircle, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { triggerMonthlyInvoiceWebhook } from '../lib/n8n';
import KpiCard from '../components/ui/KpiCard';
import Badge from '../components/ui/Badge';
import type { Vehicle, Invoice, Penalty, Language } from '../types';

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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vehiclesRes, invoicesRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select(`*, client:clients(id, company_name, email, country)`)
          .order('created_at', { ascending: false }),
        supabase
          .from('invoices')
          .select('*, client:clients(*), vehicle:vehicles(*)')
          .order('created_at', { ascending: false }),
      ]);

      if (vehiclesRes.error) throw vehiclesRes.error;
      if (invoicesRes.error) throw invoicesRes.error;

      setVehicles((vehiclesRes.data as Vehicle[]) || []);
      setInvoices((invoicesRes.data as Invoice[]) || []);
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
      inv.billing_year === currentYear
  ).length;

  const totalInvoices = invoices.length;

  const pendingAmount = invoices
    .filter((inv) => inv.status === 'sent' || inv.status === 'overdue' || inv.status === 'draft')
    .reduce((sum, inv) => sum + inv.total_amount, 0);

  const handleGenerateInvoices = async () => {
    setGenerating(true);
    try {
      // Fetch active vehicles
      const { data: activeVehiclesData, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('*, client:clients(*)')
        .eq('status', 'active');

      if (vehiclesError) throw vehiclesError;

      if (!activeVehiclesData || activeVehiclesData.length === 0) {
        toast(t('dashboard.no_vehicles'));
        return;
      }

      // Check existing invoices for this month
      const { data: existingInvoices, error: existingError } = await supabase
        .from('invoices')
        .select('vehicle_id')
        .eq('billing_month', currentMonth)
        .eq('billing_year', currentYear);

      if (existingError) throw existingError;

      const existingVehicleIds = new Set(
        (existingInvoices || []).map((inv: { vehicle_id: string }) => inv.vehicle_id)
      );

      const vehiclesToInvoice = (activeVehiclesData as Vehicle[]).filter(
        (v) => !existingVehicleIds.has(v.id)
      );

      if (vehiclesToInvoice.length === 0) {
        toast('Tutte le fatture del mese sono già state generate');
        return;
      }

      // Fetch pending penalties for each vehicle
      const vehicleIds = vehiclesToInvoice.map((v) => v.id);
      const { data: pendingPenalties, error: penaltiesError } = await supabase
        .from('penalties')
        .select('*')
        .in('vehicle_id', vehicleIds)
        .is('added_to_invoice_id', null);

      if (penaltiesError) throw penaltiesError;

      const penaltiesByVehicle: Record<string, Penalty[]> = {};
      for (const penalty of (pendingPenalties as Penalty[]) || []) {
        if (!penaltiesByVehicle[penalty.vehicle_id]) {
          penaltiesByVehicle[penalty.vehicle_id] = [];
        }
        penaltiesByVehicle[penalty.vehicle_id].push(penalty);
      }

      const prefix = `FI-${currentYear}${String(currentMonth).padStart(2, '0')}`;
      const insertPayload = vehiclesToInvoice.map((vehicle, idx) => {
        const vehiclePenalties = penaltiesByVehicle[vehicle.id] || [];
        const penaltiesTotal = vehiclePenalties.reduce((sum, p) => sum + p.amount, 0);
        const baseAmount = vehicle.monthly_rate;
        return {
          client_id: vehicle.client_id,
          vehicle_id: vehicle.id,
          invoice_number: `${prefix}-${String(idx + 1).padStart(3, '0')}`,
          base_amount: baseAmount,
          penalties_total: penaltiesTotal,
          total_amount: baseAmount + penaltiesTotal,
          billing_month: currentMonth,
          billing_year: currentYear,
          status: 'draft',
        };
      });

      const { data: newInvoices, error: insertError } = await supabase
        .from('invoices')
        .insert(insertPayload)
        .select();

      if (insertError) throw insertError;

      // Link penalties to new invoices
      if (newInvoices) {
        for (const newInvoice of newInvoices as Invoice[]) {
          const vehiclePenalties = penaltiesByVehicle[newInvoice.vehicle_id || ''] || [];
          if (vehiclePenalties.length > 0) {
            const penaltyIds = vehiclePenalties.map((p) => p.id);
            await supabase
              .from('penalties')
              .update({ added_to_invoice_id: newInvoice.id })
              .in('id', penaltyIds);
          }
        }
      }

      await triggerMonthlyInvoiceWebhook();

      toast.success(
        `${newInvoices?.length || 0} ${t('dashboard.invoices_generated')}`
      );

      fetchData();
    } catch (err) {
      console.error(err);
      toast.error(t('error.generate_failed'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="page-title">{t('dashboard.title')}</h2>
        <button
          onClick={handleGenerateInvoices}
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
            subtitle={`${t('common.of')} ${invoices.filter((i) => i.billing_month === currentMonth && i.billing_year === currentYear).length}`}
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
                  <th className="table-header">{t('vehicles.plate')}</th>
                  <th className="table-header">{t('vehicles.make')}/{t('vehicles.model')}</th>
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
                      {vehicle.plate}
                    </td>
                    <td className="table-cell">
                      <span className="font-medium">{vehicle.make}</span>
                      <span className="text-text-muted ml-1">{vehicle.model}</span>
                      {vehicle.year && (
                        <span className="text-text-muted ml-1 text-xs">({vehicle.year})</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {vehicle.client ? (
                        <span>{vehicle.client.company_name}</span>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <OwnershipBadge status={vehicle.ownership_status} t={t} />
                    </td>
                    <td className="table-cell font-medium">
                      {formatCurrency(vehicle.monthly_rate)}
                    </td>
                    <td className="table-cell">
                      <ProfitCell value={vehicle.profit_difference} />
                    </td>
                    <td className="table-cell">
                      <ExpiryCell dateStr={vehicle.registration_expiry} />
                    </td>
                    <td className="table-cell">
                      <Badge status={vehicle.status} t={(k) => t(k)} />
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
