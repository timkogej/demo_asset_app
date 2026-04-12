import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Upload,
  Check,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { clearSettingsCache } from '../lib/settings';
import type { Language, Settings } from '../types';

interface SettingsProps {
  t: (key: string) => string;
  language: Language;
}

type SectionKey = 'company' | 'banking' | 'invoices' | 'email';

const COUNTRIES = ['SI', 'IT', 'HR', 'DE', 'AT', 'FR', 'HU', 'RO', 'SK', 'CZ'];

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-5 py-4 text-left"
    >
      <span className="text-sm font-semibold text-text-dark">{title}</span>
      {open ? (
        <ChevronUp size={16} strokeWidth={1.8} className="text-text-muted" />
      ) : (
        <ChevronDown size={16} strokeWidth={1.8} className="text-text-muted" />
      )}
    </button>
  );
}

function FieldLabel({ text }: { text: string }) {
  return <label className="label block mb-1">{text}</label>;
}

export default function Settings({ t }: SettingsProps) {
  const [openSection, setOpenSection] = useState<SectionKey>('company');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoManutecnicaUploading, setLogoManutecnicaUploading] = useState(false);
  const [logoVarentUploading, setLogoVarentUploading] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [showDeeplKey, setShowDeeplKey] = useState(false);

  const originalRef = useRef<Partial<Settings>>({});

  const [form, setForm] = useState<Partial<Settings>>({
    company_name: '',
    company_address: '',
    company_postal: '',
    company_city: '',
    company_country: 'SI',
    company_tax_number: '',
    company_reg_number: '',
    company_share_capital: '',
    company_email: '',
    company_logo_url: '',
    iban: '',
    swift: '',
    payment_method: '',
    invoice_current_year: new Date().getFullYear(),
    invoice_start_number: 1,
    vat_rate: 22,
    contract_ref_it: '',
    contract_ref_sl: '',
    payment_due_days: 14,
    n8n_webhook_url: '',
    n8n_monthly_webhook_url: '',
    vies_webhook_url: '',
    cc_email: '',
    email_subject_it: '',
    email_subject_sl: '',
    email_body_it: '',
    email_body_sl: '',
    deepl_api_key: '',
    deepl_webhook_url: '',
    logo_manutecnica_url: '',
    logo_varent_url: '',
  });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .eq('id', 1)
        .single();
      if (error) throw error;
      if (data) {
        setForm(data);
        originalRef.current = data;
      }
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  function handleChange(
    field: keyof Settings,
    value: string | number | null
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
    setSaved(false);
  }

  function toggleSection(section: SectionKey) {
    setOpenSection((prev) => (prev === section ? prev : section));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('settings')
        .update(form)
        .eq('id', 1);
      if (error) throw error;
      originalRef.current = form;
      clearSettingsCache();
      setDirty(false);
      setSaved(true);
      toast.success(t('settings.saved'));
      setTimeout(() => setSaved(false), 3000);
    } catch {
      toast.error(t('error.save_failed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Allowed formats: PNG, JPG, SVG');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Max file size: 2 MB');
      return;
    }

    setLogoUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `logo/company_logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('invoice-pdfs')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      // Store only the storage path — never a public URL (bucket is private)
      handleChange('company_logo_url', path);
    } catch {
      toast.error('Logo upload failed');
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleLogoUploadToPath(
    file: File,
    storagePath: string,
    field: keyof Settings,
    setUploading: (v: boolean) => void
  ) {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Allowed formats: PNG, JPG, SVG');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Max file size: 2 MB');
      return;
    }
    setUploading(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from('invoice-pdfs')
        .upload(storagePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      handleChange(field, storagePath);
    } catch {
      toast.error('Logo upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleTestWebhook() {
    const url = form.n8n_webhook_url;
    if (!url) {
      toast.error('Enter a webhook URL first');
      return;
    }
    setTestingWebhook(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success('Webhook OK');
    } catch {
      toast.error('Webhook test failed');
    } finally {
      setTestingWebhook(false);
    }
  }

  // --- Skeleton ---
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4 animate-pulse">
        <div className="h-7 w-48 bg-accent-soft rounded-10" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card h-16 rounded-10 bg-accent-soft/40" />
        ))}
      </div>
    );
  }

  const nextInvoicePreview = `${form.invoice_start_number ?? 1}/${form.invoice_current_year ?? new Date().getFullYear()}`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-28">
      <h1 className="page-title mb-6">{t('settings.title')}</h1>

      <div className="space-y-4">
        {/* ── SECTION 1: COMPANY ── */}
        <div className="card rounded-10 overflow-hidden border-l-4" style={{ borderLeftColor: 'var(--color-primary)' }}>
          <SectionHeader
            title={t('settings.company')}
            open={openSection === 'company'}
            onToggle={() => toggleSection('company')}
          />
          {openSection === 'company' && (
            <div className="px-5 pb-6 space-y-5 border-t border-accent-soft">
              {/* Logo upload */}
              <div className="pt-4">
                <FieldLabel text={t('settings.company_logo')} />
                {form.company_logo_url ? (
                  <div className="flex items-center gap-4">
                    <img
                      src={form.company_logo_url}
                      alt="Company logo"
                      style={{ maxHeight: 80, maxWidth: 200, objectFit: 'contain' }}
                      className="rounded border border-accent-soft bg-white p-1"
                    />
                    <label className="btn-secondary text-xs cursor-pointer">
                      {logoUploading ? t('common.loading') : 'Sostituisci / Zamenjaj'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </label>
                  </div>
                ) : (
                  <label
                    className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-accent-muted rounded-10 p-6 cursor-pointer hover:border-primary hover:bg-accent-soft/30 transition-colors"
                  >
                    <Upload size={22} strokeWidth={1.8} className="text-text-muted" />
                    <span className="text-sm text-text-muted">
                      {logoUploading ? t('common.loading') : t('settings.logo_upload')}
                    </span>
                    <span className="text-xs text-text-muted">PNG, JPG, SVG — max 2 MB</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      className="hidden"
                      onChange={handleLogoUpload}
                    />
                  </label>
                )}
              </div>

              {/* Logo Manutecnica */}
              <div>
                <FieldLabel text={t('settings.logo_manutecnica')} />
                {form.logo_manutecnica_url ? (
                  <div className="flex items-center gap-4">
                    <img
                      src={form.logo_manutecnica_url}
                      alt="Logo Manutecnica"
                      style={{ maxHeight: 50, maxWidth: 160, objectFit: 'contain' }}
                      className="rounded border border-accent-soft bg-white p-1"
                    />
                    <label className="btn-secondary text-xs cursor-pointer">
                      {logoManutecnicaUploading ? t('common.loading') : 'Sostituisci / Zamenjaj'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleLogoUploadToPath(f, 'logos/manutecnica.jpg', 'logo_manutecnica_url', setLogoManutecnicaUploading);
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-accent-muted rounded-10 p-4 cursor-pointer hover:border-primary hover:bg-accent-soft/30 transition-colors">
                    <Upload size={18} strokeWidth={1.8} className="text-text-muted" />
                    <span className="text-sm text-text-muted">
                      {logoManutecnicaUploading ? t('common.loading') : t('settings.logo_upload')}
                    </span>
                    <span className="text-xs text-text-muted">PNG, JPG — max 2 MB</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoUploadToPath(f, 'logos/manutecnica.jpg', 'logo_manutecnica_url', setLogoManutecnicaUploading);
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Logo Varent */}
              <div>
                <FieldLabel text={t('settings.logo_varent')} />
                {form.logo_varent_url ? (
                  <div className="flex items-center gap-4">
                    <img
                      src={form.logo_varent_url}
                      alt="Logo Varent"
                      style={{ maxHeight: 50, maxWidth: 160, objectFit: 'contain' }}
                      className="rounded border border-accent-soft bg-white p-1"
                    />
                    <label className="btn-secondary text-xs cursor-pointer">
                      {logoVarentUploading ? t('common.loading') : 'Sostituisci / Zamenjaj'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleLogoUploadToPath(f, 'logos/varent.jpg', 'logo_varent_url', setLogoVarentUploading);
                        }}
                      />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-accent-muted rounded-10 p-4 cursor-pointer hover:border-primary hover:bg-accent-soft/30 transition-colors">
                    <Upload size={18} strokeWidth={1.8} className="text-text-muted" />
                    <span className="text-sm text-text-muted">
                      {logoVarentUploading ? t('common.loading') : t('settings.logo_upload')}
                    </span>
                    <span className="text-xs text-text-muted">PNG, JPG — max 2 MB</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleLogoUploadToPath(f, 'logos/varent.jpg', 'logo_varent_url', setLogoVarentUploading);
                      }}
                    />
                  </label>
                )}
              </div>

              {/* company_name full width */}
              <div>
                <FieldLabel text={t('settings.company_name')} />
                <input
                  className="input-field w-full"
                  value={form.company_name ?? ''}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                />
              </div>

              {/* company_address full width */}
              <div>
                <FieldLabel text={t('settings.company_address')} />
                <input
                  className="input-field w-full"
                  value={form.company_address ?? ''}
                  onChange={(e) => handleChange('company_address', e.target.value)}
                />
              </div>

              {/* postal (30%) + city (70%) */}
              <div className="flex gap-3">
                <div style={{ flex: '0 0 30%' }}>
                  <FieldLabel text={t('settings.company_postal')} />
                  <input
                    className="input-field w-full"
                    value={form.company_postal ?? ''}
                    onChange={(e) => handleChange('company_postal', e.target.value)}
                  />
                </div>
                <div style={{ flex: '1' }}>
                  <FieldLabel text={t('settings.company_city')} />
                  <input
                    className="input-field w-full"
                    value={form.company_city ?? ''}
                    onChange={(e) => handleChange('company_city', e.target.value)}
                  />
                </div>
              </div>

              {/* two-column grid for remaining fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel text={t('settings.company_country')} />
                  <select
                    className="input-field w-full"
                    value={form.company_country ?? 'SI'}
                    onChange={(e) => handleChange('company_country', e.target.value)}
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel text={t('settings.company_tax')} />
                  <input
                    className="input-field w-full"
                    value={form.company_tax_number ?? ''}
                    onChange={(e) => handleChange('company_tax_number', e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel text={t('settings.company_reg')} />
                  <input
                    className="input-field w-full"
                    value={form.company_reg_number ?? ''}
                    onChange={(e) => handleChange('company_reg_number', e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel text={t('settings.company_capital')} />
                  <input
                    className="input-field w-full"
                    placeholder="7.500,00"
                    value={form.company_share_capital ?? ''}
                    onChange={(e) => handleChange('company_share_capital', e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <FieldLabel text={t('settings.company_email')} />
                  <input
                    type="email"
                    className="input-field w-full"
                    value={form.company_email ?? ''}
                    onChange={(e) => handleChange('company_email', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 2: BANKING ── */}
        <div className="card rounded-10 overflow-hidden border-l-4" style={{ borderLeftColor: '#dbeafe' }}>
          <SectionHeader
            title={t('settings.banking')}
            open={openSection === 'banking'}
            onToggle={() => toggleSection('banking')}
          />
          {openSection === 'banking' && (
            <div className="px-5 pb-6 space-y-4 border-t border-accent-soft">
              <div className="pt-4">
                <FieldLabel text={t('settings.iban')} />
                <input
                  className="input-field w-full font-mono"
                  value={form.iban ?? ''}
                  onChange={(e) => handleChange('iban', e.target.value)}
                  placeholder="SI56 0230 0026 2609 473"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel text={t('settings.swift')} />
                  <input
                    className="input-field w-full font-mono"
                    value={form.swift ?? ''}
                    onChange={(e) => handleChange('swift', e.target.value)}
                    placeholder="LJBASI2X"
                  />
                </div>
                <div>
                  <FieldLabel text={t('settings.payment_method')} />
                  <input
                    className="input-field w-full"
                    value={form.payment_method ?? ''}
                    onChange={(e) => handleChange('payment_method', e.target.value)}
                    placeholder="BONIFICO BANCARIO"
                  />
                </div>
              </div>

              {/* Live banking preview */}
              <div
                className="rounded-10 p-4 text-xs font-mono space-y-1.5 mt-2"
                style={{ background: '#f3f4f6', border: '1px solid #e5e7eb' }}
              >
                <div className="flex gap-6">
                  <span className="text-text-muted w-24">IBAN</span>
                  <span className="text-text-dark font-semibold">{form.iban || '—'}</span>
                </div>
                <div className="flex gap-6">
                  <span className="text-text-muted w-24">SWIFT</span>
                  <span className="text-text-dark">{form.swift || '—'}</span>
                </div>
                <div className="flex gap-6">
                  <span className="text-text-muted w-24">PAGAMENTO</span>
                  <span className="text-text-dark">{form.payment_method || '—'}</span>
                </div>
                <div className="flex gap-6">
                  <span className="text-text-muted w-24">ROK PLAČILA</span>
                  <span className="text-text-dark">
                    {form.payment_due_days ? `+${form.payment_due_days} dni` : '—'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 3: INVOICES ── */}
        <div className="card rounded-10 overflow-hidden border-l-4" style={{ borderLeftColor: 'var(--color-accent-soft)' }}>
          <SectionHeader
            title={t('settings.invoices')}
            open={openSection === 'invoices'}
            onToggle={() => toggleSection('invoices')}
          />
          {openSection === 'invoices' && (
            <div className="px-5 pb-6 space-y-5 border-t border-accent-soft pt-4">
              {/* Numbering */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel text={t('settings.invoice_year')} />
                  <input
                    type="number"
                    className="input-field w-full"
                    value={form.invoice_current_year ?? ''}
                    onChange={(e) =>
                      handleChange('invoice_current_year', parseInt(e.target.value) || null)
                    }
                    min={2020}
                    max={2099}
                  />
                </div>
                <div>
                  <FieldLabel text={t('settings.invoice_start')} />
                  <input
                    type="number"
                    className="input-field w-full"
                    value={form.invoice_start_number ?? ''}
                    onChange={(e) =>
                      handleChange('invoice_start_number', parseInt(e.target.value) || null)
                    }
                    min={1}
                  />
                </div>
              </div>
              <p className="text-sm">
                Naslednja številka / Prossimo numero:{' '}
                <span className="font-bold text-primary">{nextInvoicePreview}</span>
              </p>

              {/* VAT */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel text={t('settings.vat_rate')} />
                  <div className="relative">
                    <input
                      type="number"
                      className="input-field w-full pr-8"
                      value={form.vat_rate ?? ''}
                      onChange={(e) =>
                        handleChange('vat_rate', parseFloat(e.target.value) || null)
                      }
                      min={0}
                      max={100}
                      step={0.5}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">%</span>
                  </div>
                </div>
                <div>
                  <FieldLabel text={t('settings.due_days')} />
                  <div className="relative">
                    <input
                      type="number"
                      className="input-field w-full pr-16"
                      value={form.payment_due_days ?? ''}
                      onChange={(e) =>
                        handleChange('payment_due_days', parseInt(e.target.value) || null)
                      }
                      min={1}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-xs">
                      dni / gg
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-text-muted -mt-2">
                La scadenza viene calcolata automaticamente / Rok se izračuna avtomatično
              </p>

              {/* Contract refs */}
              <div>
                <FieldLabel text={t('settings.contract_ref_it')} />
                <input
                  className="input-field w-full"
                  value={form.contract_ref_it ?? ''}
                  onChange={(e) => handleChange('contract_ref_it', e.target.value)}
                  placeholder="Riferimento contratto del"
                />
              </div>
              <div>
                <FieldLabel text={t('settings.contract_ref_sl')} />
                <input
                  className="input-field w-full"
                  value={form.contract_ref_sl ?? ''}
                  onChange={(e) => handleChange('contract_ref_sl', e.target.value)}
                  placeholder="Opravljiene storitve po pogodbi z dne"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 4: EMAIL ── */}
        <div className="card rounded-10 overflow-hidden border-l-4" style={{ borderLeftColor: '#fef3c7' }}>
          <SectionHeader
            title={t('settings.email_settings')}
            open={openSection === 'email'}
            onToggle={() => toggleSection('email')}
          />
          {openSection === 'email' && (
            <div className="px-5 pb-6 space-y-5 border-t border-accent-soft pt-4">
              {/* Webhook */}
              <div>
                <FieldLabel text={t('settings.n8n_webhook')} />
                <input
                  type="url"
                  className="input-field w-full"
                  value={form.n8n_webhook_url ?? ''}
                  onChange={(e) => handleChange('n8n_webhook_url', e.target.value)}
                  placeholder="https://n8n.example.com/webhook/..."
                />
                <div
                  className="mt-2 p-3 rounded-10 text-xs text-text-muted"
                  style={{ background: '#f8faf8', border: '1px solid #e8f0eb' }}
                >
                  Questo URL viene chiamato quando si invia una fattura / Ta URL se pokliče ob pošiljanju računa
                </div>
                <button
                  type="button"
                  onClick={handleTestWebhook}
                  disabled={testingWebhook || !form.n8n_webhook_url}
                  className="btn-secondary text-xs mt-2"
                >
                  {testingWebhook ? t('common.loading') : 'Testa webhook / Testiraj webhook'}
                </button>
              </div>

              {/* Monthly generation webhook */}
              <div>
                <FieldLabel text={t('settings.n8n_monthly_webhook')} />
                <input
                  type="url"
                  className="input-field w-full"
                  value={form.n8n_monthly_webhook_url ?? ''}
                  onChange={(e) => handleChange('n8n_monthly_webhook_url', e.target.value)}
                  placeholder="https://tikej.app.n8n.cloud/webhook/generate-monthly-invoices"
                />
                <div
                  className="mt-2 p-3 rounded-10 text-xs text-text-muted"
                  style={{ background: '#f8faf8', border: '1px solid #e8f0eb' }}
                >
                  Questo URL viene chiamato per generare le fatture mensili / Ta URL se pokliče za generiranje mesečnih računov
                </div>
              </div>

              {/* VIES webhook */}
              <div>
                <FieldLabel text="VIES Webhook URL" />
                <input
                  type="url"
                  className="input-field w-full"
                  value={form.vies_webhook_url ?? ''}
                  onChange={(e) => handleChange('vies_webhook_url', e.target.value)}
                  placeholder="https://tikej.app.n8n.cloud/webhook/vies-check"
                />
                <div
                  className="mt-2 p-3 rounded-10 text-xs text-text-muted"
                  style={{ background: '#f8faf8', border: '1px solid #e8f0eb' }}
                >
                  URL del webhook n8n per la verifica VIES / URL n8n webhookа za preverjanje VIES
                </div>
              </div>

              {/* CC email */}
              <div>
                <FieldLabel text={t('settings.cc_email')} />
                <input
                  type="email"
                  className="input-field w-full"
                  value={form.cc_email ?? ''}
                  onChange={(e) => handleChange('cc_email', e.target.value)}
                />
                <p className="text-xs text-text-muted mt-1">
                  Ogni fattura inviata verrà copiata a questo indirizzo / Vsak poslan račun bo kopiran na ta naslov
                </p>
              </div>

              {/* DeepL API Key */}
              <div>
                <FieldLabel text={t('settings.deepl_api_key')} />
                <div className="relative">
                  <input
                    type={showDeeplKey ? 'text' : 'password'}
                    className="input-field w-full pr-16"
                    value={form.deepl_api_key ?? ''}
                    onChange={(e) => handleChange('deepl_api_key', e.target.value)}
                    placeholder="••••••••••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeeplKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-primary"
                  >
                    {showDeeplKey ? 'Nascondi' : 'Mostra'}
                  </button>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Utilizzato per tradurre automaticamente le descrizioni nelle fatture / Uporablja se za samodejni prevod opisov na racunih
                </p>
              </div>

              {/* DeepL Webhook URL */}
              <div>
                <FieldLabel text="DeepL Webhook URL (n8n)" />
                <input
                  type="text"
                  className="input-field w-full"
                  value={form.deepl_webhook_url ?? ''}
                  onChange={(e) => handleChange('deepl_webhook_url', e.target.value)}
                  placeholder="https://tikej.app.n8n.cloud/webhook/deepl-translate"
                />
                <p className="text-xs text-text-muted mt-1">
                  URL n8n webhook za DeepL prevod opisov v fakturah / URL n8n webhook za DeepL prevod opisov v racunih
                </p>
              </div>

              {/* Placeholders info */}
              <div
                className="rounded-10 p-3 text-xs font-mono space-y-1"
                style={{ background: '#f8faf8', border: '1px solid #e8f0eb' }}
              >
                <p className="text-text-muted font-sans font-semibold mb-2 text-xs">
                  {t('settings.placeholders')}
                </p>
                {[
                  ['{invoice_number}', '121/2026'],
                  ['{date}', '01/03/2026'],
                  ['{client_name}', 'BUSI STEFANO'],
                  ['{total}', '€ 440,00'],
                  ['{due_date}', '14/03/2026'],
                ].map(([key, val]) => (
                  <div key={key} className="flex gap-4">
                    <span className="text-primary w-40">{key}</span>
                    <span className="text-text-muted">→</span>
                    <span className="text-text-dark">{val}</span>
                  </div>
                ))}
              </div>

              {/* Email subjects */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel text={t('settings.email_subject_it')} />
                  <input
                    className="input-field w-full"
                    value={form.email_subject_it ?? ''}
                    onChange={(e) => handleChange('email_subject_it', e.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel text={t('settings.email_subject_sl')} />
                  <input
                    className="input-field w-full"
                    value={form.email_subject_sl ?? ''}
                    onChange={(e) => handleChange('email_subject_sl', e.target.value)}
                  />
                </div>
              </div>

              {/* Email bodies */}
              <div>
                <FieldLabel text={t('settings.email_body_it')} />
                <textarea
                  rows={5}
                  className="input-field w-full resize-y"
                  value={form.email_body_it ?? ''}
                  onChange={(e) => handleChange('email_body_it', e.target.value)}
                />
              </div>
              <div>
                <FieldLabel text={t('settings.email_body_sl')} />
                <textarea
                  rows={5}
                  className="input-field w-full resize-y"
                  value={form.email_body_sl ?? ''}
                  onChange={(e) => handleChange('email_body_sl', e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── STICKY SAVE FOOTER ── */}
      <div
        className="fixed bottom-0 right-0 px-6 py-4 flex justify-end"
        style={{
          left: 'var(--sidebar-width, 240px)',
          background: 'linear-gradient(to top, #f8faf8 80%, transparent)',
          zIndex: 40,
        }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`btn-primary flex items-center gap-2 text-sm transition-all ${
            !dirty ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {saved ? (
            <>
              <Check size={15} strokeWidth={2} />
              {t('settings.saved')}
            </>
          ) : saving ? (
            <>
              <span className="spinner w-4 h-4" />
              {t('common.loading')}
            </>
          ) : (
            t('settings.save')
          )}
        </button>
      </div>
    </div>
  );
}
