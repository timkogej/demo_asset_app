import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Car, Plus, Pencil, Trash2, AlertCircle, Clock, TrendingUp, TrendingDown,
  AlertTriangle, X,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SearchInput from '../components/ui/SearchInput';
import Combobox from '../components/ui/Combobox';
import type { Vehicle, Client, Language } from '../types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface VehiclesProps {
  t: (key: string) => string;
  language: Language;
}

// ─── Local types ─────────────────────────────────────────────────────────────

type StatusFilter = 'all' | 'active' | 'maintenance' | 'returning';
type OwnershipFilter = 'all' | 'LEASING' | "PROPRIETA'";
type DrawerTab = 'details' | 'edit';
type PlateEditMode = 'readonly' | 'confirming' | 'editing';

interface VehicleFormData {
  plate: string;
  make: string;
  model: string;
  year: string;
  current_km: string;
  status: 'active' | 'maintenance' | 'returning';
  client_id: string;
  lease_start_date: string;
  lease_end_date: string;
  monthly_rate: string;
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

// ─── Constants ───────────────────────────────────────────────────────────────

const emptyForm: VehicleFormData = {
  plate: '',
  make: '',
  model: '',
  year: '',
  current_km: '',
  status: 'active',
  client_id: '',
  lease_start_date: '',
  lease_end_date: '',
  monthly_rate: '',
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function vehicleToForm(v: Vehicle): VehicleFormData {
  return {
    plate: v.plate,
    make: v.make,
    model: v.model,
    year: v.year?.toString() ?? '',
    current_km: v.current_km.toString(),
    status: v.status,
    client_id: v.client_id ?? '',
    lease_start_date: v.lease_start_date ?? '',
    lease_end_date: v.lease_end_date ?? '',
    monthly_rate: v.monthly_rate.toString(),
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
    plate: form.plate.trim().toUpperCase(),
    make: form.make.trim(),
    model: form.model.trim(),
    year: form.year ? parseInt(form.year) : null,
    current_km: parseInt(form.current_km) || 0,
    status: form.status,
    client_id: form.client_id || null,
    lease_start_date: form.lease_start_date || null,
    lease_end_date: form.lease_end_date || null,
    monthly_rate: parseFloat(form.monthly_rate) || 0,
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

// ─── Inline display components ────────────────────────────────────────────────

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
  plateEditMode?: PlateEditMode;
  setPlateEditMode?: (m: PlateEditMode) => void;
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
  plateEditMode,
  setPlateEditMode,
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
          {/* Plate */}
          <div className="col-span-2">
            <label className="label">{t('vehicles.plate')} *</label>
            {isEdit && plateEditMode !== 'editing' ? (
              <>
                {plateEditMode === 'confirming' && (
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
                          onClick={() => setPlateEditMode?.('editing')}
                        >
                          {t('veh.yes_edit')}
                        </button>
                        <button
                          type="button"
                          className="text-xs px-2 py-1 rounded border border-amber-400 text-amber-800 hover:bg-amber-50"
                          onClick={() => setPlateEditMode?.('readonly')}
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
                    value={form.plate}
                    readOnly
                  />
                  <button
                    type="button"
                    className="p-2 text-text-muted hover:text-primary transition-colors rounded-10 hover:bg-accent-soft border border-accent-muted"
                    onClick={() => setPlateEditMode?.('confirming')}
                    title={t('btn.edit')}
                  >
                    <Pencil size={14} strokeWidth={1.8} />
                  </button>
                </div>
              </>
            ) : (
              <input
                className="input-field font-mono"
                value={form.plate}
                onChange={upd('plate')}
                placeholder="AB 123 CD"
              />
            )}
            {errors.plate && <p className="error-text">{errors.plate}</p>}
          </div>

          <div>
            <label className="label">{t('vehicles.make')} *</label>
            <input className="input-field" value={form.make} onChange={upd('make')} placeholder="BMW" />
            {errors.make && <p className="error-text">{errors.make}</p>}
          </div>
          <div>
            <label className="label">{t('vehicles.model')} *</label>
            <input className="input-field" value={form.model} onChange={upd('model')} placeholder="320d" />
            {errors.model && <p className="error-text">{errors.model}</p>}
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
          <div>
            <label className="label">{t('veh.monthly_rate')} (€)</label>
            <input type="number" className="input-field" value={form.monthly_rate} onChange={upd('monthly_rate')} placeholder="650.00" min="0" step="0.01" />
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
                [{c.id}] {c.company_name}
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

// ─── VehicleDrawer ────────────────────────────────────────────────────────────

interface VehicleDrawerProps {
  vehicle: Vehicle;
  initialTab?: DrawerTab;
  clients: Client[];
  leasingCompanies: string[];
  insuranceCompanies: string[];
  t: (key: string) => string;
  onClose: () => void;
  onSaved: () => void;
  onDelete: (id: string) => void;
}

function VehicleDrawer({
  vehicle,
  initialTab = 'details',
  clients,
  leasingCompanies,
  insuranceCompanies,
  t,
  onClose,
  onSaved,
  onDelete,
}: VehicleDrawerProps) {
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const [form, setForm] = useState<VehicleFormData>(() => vehicleToForm(vehicle));
  const [plateEditMode, setPlateEditMode] = useState<PlateEditMode>('readonly');
  const [errors, setErrors] = useState<Partial<Record<keyof VehicleFormData, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(vehicleToForm(vehicle));
    setPlateEditMode('readonly');
    setErrors({});
    setTab('details');
  }, [vehicle]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const validate = () => {
    const errs: Partial<Record<keyof VehicleFormData, string>> = {};
    if (!form.plate.trim()) errs.plate = t('form.required');
    if (!form.make.trim()) errs.make = t('form.required');
    if (!form.model.trim()) errs.model = t('form.required');
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

  const isLeasing = vehicle.ownership_status === 'LEASING';
  const { depPerMonth, monthlyIns, profitDiff } = useMemo(
    () => computeValues(vehicleToForm(vehicle)),
    [vehicle]
  );

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="animate-slideInRight relative w-[420px] h-full bg-surface shadow-xl flex flex-col border-l border-accent-muted">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-accent-soft shrink-0">
          <div>
            <p className="font-mono font-bold text-primary text-lg leading-none">{vehicle.plate}</p>
            <p className="text-sm text-text-muted mt-0.5">{vehicle.make} {vehicle.model}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDelete(vehicle.id)}
              className="p-1.5 text-text-muted hover:text-danger transition-colors"
              title={t('btn.delete')}
            >
              <Trash2 size={16} strokeWidth={1.8} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-text-muted hover:text-text-dark transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-accent-soft shrink-0">
          {(['details', 'edit'] as const).map((t_key) => (
            <button
              key={t_key}
              onClick={() => setTab(t_key)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t_key
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-text-muted hover:text-text-dark'
              }`}
            >
              {t_key === 'details' ? t('veh.details_tab') : t('veh.edit_tab')}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'details' ? (
            <div className="p-5 space-y-5">
              {/* Veicolo */}
              <section>
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {t('veh.section_vehicle')}
                </h4>
                <div className="space-y-2">
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono font-bold text-xl text-primary">{vehicle.plate}</span>
                    <span className="text-text-muted text-sm">{vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge status={vehicle.status} t={(k) => t(k)} />
                    <OwnershipBadge status={vehicle.ownership_status} t={t} />
                    {vehicle.vehicle_country && (
                      <span className="text-xs text-text-muted bg-bg border border-accent-muted px-2 py-0.5 rounded-full">
                        {vehicle.vehicle_country}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-text-muted">
                    {vehicle.current_km.toLocaleString('it-IT')} km
                    {vehicle.year ? ` · ${vehicle.year}` : ''}
                  </p>
                </div>
              </section>

              {/* Leasing */}
              {isLeasing && (
                <section>
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                    {t('veh.section_leasing')}
                  </h4>
                  <div className="rounded-10 border border-accent-muted p-3 space-y-2 bg-accent-soft/30">
                    {[
                      [t('veh.leasing_company'), vehicle.leasing_company],
                      [t('veh.contract_number'), vehicle.contract_number],
                      [t('veh.lease_installment'), formatCurrency(vehicle.lease_installment)],
                      [t('veh.received_installment'), formatCurrency(vehicle.received_installment)],
                      [t('veh.lease_months'), vehicle.lease_months ? `${vehicle.lease_months} mesi` : '—'],
                      [t('veh.deposit'), formatCurrency(vehicle.deposit)],
                      [t('veh.deposit_per_month'), depPerMonth !== null ? <span className="italic text-text-muted">= {formatCurrency(depPerMonth)}</span> : '—'],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="flex justify-between text-sm">
                        <span className="text-text-muted">{label}</span>
                        <span className="font-medium text-right">{value || '—'}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Assicurazione */}
              <section>
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {t('veh.insurance_section')}
                </h4>
                <div className="rounded-10 border p-3 space-y-2" style={{ backgroundColor: '#f0f9ff', borderColor: '#bfdbfe' }}>
                  {[
                    [t('veh.insurance_company'), vehicle.insurance_company],
                    [t('veh.insurance_expiry'), <ExpiryCell key="ins" dateStr={vehicle.insurance_expiry} />],
                    [t('veh.annual_insurance_cost'), formatCurrency(vehicle.annual_insurance_cost)],
                    [t('veh.monthly_insurance'), monthlyIns !== null ? <span className="italic text-text-muted">= {formatCurrency(monthlyIns)}</span> : '—'],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between text-sm">
                      <span className="text-text-muted">{label}</span>
                      <span className="font-medium">{value || '—'}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Margine mensile */}
              <section>
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {t('veh.profit_difference')}
                </h4>
                <div className="rounded-10 border border-accent-muted p-3 bg-bg">
                  <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-text-muted mb-3">
                    <div className="text-center">
                      <p className="font-medium text-text-dark">{formatCurrency(depPerMonth ?? 0)}</p>
                      <p>{t('veh.deposit_per_month')}</p>
                    </div>
                    <span>+</span>
                    <div className="text-center">
                      <p className="font-medium text-text-dark">{formatCurrency(vehicle.received_installment ?? 0)}</p>
                      <p>{t('veh.received_installment')}</p>
                    </div>
                    <span>−</span>
                    <div className="text-center">
                      <p className="font-medium text-text-dark">{isLeasing ? formatCurrency(vehicle.lease_installment ?? 0) : '€0.00'}</p>
                      <p>{t('veh.lease_installment')}</p>
                    </div>
                    <span>−</span>
                    <div className="text-center">
                      <p className="font-medium text-text-dark">{formatCurrency(monthlyIns ?? 0)}</p>
                      <p>{t('veh.monthly_insurance')}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-2 border-t border-accent-soft">
                    <span className="text-text-muted text-xs">=</span>
                    <span className={`text-lg font-bold ${
                      profitDiff === null ? 'text-text-muted' :
                      profitDiff > 0 ? 'text-success' : 'text-danger'
                    }`}>
                      {profitDiff !== null ? formatCurrency(profitDiff) : '—'}
                    </span>
                  </div>
                </div>
              </section>

              {/* Scadenze */}
              <section>
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {t('veh.section_expiry')}
                </h4>
                <div className="space-y-2">
                  {[
                    [t('veh.registration_expiry'), vehicle.registration_expiry],
                    [t('veh.next_inspection'), vehicle.next_inspection],
                    [t('veh.insurance_expiry'), vehicle.insurance_expiry],
                  ].map(([label, date]) => (
                    <div key={String(label)} className="flex justify-between text-sm">
                      <span className="text-text-muted">{label}</span>
                      <ExpiryCell dateStr={String(date ?? '')} />
                    </div>
                  ))}
                </div>
              </section>

              {/* Cliente */}
              {vehicle.client && (
                <section>
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                    {t('veh.section_client')}
                  </h4>
                  <div className="rounded-10 border border-accent-soft p-3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-accent-soft text-primary px-2 py-0.5 rounded-full">
                        {vehicle.client.id}
                      </span>
                      <span className="font-medium text-sm">{vehicle.client.company_name}</span>
                    </div>
                    <p className="text-xs text-text-muted">{vehicle.client.email}</p>
                    <p className="text-xs text-text-muted">{vehicle.client.country}</p>
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="p-5">
              <VehicleFormContent
                form={form}
                setForm={setForm}
                errors={errors}
                isEdit={true}
                plateEditMode={plateEditMode}
                setPlateEditMode={setPlateEditMode}
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
    if (!form.plate.trim()) errs.plate = t('form.required');
    if (!form.make.trim()) errs.make = t('form.required');
    if (!form.model.trim()) errs.model = t('form.required');
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<OwnershipFilter>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [drawerVehicle, setDrawerVehicle] = useState<Vehicle | null>(null);
  const [drawerInitialTab, setDrawerInitialTab] = useState<DrawerTab>('details');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vehiclesRes, clientsRes, leasingRes, insuranceRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select(`*, client:clients(id, company_name, email, country)`)
          .order('created_at', { ascending: false }),
        supabase.from('clients').select('*').eq('is_client', true).order('company_name'),
        supabase.from('vehicles').select('leasing_company').not('leasing_company', 'is', null),
        supabase.from('vehicles').select('insurance_company').not('insurance_company', 'is', null),
      ]);

      if (vehiclesRes.error) throw vehiclesRes.error;
      if (clientsRes.error) throw clientsRes.error;

      setVehicles((vehiclesRes.data as Vehicle[]) || []);
      setClients((clientsRes.data as Client[]) || []);
      setLeasingCompanies(
        [...new Set((leasingRes.data || []).map((v: { leasing_company: string }) => v.leasing_company).filter(Boolean))]
      );
      setInsuranceCompanies(
        [...new Set((insuranceRes.data || []).map((v: { insurance_company: string }) => v.insurance_company).filter(Boolean))]
      );
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filtered = vehicles.filter((v) => {
    const matchesSearch =
      search === '' ||
      v.plate.toLowerCase().includes(search.toLowerCase()) ||
      v.make.toLowerCase().includes(search.toLowerCase()) ||
      v.model.toLowerCase().includes(search.toLowerCase()) ||
      (v.client?.company_name || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
    const matchesOwnership = ownershipFilter === 'all' || v.ownership_status === ownershipFilter;
    return matchesSearch && matchesStatus && matchesOwnership;
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success(t('btn.delete'));
      if (drawerVehicle?.id === deleteId) setDrawerVehicle(null);
      fetchData();
    } catch {
      toast.error(t('error.generic'));
    } finally {
      setDeleteId(null);
    }
  };

  const openDrawer = (vehicle: Vehicle, tab: DrawerTab = 'details') => {
    setDrawerInitialTab(tab);
    setDrawerVehicle(vehicle);
  };

  // Column group header style helpers
  const grpVehicle = { backgroundColor: 'white' };
  const grpLeasing = { backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-primary)' };
  const grpInsurance = { backgroundColor: '#dbeafe', color: '#1e40af' };
  const grpFinancial = { backgroundColor: '#fef3c7', color: '#92400e' };
  const grpExpiry = { backgroundColor: '#ede9fe', color: '#5b21b6' };

  const thGrp = 'text-xs font-semibold uppercase tracking-wider px-3 py-2 text-center border-b border-accent-muted';
  const thCol = 'text-xs font-semibold text-text-muted uppercase tracking-wider px-3 py-2 text-left bg-bg whitespace-nowrap';
  const td = 'px-3 text-xs text-text-dark whitespace-nowrap';
  const tdMuted = 'px-3 text-xs text-text-muted whitespace-nowrap italic';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="page-title">{t('vehicles.title')}</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('vehicles.search_placeholder')}
          />

          {/* Ownership filter */}
          <div className="flex gap-1 bg-bg border border-accent-muted rounded-10 p-1">
            {([
              { key: 'all' as OwnershipFilter, label: t('vehicles.filter_all') },
              { key: 'LEASING' as OwnershipFilter, label: 'Leasing' },
              { key: "PROPRIETA'" as OwnershipFilter, label: 'Proprietà' },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setOwnershipFilter(key)}
                className={`px-3 py-1 rounded-10 text-xs font-medium transition-colors duration-150 ${
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

          {/* Status filter */}
          <select
            className="input-field !py-1.5 !px-2 text-xs w-auto"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">{t('vehicles.filter_all')}</option>
            <option value="active">{t('vehicles.filter_active')}</option>
            <option value="maintenance">{t('vehicles.filter_maintenance')}</option>
            <option value="returning">{t('vehicles.filter_returning')}</option>
          </select>

          <button onClick={() => setAddModalOpen(true)} className="btn-primary flex items-center gap-2 whitespace-nowrap">
            <Plus size={14} strokeWidth={2} />
            {t('btn.add_vehicle')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(3)].map((_, i) => (
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
            <table className="w-full border-collapse" style={{ minWidth: '1400px' }}>
              {/* Column group headers */}
              <thead>
                <tr>
                  <th colSpan={5} className={thGrp} style={grpVehicle}>{t('veh.section_vehicle')}</th>
                  <th colSpan={4} className={thGrp} style={grpLeasing}>{t('veh.section_leasing')}</th>
                  <th colSpan={4} className={thGrp} style={grpInsurance}>{t('veh.insurance_section')}</th>
                  <th colSpan={4} className={thGrp} style={grpFinancial}>{t('veh.section_financial')}</th>
                  <th colSpan={3} className={thGrp} style={grpExpiry}>{t('veh.section_expiry')}</th>
                  <th className={thGrp} style={grpVehicle}></th>
                </tr>
                <tr>
                  {/* Veicolo */}
                  <th className={thCol} style={{ position: 'sticky', left: 0, zIndex: 2, backgroundColor: 'var(--color-bg)' }}>
                    {t('vehicles.plate')}
                  </th>
                  <th className={thCol} style={{ position: 'sticky', left: 96, zIndex: 2, backgroundColor: 'var(--color-bg)' }}>
                    {t('vehicles.make')}/{t('vehicles.model')}
                  </th>
                  <th className={thCol}>{t('vehicles.year')}/{t('vehicles.current_km')}</th>
                  <th className={thCol}>{t('vehicles.status')}</th>
                  <th className={thCol}>{t('veh.ownership_status')}</th>
                  {/* Leasing */}
                  <th className={thCol}>{t('veh.leasing_company')}</th>
                  <th className={thCol}>{t('veh.contract_number')}</th>
                  <th className={thCol}>{t('veh.lease_installment')} (€)</th>
                  <th className={thCol}>{t('veh.received_installment')} (€)</th>
                  {/* Insurance */}
                  <th className={thCol}>{t('veh.insurance_company')}</th>
                  <th className={thCol}>{t('veh.insurance_expiry')}</th>
                  <th className={thCol}>{t('veh.annual_insurance_cost')} (€)</th>
                  <th className={thCol}>{t('veh.monthly_insurance')} (€)</th>
                  {/* Financial */}
                  <th className={thCol}>{t('veh.deposit')} (€)</th>
                  <th className={thCol}>{t('veh.lease_months')}</th>
                  <th className={thCol}>{t('veh.deposit_per_month')} (€)</th>
                  <th className={thCol}>{t('veh.profit_difference')} (€)</th>
                  {/* Scadenze */}
                  <th className={thCol}>{t('veh.registration_expiry')}</th>
                  <th className={thCol}>{t('veh.next_inspection')}</th>
                  <th className={thCol}>{t('vehicles.client')}</th>
                  {/* Actions */}
                  <th
                    className={thCol}
                    style={{ position: 'sticky', right: 0, zIndex: 2, backgroundColor: 'var(--color-bg)' }}
                  >
                    {t('vehicles.actions')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((v) => {
                  const isProprieta = v.ownership_status === "PROPRIETA'";
                  const rowBg = isProprieta ? '#f0f9ff' : undefined;
                  const stickyBg = isProprieta ? '#f0f9ff' : 'white';
                  const { depPerMonth: dp, monthlyIns: mi } = computeValues(vehicleToForm(v));

                  return (
                    <tr
                      key={v.id}
                      className="border-b border-accent-soft hover:brightness-95 cursor-pointer transition-all"
                      style={{ height: '44px', backgroundColor: rowBg }}
                      onClick={() => openDrawer(v, 'details')}
                    >
                      {/* Plate – sticky */}
                      <td
                        className={`${td} font-mono font-bold text-primary`}
                        style={{ position: 'sticky', left: 0, zIndex: 1, backgroundColor: stickyBg }}
                      >
                        {v.plate}
                      </td>
                      {/* Make/Model – sticky */}
                      <td
                        className={td}
                        style={{ position: 'sticky', left: 96, zIndex: 1, backgroundColor: stickyBg }}
                      >
                        <span className="font-medium">{v.make}</span>
                        <span className="text-text-muted ml-1">{v.model}</span>
                      </td>
                      {/* Anno/KM */}
                      <td className={td}>
                        {v.year || '—'} · {v.current_km.toLocaleString('it-IT')} km
                      </td>
                      {/* Status */}
                      <td className={td}>
                        <Badge status={v.status} t={(k) => t(k)} />
                      </td>
                      {/* Ownership */}
                      <td className={td}>
                        <OwnershipBadge status={v.ownership_status} t={t} />
                      </td>

                      {/* Leasing group */}
                      <td className={td}>{isProprieta ? <span className="text-text-muted">—</span> : (v.leasing_company || <span className="text-text-muted">—</span>)}</td>
                      <td className={td}>{isProprieta ? <span className="text-text-muted">—</span> : (v.contract_number || <span className="text-text-muted">—</span>)}</td>
                      <td className={td}>{isProprieta ? <span className="text-text-muted">—</span> : formatCurrency(v.lease_installment)}</td>
                      <td className={td}>{isProprieta ? <span className="text-text-muted">—</span> : formatCurrency(v.received_installment)}</td>

                      {/* Insurance group */}
                      <td className={td}>{v.insurance_company || <span className="text-text-muted">—</span>}</td>
                      <td className={td}><ExpiryCell dateStr={v.insurance_expiry} /></td>
                      <td className={td}>{formatCurrency(v.annual_insurance_cost)}</td>
                      <td className={tdMuted}>{mi !== null ? `= ${formatCurrency(mi)}` : '—'}</td>

                      {/* Financial group */}
                      <td className={td}>{isProprieta ? <span className="text-text-muted">—</span> : formatCurrency(v.deposit)}</td>
                      <td className={td}>{isProprieta ? <span className="text-text-muted">—</span> : (v.lease_months || '—')}</td>
                      <td className={tdMuted}>{dp !== null ? `= ${formatCurrency(dp)}` : '—'}</td>
                      <td className={td}>
                        <ProfitCell value={v.profit_difference} />
                      </td>

                      {/* Scadenze group */}
                      <td className={td}><ExpiryCell dateStr={v.registration_expiry} /></td>
                      <td className={td}><ExpiryCell dateStr={v.next_inspection} /></td>
                      <td className={td}>
                        {v.client ? (
                          <span className="text-text-dark">{v.client.company_name}</span>
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
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openDrawer(v, 'edit')}
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

      {/* Drawer */}
      {drawerVehicle && (
        <VehicleDrawer
          key={`${drawerVehicle.id}-${drawerInitialTab}`}
          vehicle={drawerVehicle}
          initialTab={drawerInitialTab}
          clients={clients}
          leasingCompanies={leasingCompanies}
          insuranceCompanies={insuranceCompanies}
          t={t}
          onClose={() => setDrawerVehicle(null)}
          onSaved={fetchData}
          onDelete={(id) => { setDrawerVehicle(null); setDeleteId(id); }}
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
