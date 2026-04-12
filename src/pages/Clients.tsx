import { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Plus, Pencil, Trash2, Mail, Phone, Lock, X, ChevronDown, Car } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import Modal from '../components/ui/Modal';
import SearchInput from '../components/ui/SearchInput';
import { isValidClientId, formatClientId } from '../lib/utils';
import { clientDisplayName, countryFlag } from '../lib/clientHelpers';
import { formatCurrency } from '../lib/invoiceCalculations';
import type { Client, Language } from '../types';

const COUNTRY_OPTIONS = ['SI', 'IT', 'HR', 'DE', 'RO', 'AT', 'HU', 'FR', 'ES', 'NL', 'BE', 'PL'];

interface ClientsProps {
  t: (key: string) => string;
  language: Language;
}

type IsClientFilter = 'all' | 'clients' | 'others';
type DrawerTab = 'details' | 'edit';

interface ClientFormData {
  id: string;
  company_name: string;
  company_name_additional: string;
  is_client: boolean;
  email: string;
  phone: string;
  address: string;
  postal_code: string;
  city: string;
  country: string;
  iban: string;
  bic: string;
  registration_number: string;
  tax_number: string;
  is_vat_payer: boolean;
  comment: string;
}

interface FormErrors {
  id?: string;
  email?: string;
  iban?: string;
}

const emptyForm: ClientFormData = {
  id: '',
  company_name: '',
  company_name_additional: '',
  is_client: true,
  email: '',
  phone: '',
  address: '',
  postal_code: '',
  city: '',
  country: 'SI',
  iban: '',
  bic: '',
  registration_number: '',
  tax_number: '',
  is_vat_payer: false,
  comment: '',
};

function clientToForm(client: Client): ClientFormData {
  return {
    id: client.id,
    company_name: client.company_name || '',
    company_name_additional: client.company_name_additional || '',
    is_client: client.is_client,
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    postal_code: client.postal_code || '',
    city: client.city || '',
    country: client.country || 'SI',
    iban: client.iban || '',
    bic: client.bic || '',
    registration_number: client.registration_number || '',
    tax_number: client.tax_number || '',
    is_vat_payer: client.is_vat_payer,
    comment: client.comment || '',
  };
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────
function Toggle({ value, onChange, color = 'green' }: { value: boolean; onChange: (v: boolean) => void; color?: 'green' | 'blue' }) {
  const bg = value
    ? color === 'blue' ? 'bg-blue-600' : 'bg-primary'
    : 'bg-accent-muted';
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${bg}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${value ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────
function IsClientBadge({ value, t }: { value: boolean; t: (k: string) => string }) {
  if (value) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-success)' }}>
        {t('cli.yes')}
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
      {t('cli.no')}
    </span>
  );
}

function VatBadge({ value, t }: { value: boolean; t: (k: string) => string }) {
  if (value) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>
        {t('cli.vat_yes')}
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: '#f3f4f6', color: 'var(--color-text-muted)' }}>
      {t('cli.vat_no')}
    </span>
  );
}

// ─── Country Select ───────────────────────────────────────────────────────────
function CountrySelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <select className={className ?? 'input-field'} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {COUNTRY_OPTIONS.map((c) => (
        <option key={c} value={c}>{countryFlag(c)} {c}</option>
      ))}
      <option value="OTHER">Altro / Drugo</option>
    </select>
  );
}

// ─── Client Form Sections ─────────────────────────────────────────────────────
interface FormSectionProps {
  form: ClientFormData;
  setForm: React.Dispatch<React.SetStateAction<ClientFormData>>;
  errors: FormErrors;
  isNew?: boolean;
  idChecking?: boolean;
  onIdBlur?: () => void;
  t: (k: string) => string;
}

function ClientFormContent({ form, setForm, errors, isNew, idChecking, onIdBlur, t }: FormSectionProps) {
  const upd = <K extends keyof ClientFormData>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="space-y-6">
      {/* Section: General */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{t('cli.section_general')}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ID */}
          <div>
            <label className="label">{t('cli.id')} {isNew && '*'}</label>
            <div className="relative">
              <input
                className="input-field font-mono"
                value={form.id}
                disabled={!isNew}
                onChange={(e) => setForm((f) => ({ ...f, id: formatClientId(e.target.value) }))}
                onBlur={onIdBlur}
                placeholder="CLI001"
                maxLength={12}
              />
              {!isNew && (
                <Lock size={13} strokeWidth={1.8} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
              )}
            </div>
            {idChecking && <p className="text-xs text-text-muted mt-1">Checking...</p>}
            {errors.id && <p className="error-text">{errors.id}</p>}
            {!errors.id && isNew && <p className="text-xs text-text-muted mt-1">{t('cli.id_hint')}</p>}
          </div>
          {/* Country */}
          <div>
            <label className="label">{t('cli.country')}</label>
            <CountrySelect value={form.country} onChange={(v) => setForm((f) => ({ ...f, country: v }))} />
          </div>
          {/* company_name_additional (primary display name) */}
          <div>
            <label className="label">{t('cli.company_name_additional')}</label>
            <input className="input-field" value={form.company_name_additional} onChange={upd('company_name_additional')} placeholder="Naziv podjetja / Ragione sociale" />
          </div>
          {/* company_name (secondary) */}
          <div>
            <label className="label">{t('cli.company_name')}</label>
            <input className="input-field" value={form.company_name} onChange={upd('company_name')} placeholder="Filiale / Naziv 2" />
          </div>
          {/* is_client toggle */}
          <div className="flex items-center gap-3">
            <Toggle value={form.is_client} onChange={(v) => setForm((f) => ({ ...f, is_client: v }))} />
            <label className="label mb-0 cursor-pointer" onClick={() => setForm((f) => ({ ...f, is_client: !f.is_client }))}>
              {t('cli.is_client')}
            </label>
          </div>
          {/* is_vat_payer toggle */}
          <div className="flex items-center gap-3">
            <Toggle value={form.is_vat_payer} onChange={(v) => setForm((f) => ({ ...f, is_vat_payer: v }))} color="blue" />
            <label className="label mb-0 cursor-pointer" onClick={() => setForm((f) => ({ ...f, is_vat_payer: !f.is_vat_payer }))}>
              {t('cli.is_vat_payer')}
            </label>
          </div>
          {/* Comment */}
          <div className="md:col-span-2">
            <label className="label">{t('cli.comment')}</label>
            <textarea className="input-field resize-none w-full" rows={3} value={form.comment} onChange={upd('comment')} />
          </div>
        </div>
      </div>

      {/* Section: Contacts */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Contatti / Kontakt</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">{t('cli.email')}</label>
            <input type="email" className="input-field" value={form.email} onChange={upd('email')} placeholder="info@example.com" />
            {errors.email && <p className="error-text">{errors.email}</p>}
          </div>
          <div>
            <label className="label">{t('cli.phone')}</label>
            <input type="tel" className="input-field" value={form.phone} onChange={upd('phone')} placeholder="+386 1 234 5678" />
          </div>
        </div>
      </div>

      {/* Section: Address */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{t('cli.section_address')}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label">{t('cli.address')}</label>
            <input className="input-field" value={form.address} onChange={upd('address')} placeholder="Via Roma 12" />
          </div>
          <div style={{ flex: '0 0 30%' }}>
            <label className="label">{t('cli.postal_code')}</label>
            <input className="input-field" value={form.postal_code} onChange={upd('postal_code')} placeholder="20121" />
          </div>
          <div>
            <label className="label">{t('cli.city')}</label>
            <input className="input-field" value={form.city} onChange={upd('city')} placeholder="Milano" />
          </div>
        </div>
      </div>

      {/* Section: Fiscal */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{t('cli.section_fiscal')}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">{t('cli.tax_number')}</label>
            <input className="input-field" value={form.tax_number} onChange={upd('tax_number')} placeholder="IT12345678901" />
          </div>
          <div>
            <label className="label">{t('cli.registration_number')}</label>
            <input className="input-field" value={form.registration_number} onChange={upd('registration_number')} placeholder="MI-1234567" />
          </div>
        </div>
      </div>

      {/* Section: Financial */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{t('cli.section_financial')}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">{t('cli.iban')}</label>
            <input className="input-field font-mono" value={form.iban} onChange={upd('iban')} placeholder="SI56 0000 0000 0000 000" />
            {errors.iban && <p className="error-text">{errors.iban}</p>}
          </div>
          <div>
            <label className="label">{t('cli.bic')}</label>
            <input className="input-field font-mono" value={form.bic} onChange={upd('bic')} placeholder="BAKOSI2X" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
interface DrawerProps {
  client: Client;
  tab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  onClose: () => void;
  onSaved: () => void;
  t: (k: string) => string;
}

function ClientDrawer({ client, tab, onTabChange, onClose, onSaved, t }: DrawerProps) {
  const [form, setForm] = useState<ClientFormData>(() => clientToForm(client));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(clientToForm(client));
    setErrors({});
  }, [client]);

  // Escape key
  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = t('form.invalid_email');
    if (form.iban && form.iban.length < 15) errs.iban = t('form.invalid_amount');
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          company_name: form.company_name.trim() || null,
          company_name_additional: form.company_name_additional.trim() || null,
          is_client: form.is_client,
          email: form.email.trim().toLowerCase() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          postal_code: form.postal_code.trim() || null,
          city: form.city.trim() || null,
          country: form.country || null,
          iban: form.iban.trim() || null,
          bic: form.bic.trim() || null,
          registration_number: form.registration_number.trim() || null,
          tax_number: form.tax_number.trim() || null,
          is_vat_payer: form.is_vat_payer,
          comment: form.comment.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', client.id);
      if (error) throw error;
      toast.success(t('cli.save'));
      onSaved();
      onClose();
    } catch {
      toast.error(t('error.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const displayName = clientDisplayName(client);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-text-dark/20 z-30" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-[420px] bg-surface shadow-xl z-40 flex flex-col animate-slideInRight border-l border-accent-muted">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-accent-soft shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-primary border border-accent-muted px-2 py-0.5 rounded bg-transparent">{client.id}</span>
              <IsClientBadge value={client.is_client} t={t} />
            </div>
            <p className="font-semibold text-text-dark text-sm mt-1 leading-tight">{displayName}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-dark transition-colors p-1 rounded-10 hover:bg-bg">
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-accent-soft shrink-0">
          {(['details', 'edit'] as DrawerTab[]).map((t2) => (
            <button
              key={t2}
              onClick={() => onTabChange(t2)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors duration-150 border-b-2 ${
                tab === t2
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-muted hover:text-text-dark'
              }`}
            >
              {t2 === 'details' ? t('cli.details_tab') : t('cli.edit_tab')}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'details' ? (
            <DrawerDetails client={client} t={t} />
          ) : (
            <div className="space-y-6">
              <ClientFormContent form={form} setForm={setForm} errors={errors} isNew={false} t={t} />
              <div className="flex justify-end pt-2 border-t border-accent-soft">
                <button onClick={handleSave} disabled={saving} className="btn-primary">
                  {saving ? t('common.loading') : t('cli.save')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Client Payment Status ────────────────────────────────────────────────────
function ClientPaymentStatus({ clientId, t }: { clientId: string; t: (k: string) => string }) {
  const [totalInvoiced, setTotalInvoiced] = useState<number | null>(null);
  const [totalPaid, setTotalPaid] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from('payments')
      .select('amount, invoice_amount')
      .eq('client_id', clientId)
      .then(({ data }) => {
        if (!data) return;
        setTotalInvoiced(data.reduce((s, p) => s + (p.invoice_amount ?? 0), 0));
        setTotalPaid(data.reduce((s, p) => s + p.amount, 0));
      });
  }, [clientId]);

  if (totalInvoiced === null) return (
    <div className="h-4 rounded bg-accent-soft animate-pulse w-full" />
  );

  const outstanding = totalInvoiced - (totalPaid ?? 0);
  const hasDebt = outstanding > 0;

  return (
    <div className="rounded-10 p-3 space-y-1.5 text-sm" style={{ backgroundColor: hasDebt ? '#fef3c7' : 'var(--color-accent-soft)' }}>
      <div className="flex justify-between">
        <span className="text-text-muted">{t('pay.total_invoiced_label')}</span>
        <span className="font-medium tabular-nums">€ {formatCurrency(totalInvoiced)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-text-muted">{t('pay.total_paid_label')}</span>
        <span className="font-medium text-primary tabular-nums">€ {formatCurrency(totalPaid ?? 0)}</span>
      </div>
      {outstanding !== 0 && (
        <div className="flex justify-between border-t border-accent-muted pt-1.5">
          <span className="text-text-muted">{t('pay.outstanding_label')}</span>
          <span className={`font-bold tabular-nums ${hasDebt ? 'text-danger' : 'text-primary'}`}>
            € {formatCurrency(outstanding)}
          </span>
        </div>
      )}
      <div className="flex justify-between items-center border-t border-accent-muted pt-1.5">
        <span className="text-text-muted">Status</span>
        {hasDebt ? (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{t('pay.has_debt')}</span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent-soft text-primary">{t('pay.status_ok')}</span>
        )}
      </div>
    </div>
  );
}

// ─── Drawer Details Tab ───────────────────────────────────────────────────────
function DrawerDetails({ client, t }: { client: Client; t: (k: string) => string }) {
  const displayName = clientDisplayName(client);
  const vehicles = client.vehicles || [];

  return (
    <div className="space-y-5">
      {/* General */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{t('cli.section_general')}</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-primary border border-accent-muted px-2 py-0.5 rounded">{client.id}</span>
            <IsClientBadge value={client.is_client} t={t} />
            <VatBadge value={client.is_vat_payer} t={t} />
          </div>
          <p className="font-semibold text-text-dark text-base">{displayName}</p>
          {client.company_name && client.company_name !== displayName && (
            <p className="text-sm text-text-muted">{client.company_name}</p>
          )}
          {client.country && (
            <p className="text-sm text-text-muted">{countryFlag(client.country)} {client.country}</p>
          )}
          {client.comment && (
            <div className="mt-2 px-3 py-2 rounded border-l-2 border-accent-muted bg-accent-soft/30 text-sm italic text-text-muted">
              {client.comment}
            </div>
          )}
        </div>
      </div>

      {/* Contacts */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Contatti / Kontakt</p>
        <div className="space-y-2">
          {client.email ? (
            <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
              <Mail size={14} strokeWidth={1.8} />
              {client.email}
            </a>
          ) : (
            <p className="text-sm text-text-muted flex items-center gap-2"><Mail size={14} strokeWidth={1.8} />—</p>
          )}
          {client.phone ? (
            <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
              <Phone size={14} strokeWidth={1.8} />
              {client.phone}
            </a>
          ) : (
            <p className="text-sm text-text-muted flex items-center gap-2"><Phone size={14} strokeWidth={1.8} />—</p>
          )}
        </div>
      </div>

      {/* Address */}
      {(client.address || client.city || client.postal_code) && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{t('cli.section_address')}</p>
          <div className="text-sm text-text-dark space-y-0.5">
            {client.address && <p>{client.address}</p>}
            {(client.postal_code || client.city) && (
              <p>{[client.postal_code, client.city].filter(Boolean).join(' ')}</p>
            )}
            {client.country && <p>{countryFlag(client.country)} {client.country}</p>}
          </div>
        </div>
      )}

      {/* Fiscal */}
      {(client.tax_number || client.registration_number) && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{t('cli.section_fiscal')}</p>
          <div className="rounded-10 p-3 space-y-1.5 text-sm" style={{ backgroundColor: 'var(--color-accent-soft)' }}>
            {client.tax_number && (
              <div className="flex justify-between">
                <span className="text-text-muted">{t('cli.tax_number')}</span>
                <span className="font-mono font-medium">{client.tax_number}</span>
              </div>
            )}
            {client.registration_number && (
              <div className="flex justify-between">
                <span className="text-text-muted">{t('cli.registration_number')}</span>
                <span className="font-mono font-medium">{client.registration_number}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1 border-t border-accent-muted">
              <span className="text-text-muted">{t('cli.is_vat_payer')}</span>
              <VatBadge value={client.is_vat_payer} t={t} />
            </div>
          </div>
        </div>
      )}

      {/* Financial */}
      {(client.iban || client.bic) && (
        <div>
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{t('cli.section_financial')}</p>
          <div className="rounded-10 p-3 space-y-1.5 text-sm" style={{ backgroundColor: '#dbeafe' }}>
            {client.iban && (
              <div className="flex justify-between">
                <span className="text-text-muted">{t('cli.iban')}</span>
                <span className="font-mono font-medium text-xs">{client.iban}</span>
              </div>
            )}
            {client.bic && (
              <div className="flex justify-between">
                <span className="text-text-muted">{t('cli.bic')}</span>
                <span className="font-mono font-medium">{client.bic}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vehicles */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">{t('cli.assigned_vehicles')}</p>
        {vehicles.length === 0 ? (
          <p className="text-sm text-text-muted">{t('cli.no_vehicles_assigned')}</p>
        ) : (
          <div className="space-y-2">
            {vehicles.map((v) => (
              <div key={v.id} className="flex items-center gap-2 text-sm">
                <Car size={13} strokeWidth={1.8} className="text-text-muted shrink-0" />
                <span className="font-mono font-semibold text-primary">{v.registration_number}</span>
                {v.vehicle_name && <span className="text-text-muted">{v.vehicle_name}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment status */}
      <div>
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Stanje plačil / Stato pagamenti
        </p>
        <ClientPaymentStatus clientId={client.id} t={t} />
      </div>
    </div>
  );
}

// ─── Vehicle Popover ──────────────────────────────────────────────────────────
function VehiclePopover({ vehicles, onClose }: { vehicles: Client['vehicles']; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 z-20 bg-surface border border-accent-muted rounded-10 shadow-lg p-3 min-w-[180px]">
      {(vehicles || []).map((v) => (
        <div key={v.id} className="flex items-center gap-2 py-1 text-xs">
          <span className="font-mono font-semibold text-primary">{v.registration_number}</span>
          {v.vehicle_name && <span className="text-text-muted">{v.vehicle_name}</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Clients({ t }: ClientsProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isClientFilter, setIsClientFilter] = useState<IsClientFilter>('all');
  const [countryFilter, setCountryFilter] = useState('');

  const [drawerClient, setDrawerClient] = useState<Client | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('details');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<ClientFormData>(emptyForm);
  const [addErrors, setAddErrors] = useState<FormErrors>({});
  const [addIdChecking, setAddIdChecking] = useState(false);
  const [addSaving, setAddSaving] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [vehiclePopoverId, setVehiclePopoverId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .select(`*, vehicles(id, registration_number, vehicle_name)`)
        .order('company_name_additional', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setClients((data as Client[]) || []);
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Distinct countries for filter
  const distinctCountries = [...new Set(clients.map((c) => c.country).filter(Boolean) as string[])].sort();

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      c.id.toLowerCase().includes(q) ||
      (c.company_name_additional || '').toLowerCase().includes(q) ||
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.tax_number || '').toLowerCase().includes(q);

    const matchesFilter =
      isClientFilter === 'all' ||
      (isClientFilter === 'clients' && c.is_client === true) ||
      (isClientFilter === 'others' && c.is_client !== true);

    const matchesCountry = !countryFilter || c.country === countryFilter;

    return matchesSearch && matchesFilter && matchesCountry;
  });

  // Add modal
  const openAdd = () => {
    setAddForm(emptyForm);
    setAddErrors({});
    setAddModalOpen(true);
  };

  const handleAddIdBlur = async () => {
    if (!addForm.id) return;
    if (!isValidClientId(addForm.id)) {
      setAddErrors((e) => ({ ...e, id: t('cli.id_hint') }));
      return;
    }
    setAddIdChecking(true);
    try {
      const { data } = await supabase.from('clients').select('id').eq('id', addForm.id).single();
      setAddErrors((e) => ({ ...e, id: data ? t('cli.id_taken') : undefined }));
    } finally {
      setAddIdChecking(false);
    }
  };

  const validateAdd = (): boolean => {
    const errs: FormErrors = {};
    if (!addForm.id) errs.id = t('form.required');
    else if (!isValidClientId(addForm.id)) errs.id = t('cli.id_hint');
    if (addForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addForm.email)) errs.email = t('form.invalid_email');
    if (addForm.iban && addForm.iban.length < 15) errs.iban = t('form.invalid_amount');
    setAddErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddSave = async () => {
    if (!validateAdd()) return;
    if (addErrors.id) return;
    setAddSaving(true);
    try {
      const { error } = await supabase.from('clients').insert({
        id: addForm.id.toUpperCase(),
        company_name: addForm.company_name.trim() || null,
        company_name_additional: addForm.company_name_additional.trim() || null,
        is_client: addForm.is_client,
        email: addForm.email.trim().toLowerCase() || null,
        phone: addForm.phone.trim() || null,
        address: addForm.address.trim() || null,
        postal_code: addForm.postal_code.trim() || null,
        city: addForm.city.trim() || null,
        country: addForm.country || null,
        iban: addForm.iban.trim() || null,
        bic: addForm.bic.trim() || null,
        registration_number: addForm.registration_number.trim() || null,
        tax_number: addForm.tax_number.trim() || null,
        is_vat_payer: addForm.is_vat_payer,
        comment: addForm.comment.trim() || null,
      });
      if (error) throw error;
      toast.success(t('cli.add'));
      setAddModalOpen(false);
      fetchData();
    } catch {
      toast.error(t('error.save_failed'));
    } finally {
      setAddSaving(false);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    const client = clients.find((c) => c.id === id);
    if (client?.vehicles && client.vehicles.length > 0) {
      toast.error(t('cli.cannot_delete_vehicles'));
      setDeleteConfirmId(null);
      return;
    }
    try {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
      toast.success(t('btn.delete'));
      setDeleteConfirmId(null);
      if (drawerClient?.id === id) setDrawerClient(null);
      fetchData();
    } catch {
      toast.error(t('error.delete_failed'));
    }
  };

  // Contact
  const handleContact = (client: Client) => {
    if (client.email) {
      window.location.href = `mailto:${client.email}`;
    } else {
      toast.error(t('cli.no_email'));
    }
  };

  const openDrawer = (client: Client, tab: DrawerTab = 'details') => {
    setDrawerClient(client);
    setDrawerTab(tab);
  };

  const filterOptions: { key: IsClientFilter; label: string; activeStyle: React.CSSProperties }[] = [
    { key: 'all', label: t('cli.filter_all'), activeStyle: { backgroundColor: 'var(--color-surface)', color: 'var(--color-primary)', fontWeight: 600 } },
    { key: 'clients', label: t('cli.filter_clients_only'), activeStyle: { backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-primary)', fontWeight: 600 } },
    { key: 'others', label: t('cli.filter_others_only'), activeStyle: { backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 600 } },
  ];

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="page-title mr-2">{t('cli.title')}</h2>
        <div className="flex-1 flex items-center gap-3 flex-wrap justify-end">
          <SearchInput value={search} onChange={setSearch} placeholder={t('cli.search_placeholder')} />

          {/* is_client filter pills */}
          <div className="flex gap-1 bg-bg border border-accent-muted rounded-10 p-1">
            {filterOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setIsClientFilter(opt.key)}
                className="px-3 py-1 rounded-10 text-xs font-medium transition-all duration-150"
                style={isClientFilter === opt.key ? opt.activeStyle : { color: 'var(--color-text-muted)' }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Country filter */}
          <div className="relative">
            <select
              className="input-field pr-8 text-sm appearance-none min-w-[110px]"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
            >
              <option value="">{countryFlag(null) || '🌍'} {t('cli.filter_all')}</option>
              {distinctCountries.map((c) => (
                <option key={c} value={c}>{countryFlag(c)} {c}</option>
              ))}
            </select>
            <ChevronDown size={13} strokeWidth={1.8} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
          </div>

          <button onClick={openAdd} className="btn-primary flex items-center gap-2">
            <Plus size={15} strokeWidth={2} />
            {t('cli.add')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="divide-y divide-accent-soft">
            {[1, 2, 3].map((n) => (
              <div key={n} className="px-4 py-3 flex gap-4 animate-pulse">
                <div className="h-4 bg-accent-soft rounded w-16" />
                <div className="h-4 bg-accent-soft rounded w-40" />
                <div className="h-4 bg-accent-soft rounded w-12 ml-auto" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={40} strokeWidth={1} className="text-accent-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">{t('cli.no_clients')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">{t('cli.id')}</th>
                  <th className="table-header">{t('cli.company_name_additional')}</th>
                  <th className="table-header">{t('cli.country')}</th>
                  <th className="table-header">{t('cli.email')}</th>
                  <th className="table-header">{t('cli.phone')}</th>
                  <th className="table-header">{t('cli.tax_number')}</th>
                  <th className="table-header">{t('cli.is_client')}</th>
                  <th className="table-header">IVA/DDV</th>
                  <th className="table-header">{t('cli.assigned_vehicles')}</th>
                  <th className="table-header">{t('clients.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => {
                  const vCount = client.vehicles?.length ?? 0;
                  const isDeleteConfirm = deleteConfirmId === client.id;
                  const rowStyle: React.CSSProperties = client.is_client ? {} : { backgroundColor: '#fffbeb' };

                  return (
                    <tr
                      key={client.id}
                      className="table-row cursor-pointer"
                      style={rowStyle}
                      onClick={() => !isDeleteConfirm && openDrawer(client, 'details')}
                    >
                      {/* ID */}
                      <td className="table-cell" style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}>
                        <span className="font-mono text-xs font-bold text-primary border border-accent-muted px-2 py-0.5 rounded bg-transparent">
                          {client.id}
                        </span>
                      </td>

                      {/* Name */}
                      <td className="table-cell" style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}>
                        <span className="font-medium text-text-dark text-sm">{clientDisplayName(client)}</span>
                      </td>

                      {/* Country */}
                      <td className="table-cell text-sm text-text-muted" style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}>
                        {client.country ? `${countryFlag(client.country)} ${client.country}` : '—'}
                      </td>

                      {/* Email */}
                      <td className="table-cell text-sm text-text-muted" style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}>
                        {client.email
                          ? client.email.length > 24
                            ? client.email.slice(0, 24) + '…'
                            : client.email
                          : '—'}
                      </td>

                      {/* Phone */}
                      <td className="table-cell text-sm text-text-muted" style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}>
                        {client.phone || '—'}
                      </td>

                      {/* Tax number */}
                      <td className="table-cell text-sm text-text-muted" style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}>
                        {client.tax_number || '—'}
                      </td>

                      {/* is_client badge */}
                      <td className="table-cell" style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}>
                        <IsClientBadge value={client.is_client} t={t} />
                      </td>

                      {/* VAT badge */}
                      <td className="table-cell" style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}>
                        <VatBadge value={client.is_vat_payer} t={t} />
                      </td>

                      {/* Vehicles */}
                      <td className="table-cell" style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}>
                        {vCount === 0 ? (
                          <span className="text-text-muted">—</span>
                        ) : (
                          <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setVehiclePopoverId((prev) => prev === client.id ? null : client.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-success)' }}
                            >
                              <Car size={11} strokeWidth={2} />
                              {vCount}
                            </button>
                            {vehiclePopoverId === client.id && (
                              <VehiclePopover
                                vehicles={client.vehicles}
                                onClose={() => setVehiclePopoverId(null)}
                              />
                            )}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="table-cell" style={{ height: 44, paddingTop: 0, paddingBottom: 0 }}>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {isDeleteConfirm ? (
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-text-muted">{t('cli.confirm_delete')}</span>
                              <button
                                onClick={() => handleDelete(client.id)}
                                className="text-danger font-medium hover:underline"
                              >
                                {t('cli.yes')}
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="text-text-muted font-medium hover:underline"
                              >
                                {t('cli.no')}
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => openDrawer(client, 'edit')}
                                className="text-text-muted hover:text-primary transition-colors"
                                title={t('cli.edit')}
                              >
                                <Pencil size={15} strokeWidth={1.8} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(client.id)}
                                className="text-text-muted hover:text-danger transition-colors"
                                title={t('cli.delete')}
                              >
                                <Trash2 size={15} strokeWidth={1.8} />
                              </button>
                              <button
                                onClick={() => handleContact(client)}
                                className="text-text-muted hover:text-primary transition-colors"
                                title={t('cli.contact')}
                              >
                                <Mail size={15} strokeWidth={1.8} />
                              </button>
                            </>
                          )}
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

      {/* Detail / Edit Drawer */}
      {drawerClient && (
        <ClientDrawer
          key={drawerClient.id}
          client={drawerClient}
          tab={drawerTab}
          onTabChange={setDrawerTab}
          onClose={() => setDrawerClient(null)}
          onSaved={fetchData}
          t={t}
        />
      )}

      {/* Add Client Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={t('cli.add')}
        maxWidth="max-w-2xl"
      >
        <ClientFormContent
          form={addForm}
          setForm={setAddForm}
          errors={addErrors}
          isNew
          idChecking={addIdChecking}
          onIdBlur={handleAddIdBlur}
          t={t}
        />
        <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-accent-soft">
          <button onClick={() => setAddModalOpen(false)} className="btn-secondary">
            {t('btn.cancel')}
          </button>
          <button onClick={handleAddSave} disabled={addSaving} className="btn-primary">
            {addSaving ? t('common.loading') : t('cli.save')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
