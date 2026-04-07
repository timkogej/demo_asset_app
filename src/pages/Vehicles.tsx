import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Car, Plus, Pencil, Trash2, AlertCircle, Clock, TrendingUp, TrendingDown,
  AlertTriangle, X, Info, ChevronUp, ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import { clientDisplayName } from '../lib/clientHelpers';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SearchInput from '../components/ui/SearchInput';
import Combobox from '../components/ui/Combobox';
import type { Vehicle, Client, Language } from '../types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface VehiclesProps {
  t: (key: string) => string;
  language: Language;
}

// ─── Local types ──────────────────────────────────────────────────────────────

type OwnershipFilter = 'all' | 'LEASING' | "PROPRIETA'";
type RegEditMode = 'readonly' | 'confirming' | 'editing';
type SortDir = 'asc' | 'desc';

interface SortConfig {
  key: string;
  dir: SortDir;
}

interface VehicleFormData {
  registration_number: string;
  vehicle_name: string;
  year: string;
  current_km: string;
  status: 'active' | 'maintenance' | 'returning';
  client_id: string;
  lease_start_date: string;
  lease_end_date: string;
  ownership_status: 'LEASING' | "PROPRIETA'";
  leasing_company: string;
  contract_number: string;
  lease_installment: string;
  registration_expiry: string;
  next_inspection: string;
  insurance_company: string;
  insurance_expiry: string;
  annual_insurance_cost: string;
  received_installment: string;
  deposit: string;
  lease_months: string;
  vehicle_country: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const emptyForm: VehicleFormData = {
  registration_number: '',
  vehicle_name: '',
  year: '',
  current_km: '',
  status: 'active',
  client_id: '',
  lease_start_date: '',
  lease_end_date: '',
  ownership_status: 'LEASING',
  leasing_company: '',
  contract_number: '',
  lease_installment: '',
  registration_expiry: '',
  next_inspection: '',
  insurance_company: '',
  insurance_expiry: '',
  annual_insurance_cost: '',
  received_installment: '',
  deposit: '',
  lease_months: '',
  vehicle_country: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function vehicleToForm(v: Vehicle): VehicleFormData {
  return {
    registration_number: v.registration_number,
    vehicle_name: v.vehicle_name ?? '',
    year: v.year?.toString() ?? '',
    current_km: v.current_km.toString(),
    status: (v.status as 'active' | 'maintenance' | 'returning') ?? 'active',
    client_id: v.client_id ?? '',
    lease_start_date: v.lease_start_date ?? '',
    lease_end_date: v.lease_end_date ?? '',
    ownership_status: v.ownership_status,
    leasing_company: v.leasing_company ?? '',
    contract_number: v.contract_number ?? '',
    lease_installment: v.lease_installment?.toString() ?? '',
    registration_expiry: v.registration_expiry ?? '',
    next_inspection: v.next_inspection ?? '',
    insurance_company: v.insurance_company ?? '',
    insurance_expiry: v.insurance_expiry ?? '',
    annual_insurance_cost: v.annual_insurance_cost?.toString() ?? '',
    received_installment: v.received_installment?.toString() ?? '',
    deposit: v.deposit?.toString() ?? '',
    lease_months: v.lease_months?.toString() ?? '',
    vehicle_country: v.vehicle_country ?? '',
  };
}

function buildPayload(form: VehicleFormData) {
  const isProprieta = form.ownership_status === "PROPRIETA'";
  return {
    registration_number: form.registration_number.trim().toUpperCase(),
    vehicle_name: form.vehicle_name.trim() || null,
    year: form.year ? parseInt(form.year) : null,
    current_km: parseInt(form.current_km) || 0,
    status: form.status,
    client_id: form.client_id || null,
    lease_start_date: form.lease_start_date || null,
    lease_end_date: form.lease_end_date || null,
    ownership_status: form.ownership_status,
    leasing_company: isProprieta ? null : (form.leasing_company || null),
    contract_number: isProprieta ? '*-*' : (form.contract_number || null),
    lease_installment: isProprieta ? null : (form.lease_installment ? parseFloat(form.lease_installment) : null),
    registration_expiry: form.registration_expiry || null,
    next_inspection: form.next_inspection || null,
    insurance_company: form.insurance_company || null,
    insurance_expiry: form.insurance_expiry || null,
    annual_insurance_cost: form.annual_insurance_cost ? parseFloat(form.annual_insurance_cost) : null,
    received_installment: form.received_installment ? parseFloat(form.received_installment) : null,
    deposit: isProprieta ? null : (form.deposit ? parseFloat(form.deposit) : null),
    lease_months: isProprieta ? null : (form.lease_months ? parseInt(form.lease_months) : null),
    vehicle_country: form.vehicle_country || null,
  };
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

function computeValues(form: VehicleFormData) {
  const depPerMonth =
    form.deposit && form.lease_months && parseFloat(form.lease_months) > 0
      ? parseFloat(form.deposit) / parseFloat(form.lease_months)
      : null;
  const monthlyIns = form.annual_insurance_cost
    ? parseFloat(form.annual_insurance_cost) / 12
    : null;
  const isProprieta = form.ownership_status === "PROPRIETA'";
  const leaseInst = isProprieta ? 0 : (parseFloat(form.lease_installment) || 0);
  const receivedInst = parseFloat(form.received_installment) || 0;
  const profitDiff =
    monthlyIns !== null
      ? (depPerMonth ?? 0) + receivedInst - leaseInst - monthlyIns
      : null;
  return { depPerMonth, monthlyIns, profitDiff };
}

function getSortValue(v: Vehicle, key: string): string | number | null {
  switch (key) {
    case 'registration_number': return v.registration_number;
    case 'vehicle_name': return v.vehicle_name;
    case 'status': return v.status;
    case 'ownership_status': return v.ownership_status;
    case 'leasing_company': return v.leasing_company;
    case 'contract_number': return v.contract_number;
    case 'lease_installment': return v.lease_installment;
    case 'received_installment': return v.received_installment;
    case 'insurance_company': return v.insurance_company;
    case 'insurance_expiry': return v.insurance_expiry;
    case 'monthly_insurance': return v.monthly_insurance;
    case 'deposit': return v.deposit;
    case 'lease_months': return v.lease_months;
    case 'deposit_per_month': return v.deposit_per_month;
    case 'profit_difference': return v.profit_difference;
    case 'registration_expiry': return v.registration_expiry;
    case 'next_inspection': return v.next_inspection;
    case 'client': return v.client ? clientDisplayName(v.client) : null;
    default: return null;
  }
}

// ─── Small display components ─────────────────────────────────────────────────

function ExpiryCell({ dateStr }: { dateStr: string | null }) {
  const status = getExpiryStatus(dateStr);
  if (status === 'none') return <span className="text-text-muted">—</span>;
  const text = formatDate(dateStr);
  if (status === 'expired') {
    return (
      <span className="flex items-center gap-1 text-danger font-medium text-xs">
        <AlertCircle size={12} strokeWidth={1.8} />
        {text}
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="flex items-center gap-1 text-amber-600 font-medium text-xs">
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
      <span className="flex items-center gap-1 text-success font-medium text-xs">
        <TrendingUp size={12} strokeWidth={1.8} />
        {formatCurrency(value)}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="flex items-center gap-1 text-danger font-medium text-xs">
        <TrendingDown size={12} strokeWidth={1.8} />
        {formatCurrency(value)}
      </span>
    );
  }
  return <span className="text-text-muted text-xs">€0.00</span>;
}

// ─── VehicleFormContent ───────────────────────────────────────────────────────

interface VehicleFormContentProps {
  form: VehicleFormData;
  setForm: React.Dispatch<React.SetStateAction<VehicleFormData>>;
  errors: Partial<Record<keyof VehicleFormData, string>>;
  isEdit?: boolean;
  regEditMode?: RegEditMode;
  setRegEditMode?: (m: RegEditMode) => void;
  clients: Client[];
  leasingCompanies: string[];
  insuranceCompanies: string[];
  t: (key: string) => string;
}

function VehicleFormContent({
  form,
  setForm,
  errors,
  isEdit,
  regEditMode,
  setRegEditMode,
  clients,
  leasingCompanies,
  insuranceCompanies,
  t,
}: VehicleFormContentProps) {
  const upd = (field: keyof VehicleFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const isLeasing = form.ownership_status === 'LEASING';
  const { depPerMonth, monthlyIns, profitDiff } = useMemo(() => computeValues(form), [form]);

  const switchOwnership = (val: 'LEASING' | "PROPRIETA'") => {
    setForm((f) => ({
      ...f,
      ownership_status: val,
      ...(val === "PROPRIETA'" ? {
        contract_number: '*-*',
        lease_installment: '',
        deposit: '',
        lease_months: '',
        leasing_company: '',
      } : {}),
    }));
  };

  return (
    <div className="space-y-6">
      {/* ── Veicolo ── */}
      <div>
        <h4 className="text-sm font-semibold text-text-dark mb-3 pb-2 border-b border-accent-soft">
          {t('veh.section_vehicle')}
        </h4>
        <div className="grid grid-cols-2 gap-3">
          {/* Registration number */}
          <div className="col-span-2">
            <label className="label">{t('vehicles.registration_number')} *</label>
            {isEdit && regEditMode !== 'editing' ? (
              <>
                {regEditMode === 'confirming' && (
                  <div
                    className="mb-2 flex items-start gap-2 px-3 py-2 rounded-10 border text-sm"
                    style={{ backgroundColor: '#fef3c7', borderColor: '#fcd34d' }}
                  >
                    <AlertTriangle size={15} strokeWidth={1.8} className="text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-amber-800 font-medium mb-1 text-xs">
                        {t('veh.change_plate_confirm')}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded bg-amber-600 text-white font-medium hover:bg-amber-700"
                          onClick={() => setRegEditMode?.('editing')}
                        >
                          {t('veh.yes_edit')}
                        </button>
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded border border-amber-400 text-amber-800 hover:bg-amber-50"
                          onClick={() => setRegEditMode?.('readonly')}
                        >
                          {t('btn.cancel')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    className="input-field font-mono bg-bg cursor-not-allowed flex-1"
                    value={form.registration_number}
                    readOnly
                  />
                  <button
                    type="button"
                    className="p-2 text-text-muted hover:text-primary transition-colors rounded-10 hover:bg-accent-soft border border-accent-muted"
                    onClick={() => setRegEditMode?.('confirming')}
                    title={t('btn.edit')}
                  >
                    <Pencil size={14} strokeWidth={1.8} />
                  </button>
                </div>
              </>
            ) : (
              <input
                className="input-field font-mono"
                value={form.registration_number}
                onChange={upd('registration_number')}
                placeholder="AB 123 CD"
              />
            )}
            {errors.registration_number && <p className="error-text">{errors.registration_number}</p>}
          </div>

          {/* Vehicle name */}
          <div className="col-span-2">
            <label className="label">{t('vehicles.vehicle_name')}</label>
            <input
              className="input-field"
              value={form.vehicle_name}
              onChange={upd('vehicle_name')}
              placeholder="BMW 320d"
            />
          </div>

          <div>
            <label className="label">{t('vehicles.year')}</label>
            <input type="number" className="input-field" value={form.year} onChange={upd('year')} placeholder="2023" min="1990" max="2030" />
          </div>
          <div>
            <label className="label">{t('vehicles.current_km')} *</label>
            <input type="number" className="input-field" value={form.current_km} onChange={upd('current_km')} placeholder="45000" min="0" />
            {errors.current_km && <p className="error-text">{errors.current_km}</p>}
          </div>
          <div>
            <label className="label">{t('vehicles.status')}</label>
            <select className="input-field" value={form.status} onChange={upd('status')}>
              <option value="active">{t('status.active')}</option>
              <option value="maintenance">{t('status.maintenance')}</option>
              <option value="returning">{t('status.returning')}</option>
            </select>
          </div>
          <div>
            <label className="label">{t('veh.vehicle_country')}</label>
            <input className="input-field" value={form.vehicle_country} onChange={upd('vehicle_country')} placeholder="IT" />
          </div>

          {/* Ownership toggle */}
          <div className="col-span-2">
            <label className="label">{t('veh.ownership_status')}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => switchOwnership('LEASING')}
                className={`flex-1 py-2 px-4 rounded-10 text-sm font-medium border transition-colors ${
                  isLeasing
                    ? 'bg-accent-soft text-primary border-accent'
                    : 'bg-surface text-text-muted border-accent-muted hover:bg-bg'
                }`}
              >
                LEASING
              </button>
              <button
                type="button"
                onClick={() => switchOwnership("PROPRIETA'")}
                className={`flex-1 py-2 px-4 rounded-10 text-sm font-medium border transition-colors ${
                  !isLeasing
                    ? 'text-[#1d4ed8] border-[#93c5fd]'
                    : 'bg-surface text-text-muted border-accent-muted hover:bg-bg'
                }`}
                style={!isLeasing ? { backgroundColor: '#dbeafe' } : {}}
              >
                PROPRIETÀ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Leasing (conditional) ── */}
      {isLeasing && (
        <div>
          <h4 className="text-sm font-semibold text-text-dark mb-3 pb-2 border-b border-accent-soft">
            {t('veh.section_leasing')}
          </h4>
          <div className="grid grid-cols-2 gap-3 p-3 rounded-10 bg-accent-soft/40 border border-accent-muted">
            <div className="col-span-2">
              <label className="label">{t('veh.leasing_company')}</label>
              <Combobox
                value={form.leasing_company}
                onChange={(v) => setForm((f) => ({ ...f, leasing_company: v }))}
                options={leasingCompanies}
                placeholder="Ald Automotive..."
                addNewLabel={t('veh.combobox_new')}
              />
            </div>
            <div>
              <label className="label">{t('veh.contract_number')}</label>
              <input className="input-field" value={form.contract_number} onChange={upd('contract_number')} placeholder="CON-2024-001" />
            </div>
            <div>
              <label className="label">{t('veh.lease_months')}</label>
              <input type="number" className="input-field" value={form.lease_months} onChange={upd('lease_months')} placeholder="36" min="1" />
            </div>
            <div>
              <label className="label">{t('veh.lease_installment')} (€)</label>
              <input type="number" className="input-field" value={form.lease_installment} onChange={upd('lease_installment')} placeholder="400.00" min="0" step="0.01" />
            </div>
            <div>
              <label className="label">{t('veh.received_installment')} (€)</label>
              <input type="number" className="input-field" value={form.received_installment} onChange={upd('received_installment')} placeholder="650.00" min="0" step="0.01" />
            </div>
            <div>
              <label className="label">{t('veh.deposit')} (€)</label>
              <input type="number" className="input-field" value={form.deposit} onChange={upd('deposit')} placeholder="2000.00" min="0" step="0.01" />
            </div>
            <div>
              <label className="label">{t('vehicles.lease_start_date')}</label>
              <input type="date" className="input-field" value={form.lease_start_date} onChange={upd('lease_start_date')} />
            </div>
            <div>
              <label className="label">{t('vehicles.lease_end_date')}</label>
              <input type="date" className="input-field" value={form.lease_end_date} onChange={upd('lease_end_date')} />
            </div>
          </div>
        </div>
      )}

      {/* ── Assicurazione ── */}
      <div>
        <h4 className="text-sm font-semibold text-text-dark mb-3 pb-2 border-b border-accent-soft">
          {t('veh.insurance_section')}
        </h4>
        <div className="grid grid-cols-2 gap-3 p-3 rounded-10 border" style={{ backgroundColor: '#f0f9ff', borderColor: '#bfdbfe' }}>
          <div className="col-span-2">
            <label className="label">{t('veh.insurance_company')}</label>
            <Combobox
              value={form.insurance_company}
              onChange={(v) => setForm((f) => ({ ...f, insurance_company: v }))}
              options={insuranceCompanies}
              placeholder="Generali..."
              addNewLabel={t('veh.combobox_new')}
            />
          </div>
          <div>
            <label className="label">{t('veh.insurance_expiry')}</label>
            <input type="date" className="input-field" value={form.insurance_expiry} onChange={upd('insurance_expiry')} />
          </div>
          <div>
            <label className="label">{t('veh.annual_insurance_cost')} (€)</label>
            <input type="number" className="input-field" value={form.annual_insurance_cost} onChange={upd('annual_insurance_cost')} placeholder="800.00" min="0" step="0.01" />
          </div>
        </div>
      </div>

      {/* ── Scadenze ── */}
      <div>
        <h4 className="text-sm font-semibold text-text-dark mb-3 pb-2 border-b border-accent-soft">
          {t('veh.section_expiry')}
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('veh.registration_expiry')}</label>
            <input type="date" className="input-field" value={form.registration_expiry} onChange={upd('registration_expiry')} />
          </div>
          <div>
            <label className="label">{t('veh.next_inspection')}</label>
            <input type="date" className="input-field" value={form.next_inspection} onChange={upd('next_inspection')} />
          </div>
        </div>
      </div>

      {/* ── Cliente ── */}
      <div>
        <h4 className="text-sm font-semibold text-text-dark mb-3 pb-2 border-b border-accent-soft">
          {t('veh.section_client')}
        </h4>
        <div>
          <label className="label">{t('vehicles.client')}</label>
          <select className="input-field" value={form.client_id} onChange={upd('client_id')}>
            <option value="">{t('vehicles.no_client')}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                [{c.id}] {clientDisplayName(c)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Computed preview ── */}
      <div className="rounded-10 border border-accent-muted bg-bg p-3">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
          {t('veh.computed_label')}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: t('veh.deposit_per_month'), value: depPerMonth },
            { label: t('veh.monthly_insurance'), value: monthlyIns },
            { label: t('veh.profit_difference'), value: profitDiff },
          ].map(({ label, value }) => (
            <div key={label} className="bg-surface rounded-10 border border-accent-soft px-2 py-1.5">
              <p className="text-xs text-text-muted">{label}</p>
              <p className={`text-sm font-medium italic ${
                value === null ? 'text-text-muted' :
                label === t('veh.profit_difference') && value > 0 ? 'text-success' :
                label === t('veh.profit_difference') && value < 0 ? 'text-danger' :
                'text-text-dark'
              }`}>
                = {value !== null ? formatCurrency(value) : '—'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── VehicleEditDrawer ────────────────────────────────────────────────────────

interface VehicleEditDrawerProps {
  vehicle: Vehicle;
  clients: Client[];
  leasingCompanies: string[];
  insuranceCompanies: string[];
  t: (key: string) => string;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}

function VehicleEditDrawer({
  vehicle,
  clients,
  leasingCompanies,
  insuranceCompanies,
  t,
  onClose,
  onSaved,
  onDelete,
}: VehicleEditDrawerProps) {
  const [form, setForm] = useState<VehicleFormData>(() => vehicleToForm(vehicle));
  const [regEditMode, setRegEditMode] = useState<RegEditMode>('readonly');
  const [errors, setErrors] = useState<Partial<Record<keyof VehicleFormData, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(vehicleToForm(vehicle));
    setRegEditMode('readonly');
    setErrors({});
  }, [vehicle]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const validate = () => {
    const errs: Partial<Record<keyof VehicleFormData, string>> = {};
    if (!form.registration_number.trim()) errs.registration_number = t('form.required');
    if (!form.current_km || isNaN(Number(form.current_km))) errs.current_km = t('form.required');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('vehicles')
        .update(buildPayload(form))
        .eq('id', vehicle.id);
      if (error) throw error;
      toast.success(t('btn.save'));
      onSaved();
      onClose();
    } catch {
      toast.error(t('error.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="animate-slideInRight relative w-[420px] h-full bg-surface shadow-xl flex flex-col border-l border-accent-muted">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-accent-soft shrink-0">
          <div>
            <p className="font-mono font-bold text-primary text-lg leading-none">{vehicle.registration_number}</p>
            {vehicle.vehicle_name && <p className="text-sm text-text-muted mt-0.5">{vehicle.vehicle_name}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDelete(vehicle.id)}
              className="p-1.5 text-text-muted hover:text-danger transition-colors"
              title={t('btn.delete')}
            >
              <Trash2 size={16} strokeWidth={1.8} />
            </button>
            <button onClick={onClose} className="p-1.5 text-text-muted hover:text-text-dark transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          <VehicleFormContent
            form={form}
            setForm={setForm}
            errors={errors}
            isEdit={true}
            regEditMode={regEditMode}
            setRegEditMode={setRegEditMode}
            clients={clients}
            leasingCompanies={leasingCompanies}
            insuranceCompanies={insuranceCompanies}
            t={t}
          />
          <div className="mt-6 pt-4 border-t border-accent-soft flex gap-3 justify-end">
            <button onClick={onClose} className="btn-secondary">{t('btn.cancel')}</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? t('common.loading') : t('veh.save_changes')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── VehicleDetailModal ───────────────────────────────────────────────────────

interface VehicleDetailModalProps {
  vehicle: Vehicle;
  t: (key: string) => string;
  onClose: () => void;
  onEdit: () => void;
}

function VehicleDetailModal({ vehicle, t, onClose, onEdit }: VehicleDetailModalProps) {
  const isLeasing = vehicle.ownership_status === 'LEASING';
  const { depPerMonth, monthlyIns, profitDiff } = useMemo(
    () => computeValues(vehicleToForm(vehicle)),
    [vehicle]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface rounded-10 shadow-xl border border-accent-muted w-full max-w-[680px] max-h-[90vh] flex flex-col animate-slideIn">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-accent-soft shrink-0">
          <div>
            <p className="font-mono font-bold text-primary text-2xl leading-tight">
              {vehicle.registration_number}
            </p>
            {vehicle.vehicle_name && (
              <p className="text-text-dark text-base mt-0.5">{vehicle.vehicle_name}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge status={vehicle.status ?? ''} t={(k) => t(k)} />
              <OwnershipBadge status={vehicle.ownership_status} t={t} />
              {vehicle.vehicle_country && (
                <span className="text-xs text-text-muted bg-bg border border-accent-muted px-2 py-0.5 rounded-full">
                  {vehicle.vehicle_country}
                </span>
              )}
              {vehicle.year && (
                <span className="text-xs text-text-muted bg-bg border border-accent-muted px-2 py-0.5 rounded-full">
                  {vehicle.year}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button
              onClick={onEdit}
              className="p-1.5 text-text-muted hover:text-primary transition-colors rounded-10 hover:bg-accent-soft"
              title={t('btn.edit')}
            >
              <Pencil size={16} strokeWidth={1.8} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-text-muted hover:text-text-dark transition-colors rounded-10 hover:bg-bg"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {/* KM */}
          <p className="text-sm text-text-muted">
            {vehicle.current_km.toLocaleString('it-IT')} km
          </p>

          {/* Leasing section */}
          {isLeasing && (
            <div className="rounded-10 border border-accent-muted p-4" style={{ backgroundColor: 'var(--color-accent-soft)' }}>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                {t('veh.section_leasing')}
              </h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {[
                  [t('veh.leasing_company'), vehicle.leasing_company],
                  [t('veh.contract_number'), vehicle.contract_number],
                  [t('veh.lease_installment'), formatCurrency(vehicle.lease_installment)],
                  [t('veh.received_installment'), formatCurrency(vehicle.received_installment)],
                  [t('veh.lease_months'), vehicle.lease_months ? `${vehicle.lease_months} ${t('common.months')}` : '—'],
                  [t('veh.deposit'), formatCurrency(vehicle.deposit)],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <p className="text-xs text-text-muted">{label}</p>
                    <p className="text-sm font-medium text-text-dark">{value || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Insurance section */}
          <div className="rounded-10 border p-4" style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }}>
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              {t('veh.insurance_section')}
            </h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <p className="text-xs text-text-muted">{t('veh.insurance_company')}</p>
                <p className="text-sm font-medium text-text-dark">{vehicle.insurance_company || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">{t('veh.insurance_expiry')}</p>
                <ExpiryCell dateStr={vehicle.insurance_expiry} />
              </div>
              <div>
                <p className="text-xs text-text-muted">{t('veh.annual_insurance_cost')}</p>
                <p className="text-sm font-medium text-text-dark">{formatCurrency(vehicle.annual_insurance_cost)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">{t('veh.monthly_insurance')}</p>
                <p className="text-sm font-medium italic text-text-muted">
                  {monthlyIns !== null ? `= ${formatCurrency(monthlyIns)}` : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Monthly calculation section */}
          <div className="rounded-10 border p-4" style={{ backgroundColor: '#fffbeb', borderColor: '#fcd34d' }}>
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              {t('veh.section_financial')}
            </h4>
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-text-muted">
              <div className="text-center">
                <p className="font-medium text-text-dark text-sm">{formatCurrency(depPerMonth ?? 0)}</p>
                <p>{t('veh.deposit_per_month')}</p>
              </div>
              <span className="text-text-muted">+</span>
              <div className="text-center">
                <p className="font-medium text-text-dark text-sm">{formatCurrency(vehicle.received_installment ?? 0)}</p>
                <p>{t('veh.received_installment')}</p>
              </div>
              <span className="text-text-muted">−</span>
              <div className="text-center">
                <p className="font-medium text-text-dark text-sm">
                  {isLeasing ? formatCurrency(vehicle.lease_installment ?? 0) : '€0.00'}
                </p>
                <p>{t('veh.lease_installment')}</p>
              </div>
              <span className="text-text-muted">−</span>
              <div className="text-center">
                <p className="font-medium text-text-dark text-sm">{formatCurrency(monthlyIns ?? 0)}</p>
                <p>{t('veh.monthly_insurance')}</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 pt-3 mt-3 border-t border-amber-200">
              <span className="text-text-muted text-xs">=</span>
              <span className={`text-xl font-bold ${
                profitDiff === null ? 'text-text-muted' :
                profitDiff > 0 ? 'text-success' : 'text-danger'
              }`}>
                {profitDiff !== null ? formatCurrency(profitDiff) : '—'}
              </span>
              <span className="text-xs text-text-muted">{t('veh.profit_difference')}</span>
            </div>
          </div>

          {/* Scadenze section */}
          <div className="rounded-10 border p-4" style={{ backgroundColor: '#faf5ff', borderColor: '#d8b4fe' }}>
            <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              {t('veh.section_expiry')}
            </h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {[
                [t('veh.registration_expiry'), vehicle.registration_expiry],
                [t('veh.next_inspection'), vehicle.next_inspection],
              ].map(([label, date]) => (
                <div key={String(label)}>
                  <p className="text-xs text-text-muted">{label}</p>
                  <ExpiryCell dateStr={String(date ?? '')} />
                </div>
              ))}
            </div>
          </div>

          {/* Client section */}
          {vehicle.client && (
            <div className="rounded-10 border border-accent-soft p-4">
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                {t('veh.section_client')}
              </h4>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono bg-accent-soft text-primary px-2 py-0.5 rounded-full">
                  {vehicle.client.id}
                </span>
                <span className="font-medium text-sm">{clientDisplayName(vehicle.client)}</span>
              </div>
              {vehicle.client.email && <p className="text-xs text-text-muted">{vehicle.client.email}</p>}
              {vehicle.client.country && <p className="text-xs text-text-muted">{vehicle.client.country}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AddVehicleModal ──────────────────────────────────────────────────────────

interface AddVehicleModalProps {
  clients: Client[];
  leasingCompanies: string[];
  insuranceCompanies: string[];
  t: (key: string) => string;
  onClose: () => void;
  onSaved: () => void;
}

function AddVehicleModal({
  clients,
  leasingCompanies,
  insuranceCompanies,
  t,
  onClose,
  onSaved,
}: AddVehicleModalProps) {
  const [form, setForm] = useState<VehicleFormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof VehicleFormData, string>>>({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const errs: Partial<Record<keyof VehicleFormData, string>> = {};
    if (!form.registration_number.trim()) errs.registration_number = t('form.required');
    if (!form.current_km || isNaN(Number(form.current_km))) errs.current_km = t('form.required');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('vehicles').insert(buildPayload(form));
      if (error) throw error;
      toast.success(t('btn.save'));
      onSaved();
      onClose();
    } catch {
      toast.error(t('error.generic'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={t('vehicles.add_title')}
      maxWidth="max-w-2xl"
    >
      <VehicleFormContent
        form={form}
        setForm={setForm}
        errors={errors}
        isEdit={false}
        clients={clients}
        leasingCompanies={leasingCompanies}
        insuranceCompanies={insuranceCompanies}
        t={t}
      />
      <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-accent-soft">
        <button onClick={onClose} className="btn-secondary">{t('btn.cancel')}</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          {saving ? t('common.loading') : t('btn.save')}
        </button>
      </div>
    </Modal>
  );
}

// ─── Main Vehicles component ──────────────────────────────────────────────────

export default function Vehicles({ t }: VehiclesProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [leasingCompanies, setLeasingCompanies] = useState<string[]>([]);
  const [insuranceCompanies, setInsuranceCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter state
  const [search, setSearch] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [leasingFilter, setLeasingFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');

  // Sort state
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

  // Modal/drawer state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [detailVehicle, setDetailVehicle] = useState<Vehicle | null>(null);
  const [editVehicle, setEditVehicle] = useState<Vehicle | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vehiclesRes, clientsRes, leasingRes, insuranceRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select(`*, client:clients(id, company_name, company_name_additional, email, country)`)
          .order('registration_number', { ascending: true }),
        supabase
          .from('clients')
          .select('id, company_name, company_name_additional, email, country')
          .eq('is_client', true)
          .order('company_name_additional', { ascending: true }),
        supabase.from('vehicles').select('leasing_company').not('leasing_company', 'is', null),
        supabase.from('vehicles').select('insurance_company').not('insurance_company', 'is', null),
      ]);

      if (vehiclesRes.error) throw vehiclesRes.error;
      if (clientsRes.error) throw clientsRes.error;

      setVehicles((vehiclesRes.data as Vehicle[]) || []);
      setClients((clientsRes.data as Client[]) || []);
      setLeasingCompanies(
        [...new Set((leasingRes.data || []).map((v: { leasing_company: string }) => v.leasing_company).filter(Boolean))].sort()
      );
      setInsuranceCompanies(
        [...new Set((insuranceRes.data || []).map((v: { insurance_company: string }) => v.insurance_company).filter(Boolean))].sort()
      );
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Derived distinct values for dropdowns
  const distinctCountries = useMemo(
    () => [...new Set(vehicles.map(v => v.vehicle_country).filter(Boolean) as string[])].sort(),
    [vehicles]
  );
  const distinctInsurance = useMemo(
    () => [...new Set(vehicles.map(v => v.insurance_company).filter(Boolean) as string[])].sort(),
    [vehicles]
  );
  const distinctLeasing = useMemo(
    () => [...new Set(vehicles.map(v => v.leasing_company).filter(Boolean) as string[])].sort(),
    [vehicles]
  );

  const resetFilters = () => {
    setSearch('');
    setOwnershipFilter('all');
    setStatusFilter('all');
    setInsuranceFilter('');
    setLeasingFilter('');
    setCountryFilter('');
    setSortConfig(null);
  };

  const hasActiveFilters =
    search !== '' ||
    ownershipFilter !== 'all' ||
    statusFilter !== 'all' ||
    insuranceFilter !== '' ||
    leasingFilter !== '' ||
    countryFilter !== '';

  // Filtered + sorted vehicles
  const filtered = useMemo(() => {
    let result = vehicles.filter((v) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        v.registration_number.toLowerCase().includes(q) ||
        (v.vehicle_name ?? '').toLowerCase().includes(q) ||
        (v.client ? clientDisplayName(v.client) : '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
      const matchesOwnership = ownershipFilter === 'all' || v.ownership_status === ownershipFilter;
      const matchesInsurance = !insuranceFilter || v.insurance_company === insuranceFilter;
      const matchesLeasing = !leasingFilter || v.leasing_company === leasingFilter;
      const matchesCountry = !countryFilter || v.vehicle_country === countryFilter;
      return matchesSearch && matchesStatus && matchesOwnership && matchesInsurance && matchesLeasing && matchesCountry;
    });

    if (sortConfig) {
      result = [...result].sort((a, b) => {
        const aVal = getSortValue(a, sortConfig.key);
        const bVal = getSortValue(b, sortConfig.key);
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        let cmp = 0;
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          cmp = aVal.localeCompare(bVal);
        } else {
          cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        }
        return sortConfig.dir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [vehicles, search, statusFilter, ownershipFilter, insuranceFilter, leasingFilter, countryFilter, sortConfig]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success(t('btn.delete'));
      if (detailVehicle?.id === deleteId) setDetailVehicle(null);
      if (editVehicle?.id === deleteId) setEditVehicle(null);
      fetchData();
    } catch {
      toast.error(t('error.generic'));
    } finally {
      setDeleteId(null);
    }
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  };

  // Table style helpers
  const th = (_group: 'white' | 'green' | 'blue' | 'amber' | 'purple', _sticky?: 'left' | 'right') => {
    return 'text-xs font-medium text-text-muted uppercase tracking-wide px-3 py-2 whitespace-nowrap border-b border-accent-muted cursor-pointer select-none text-left';
  };

  const thStyle = (group: 'white' | 'green' | 'blue' | 'amber' | 'purple', extra?: React.CSSProperties): React.CSSProperties => {
    const bg = {
      white: 'white',
      green: 'var(--color-accent-soft)',
      blue: '#dbeafe',
      amber: '#fef3c7',
      purple: '#ede9fe',
    }[group];
    return { backgroundColor: bg, ...extra };
  };

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortConfig?.key !== colKey) return null;
    return sortConfig.dir === 'asc'
      ? <ChevronUp size={10} strokeWidth={2} className="inline ml-0.5" />
      : <ChevronDown size={10} strokeWidth={2} className="inline ml-0.5" />;
  };

  const td = 'px-3 text-xs text-text-dark whitespace-nowrap';
  const tdMuted = 'px-3 text-xs text-text-muted whitespace-nowrap italic';

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="page-title">{t('vehicles.title')}</h2>
        <button onClick={() => setAddModalOpen(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
          <Plus size={14} strokeWidth={2} />
          {t('btn.add_vehicle')}
        </button>
      </div>

      {/* Filter bar */}
      <div className="card px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('vehicles.search_placeholder')}
          />

          {/* Ownership pills */}
          <div className="flex gap-1 bg-bg border border-accent-muted rounded-10 p-1">
            {([
              { key: 'all' as OwnershipFilter, label: t('vehicles.filter_all') },
              { key: 'LEASING' as OwnershipFilter, label: 'Leasing' },
              { key: "PROPRIETA'" as OwnershipFilter, label: 'Proprietà' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setOwnershipFilter(key)}
                className={`px-3 py-1 rounded-10 text-xs font-medium transition-colors ${
                  ownershipFilter === key
                    ? key === 'LEASING'
                      ? 'bg-accent-soft text-primary'
                      : key === "PROPRIETA'"
                      ? 'text-[#1d4ed8]'
                      : 'bg-primary text-white'
                    : 'text-text-muted hover:text-text-dark hover:bg-accent-soft'
                }`}
                style={ownershipFilter === key && key === "PROPRIETA'" ? { backgroundColor: '#dbeafe' } : {}}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Status */}
          <select
            className="input-field !py-1.5 !px-2 text-xs w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">{t('vehicles.filter_all')}</option>
            <option value="active">{t('vehicles.filter_active')}</option>
            <option value="maintenance">{t('vehicles.filter_maintenance')}</option>
            <option value="returning">{t('vehicles.filter_returning')}</option>
          </select>

          {/* Insurance company */}
          {distinctInsurance.length > 0 && (
            <select
              className="input-field !py-1.5 !px-2 text-xs w-auto"
              value={insuranceFilter}
              onChange={(e) => setInsuranceFilter(e.target.value)}
            >
              <option value="">{t('veh.insurance_section')}: {t('vehicles.filter_all')}</option>
              {distinctInsurance.map(ins => (
                <option key={ins} value={ins}>{ins}</option>
              ))}
            </select>
          )}

          {/* Leasing company */}
          {distinctLeasing.length > 0 && (
            <select
              className="input-field !py-1.5 !px-2 text-xs w-auto"
              value={leasingFilter}
              onChange={(e) => setLeasingFilter(e.target.value)}
            >
              <option value="">{t('veh.section_leasing')}: {t('vehicles.filter_all')}</option>
              {distinctLeasing.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          )}

          {/* Country */}
          {distinctCountries.length > 0 && (
            <select
              className="input-field !py-1.5 !px-2 text-xs w-auto"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
            >
              <option value="">{t('veh.vehicle_country')}: {t('vehicles.filter_all')}</option>
              {distinctCountries.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          {/* Reset */}
          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-text-muted hover:text-danger transition-colors underline underline-offset-2"
            >
              {t('veh.reset_filters')}
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-11 rounded-10 bg-accent-soft/40 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Car size={40} strokeWidth={1} className="text-accent-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">{t('common.no_data')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: '1600px' }}>
              <thead>
                <tr>
                  {/* Targa – sticky left */}
                  <th
                    className={th('white', 'left')}
                    style={thStyle('white', { position: 'sticky', left: 0, zIndex: 3 })}
                    onClick={() => handleSort('registration_number')}
                  >
                    {t('vehicles.registration_number')} <SortIcon colKey="registration_number" />
                  </th>
                  {/* Veicolo */}
                  <th className={th('white')} style={thStyle('white')} onClick={() => handleSort('vehicle_name')}>
                    {t('vehicles.vehicle_name')} <SortIcon colKey="vehicle_name" />
                  </th>
                  {/* Stato */}
                  <th className={th('white')} style={thStyle('white')} onClick={() => handleSort('status')}>
                    {t('vehicles.status')} <SortIcon colKey="status" />
                  </th>
                  {/* Proprietà */}
                  <th className={th('white')} style={thStyle('white')} onClick={() => handleSort('ownership_status')}>
                    {t('veh.ownership_status')} <SortIcon colKey="ownership_status" />
                  </th>
                  {/* Leasing group */}
                  <th className={th('green')} style={thStyle('green')} onClick={() => handleSort('leasing_company')}>
                    {t('veh.leasing_company')} <SortIcon colKey="leasing_company" />
                  </th>
                  <th className={th('green')} style={thStyle('green')} onClick={() => handleSort('contract_number')}>
                    {t('veh.contract_number')} <SortIcon colKey="contract_number" />
                  </th>
                  <th className={th('green')} style={thStyle('green')} onClick={() => handleSort('lease_installment')}>
                    {t('veh.lease_installment')} <SortIcon colKey="lease_installment" />
                  </th>
                  <th className={th('green')} style={thStyle('green')} onClick={() => handleSort('received_installment')}>
                    {t('veh.received_installment')} <SortIcon colKey="received_installment" />
                  </th>
                  {/* Insurance group */}
                  <th className={th('blue')} style={thStyle('blue')} onClick={() => handleSort('insurance_company')}>
                    {t('veh.insurance_company')} <SortIcon colKey="insurance_company" />
                  </th>
                  <th className={th('blue')} style={thStyle('blue')} onClick={() => handleSort('insurance_expiry')}>
                    {t('veh.insurance_expiry')} <SortIcon colKey="insurance_expiry" />
                  </th>
                  <th className={th('blue')} style={thStyle('blue')} onClick={() => handleSort('monthly_insurance')}>
                    {t('veh.monthly_insurance')} <SortIcon colKey="monthly_insurance" />
                  </th>
                  {/* Financial group */}
                  <th className={th('amber')} style={thStyle('amber')} onClick={() => handleSort('deposit')}>
                    {t('veh.deposit')} <SortIcon colKey="deposit" />
                  </th>
                  <th className={th('amber')} style={thStyle('amber')} onClick={() => handleSort('lease_months')}>
                    {t('veh.lease_months')} <SortIcon colKey="lease_months" />
                  </th>
                  <th className={th('amber')} style={thStyle('amber')} onClick={() => handleSort('deposit_per_month')}>
                    {t('veh.deposit_per_month')} <SortIcon colKey="deposit_per_month" />
                  </th>
                  <th className={th('amber')} style={thStyle('amber')} onClick={() => handleSort('profit_difference')}>
                    {t('veh.profit_difference')} <SortIcon colKey="profit_difference" />
                  </th>
                  {/* Scadenze group */}
                  <th className={th('purple')} style={thStyle('purple')} onClick={() => handleSort('registration_expiry')}>
                    {t('veh.registration_expiry')} <SortIcon colKey="registration_expiry" />
                  </th>
                  <th className={th('purple')} style={thStyle('purple')} onClick={() => handleSort('next_inspection')}>
                    {t('veh.next_inspection')} <SortIcon colKey="next_inspection" />
                  </th>
                  <th className={th('purple')} style={thStyle('purple')} onClick={() => handleSort('client')}>
                    {t('vehicles.client')} <SortIcon colKey="client" />
                  </th>
                  {/* Actions – sticky right */}
                  <th
                    className={th('white', 'right')}
                    style={thStyle('white', { position: 'sticky', right: 0, zIndex: 3 })}
                  >
                    {t('vehicles.actions')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((v) => {
                  const isProprieta = v.ownership_status === "PROPRIETA'";
                  const stickyBg = isProprieta ? '#eff6ff' : 'white';
                  const rowBg = isProprieta ? '#f5f9ff' : undefined;

                  return (
                    <tr
                      key={v.id}
                      className="border-b border-accent-soft hover:brightness-[0.97] cursor-pointer transition-all"
                      style={{ height: '42px', backgroundColor: rowBg }}
                      onClick={() => setDetailVehicle(v)}
                    >
                      {/* Targa – sticky left */}
                      <td
                        className={`${td} font-mono font-bold text-primary`}
                        style={{ position: 'sticky', left: 0, zIndex: 1, backgroundColor: stickyBg }}
                      >
                        {v.registration_number}
                      </td>
                      {/* Veicolo */}
                      <td className={td}>{v.vehicle_name || <span className="text-text-muted">—</span>}</td>
                      {/* Stato */}
                      <td className={td}>
                        <Badge status={v.status ?? ''} t={(k) => t(k)} />
                      </td>
                      {/* Proprietà */}
                      <td className={td}>
                        <OwnershipBadge status={v.ownership_status} t={t} />
                      </td>
                      {/* Leasing */}
                      <td className={td}>{isProprieta ? <span className="text-text-muted">—</span> : (v.leasing_company || <span className="text-text-muted">—</span>)}</td>
                      <td className={td}>{isProprieta ? <span className="text-text-muted">—</span> : (v.contract_number || <span className="text-text-muted">—</span>)}</td>
                      <td className={td}>{isProprieta ? <span className="text-text-muted">—</span> : formatCurrency(v.lease_installment)}</td>
                      <td className={td}>{isProprieta ? <span className="text-text-muted">—</span> : formatCurrency(v.received_installment)}</td>
                      {/* Insurance */}
                      <td className={td}>{v.insurance_company || <span className="text-text-muted">—</span>}</td>
                      <td className={td}><ExpiryCell dateStr={v.insurance_expiry} /></td>
                      <td className={tdMuted}>{v.monthly_insurance !== null ? `= ${formatCurrency(v.monthly_insurance)}` : '—'}</td>
                      {/* Financial */}
                      <td className={td}>{isProprieta ? <span className="text-text-muted">—</span> : formatCurrency(v.deposit)}</td>
                      <td className={td}>{isProprieta ? <span className="text-text-muted">—</span> : (v.lease_months ?? <span className="text-text-muted">—</span>)}</td>
                      <td className={tdMuted}>{v.deposit_per_month !== null ? `= ${formatCurrency(v.deposit_per_month)}` : '—'}</td>
                      <td className={td}><ProfitCell value={v.profit_difference} /></td>
                      {/* Scadenze */}
                      <td className={td}><ExpiryCell dateStr={v.registration_expiry} /></td>
                      <td className={td}><ExpiryCell dateStr={v.next_inspection} /></td>
                      <td className={td}>
                        {v.client ? (
                          <span>{clientDisplayName(v.client)}</span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      {/* Actions – sticky right */}
                      <td
                        className={td}
                        style={{ position: 'sticky', right: 0, zIndex: 1, backgroundColor: stickyBg }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setDetailVehicle(v)}
                            className="text-text-muted hover:text-primary transition-colors"
                            title={t('veh.detail_title')}
                          >
                            <Info size={14} strokeWidth={1.8} />
                          </button>
                          <button
                            onClick={() => setEditVehicle(v)}
                            className="text-text-muted hover:text-primary transition-colors"
                            title={t('btn.edit')}
                          >
                            <Pencil size={14} strokeWidth={1.8} />
                          </button>
                          <button
                            onClick={() => setDeleteId(v.id)}
                            className="text-text-muted hover:text-danger transition-colors"
                            title={t('btn.delete')}
                          >
                            <Trash2 size={14} strokeWidth={1.8} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Vehicle Detail Modal */}
      {detailVehicle && (
        <VehicleDetailModal
          vehicle={detailVehicle}
          t={t}
          onClose={() => setDetailVehicle(null)}
          onEdit={() => {
            setEditVehicle(detailVehicle);
            setDetailVehicle(null);
          }}
        />
      )}

      {/* Vehicle Edit Drawer */}
      {editVehicle && (
        <VehicleEditDrawer
          key={editVehicle.id}
          vehicle={editVehicle}
          clients={clients}
          leasingCompanies={leasingCompanies}
          insuranceCompanies={insuranceCompanies}
          t={t}
          onClose={() => setEditVehicle(null)}
          onSaved={fetchData}
          onDelete={(id) => { setEditVehicle(null); setDeleteId(id); }}
        />
      )}

      {/* Add Vehicle Modal */}
      {addModalOpen && (
        <AddVehicleModal
          clients={clients}
          leasingCompanies={leasingCompanies}
          insuranceCompanies={insuranceCompanies}
          t={t}
          onClose={() => setAddModalOpen(false)}
          onSaved={fetchData}
        />
      )}

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        message={t('vehicles.confirm_delete')}
        t={t}
      />
    </div>
  );
}
