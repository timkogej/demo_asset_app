import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Upload,
  Check,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronRight,
  Bell,
  Users,
  FileText,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { clearSettingsCache } from '../lib/settings';
import type { Language, Settings, InvoiceTemplate, InvoiceTemplateLine, InvoiceType, ReminderTemplate } from '../types';
import { TEMPLATE_VARIABLES } from '../lib/invoiceVariables';

interface SettingsProps {
  t: (key: string) => string;
  language: Language;
}

type SectionKey = 'company' | 'banking' | 'invoices' | 'email' | 'templates' | 'reminders' | 'export';

const COUNTRIES = ['SI', 'IT', 'HR', 'DE', 'AT', 'FR', 'HU', 'RO', 'SK', 'CZ'];

const EXPORT_YEARS = [2024, 2025, 2026];

const EXPORT_MONTHS: Record<Language, string[]> = {
  sl: ['Januar', 'Februar', 'Marec', 'April', 'Maj', 'Junij', 'Julij', 'Avgust', 'September', 'Oktober', 'November', 'December'],
  it: ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'],
};

// --- Excel export helpers (accounting) ---
function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; header: string }[],
  filename: string,
) {
  const rows = data.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col) => {
      obj[col.header] = row[col.key];
    });
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
}

// DD.MM.YYYY from an ISO date string (e.g. "2026-05-01")
function formatExportDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}

// 2 decimal places, kept as a numeric value for Excel
function toMoney(value: number | null): number {
  return Number((value ?? 0).toFixed(2));
}

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

function VariableAutocomplete({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [showVars, setShowVars] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    onChange(val);
    const sel = e.target.selectionStart ?? 0;
    const lastBrace = val.lastIndexOf('{', sel - 1);
    if (lastBrace !== -1 && sel > lastBrace) {
      setShowVars(true);
      setCursorPos(lastBrace);
    } else {
      setShowVars(false);
    }
  }

  function insertVariable(varKey: string) {
    const after = value.substring(cursorPos).replace(/^\{[^}]*/, '');
    const newVal = value.substring(0, cursorPos) + varKey + after;
    onChange(newVal);
    setShowVars(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setShowVars(false), 150)}
        className="input-field w-full"
        style={{ fontSize: '13px' }}
      />
      {showVars && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 9999,
            background: 'white',
            border: '1px solid #a8d4b3',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            minWidth: '300px',
            maxHeight: '240px',
            overflowY: 'auto',
          }}
        >
          {TEMPLATE_VARIABLES.map((v) => (
            <div
              key={v.key}
              onMouseDown={() => insertVariable(v.key)}
              style={{ padding: '7px 12px', cursor: 'pointer', fontSize: '12px' }}
              className="hover:bg-accent-soft"
            >
              <span style={{ fontWeight: 700, color: '#1a4731', fontFamily: 'monospace' }}>
                {v.key}
              </span>
              <span style={{ color: '#6b8f75', marginLeft: '8px' }}>
                {v.label_sl} / {v.label_it}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Settings({ t, language }: SettingsProps) {
  const [openSection, setOpenSection] = useState<SectionKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoManutecnicaUploading, setLogoManutecnicaUploading] = useState(false);
  const [logoVarentUploading, setLogoVarentUploading] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [showDeeplKey, setShowDeeplKey] = useState(false);
  const [showTechnicalSettings, setShowTechnicalSettings] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [activeTemplateType, setActiveTemplateType] = useState<InvoiceType>('monthly_rent');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [expandedVars, setExpandedVars] = useState(false);

  // Reminder templates state
  const [reminderTemplates, setReminderTemplates] = useState<ReminderTemplate[]>([]);
  const [savingReminderLevel, setSavingReminderLevel] = useState<number | null>(null);
  const [savingSmsSettings, setSavingSmsSettings] = useState(false);

  // Accounting export state
  const now = new Date();
  const [exportMonth, setExportMonth] = useState<number>(now.getMonth() + 1);
  const [exportYear, setExportYear] = useState<number>(now.getFullYear());
  const [exportingPartners, setExportingPartners] = useState(false);
  const [exportingInvoices, setExportingInvoices] = useState(false);

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

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase
      .from('invoice_templates')
      .select('*, lines:invoice_template_lines(*)')
      .order('invoice_type');
    if (data) {
      data.forEach((tmpl: InvoiceTemplate) => {
        tmpl.lines?.sort((a, b) => a.sort_order - b.sort_order);
      });
      setTemplates(data as InvoiceTemplate[]);
    }
  }, []);

  const loadReminderTemplates = useCallback(async () => {
    const { data } = await supabase
      .from('reminder_templates')
      .select('*')
      .order('reminder_level', { ascending: true });
    if (data) setReminderTemplates(data as ReminderTemplate[]);
  }, []);

  useEffect(() => {
    loadSettings();
    loadTemplates();
    loadReminderTemplates();
  }, [loadSettings, loadTemplates, loadReminderTemplates]);

  async function saveTemplate(template: InvoiceTemplate) {
    setSavingTemplate(true);
    try {
      await supabase
        .from('invoice_templates')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', template.id);

      await supabase
        .from('invoice_template_lines')
        .delete()
        .eq('template_id', template.id);

      if (template.lines && template.lines.length > 0) {
        await supabase
          .from('invoice_template_lines')
          .insert(
            template.lines.map((line, i) => ({
              template_id: template.id,
              sort_order: i,
              line_type: line.line_type,
              content: line.content,
              quantity: line.quantity ?? 1,
              unit_price_var: line.unit_price_var ?? null,
            }))
          );
      }

      toast.success(t('settings.template_saved'));
    } catch {
      toast.error(t('error.save_failed'));
    } finally {
      setSavingTemplate(false);
    }
  }

  function updateTemplate(type: InvoiceType, updater: (t: InvoiceTemplate) => InvoiceTemplate) {
    setTemplates((prev) => prev.map((tmpl) => tmpl.invoice_type === type ? updater(tmpl) : tmpl));
  }

  function addLine(type: InvoiceType) {
    updateTemplate(type, (tmpl) => ({
      ...tmpl,
      lines: [
        ...(tmpl.lines || []),
        {
          id: crypto.randomUUID(),
          template_id: tmpl.id,
          sort_order: (tmpl.lines?.length ?? 0),
          line_type: 'item',
          content: '',
          quantity: 1,
          unit_price_var: null,
        } as InvoiceTemplateLine,
      ],
    }));
  }

  function removeLine(type: InvoiceType, lineId: string) {
    updateTemplate(type, (tmpl) => ({
      ...tmpl,
      lines: (tmpl.lines || []).filter((l) => l.id !== lineId),
    }));
  }

  function moveLine(type: InvoiceType, lineId: string, dir: 'up' | 'down') {
    updateTemplate(type, (tmpl) => {
      const lines = [...(tmpl.lines || [])];
      const idx = lines.findIndex((l) => l.id === lineId);
      if (idx === -1) return tmpl;
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= lines.length) return tmpl;
      [lines[idx], lines[swapIdx]] = [lines[swapIdx], lines[idx]];
      return { ...tmpl, lines };
    });
  }

  function updateLine(type: InvoiceType, lineId: string, patch: Partial<InvoiceTemplateLine>) {
    updateTemplate(type, (tmpl) => ({
      ...tmpl,
      lines: (tmpl.lines || []).map((l) => l.id === lineId ? { ...l, ...patch } : l),
    }));
  }

  function updateReminderTemplate(level: number, patch: Partial<ReminderTemplate>) {
    setReminderTemplates((prev) =>
      prev.map((t) => t.reminder_level === level ? { ...t, ...patch } : t)
    );
  }

  async function saveReminderTemplate(level: number) {
    const tmpl = reminderTemplates.find((t) => t.reminder_level === level);
    if (!tmpl) return;
    setSavingReminderLevel(level);
    try {
      const { error } = await supabase
        .from('reminder_templates')
        .update({
          subject_email_it: tmpl.subject_email_it,
          body_email_it: tmpl.body_email_it,
          body_sms_it: tmpl.body_sms_it,
          updated_at: new Date().toISOString(),
        })
        .eq('id', level);
      if (error) throw error;
      toast.success('Predloga shranjena');
    } catch {
      toast.error(t('error.save_failed'));
    } finally {
      setSavingReminderLevel(null);
    }
  }

  async function saveSmsSettings() {
    setSavingSmsSettings(true);
    try {
      const { error } = await supabase
        .from('settings')
        .update({
          sms_sender_number: form.sms_sender_number ?? null,
          bulkgate_app_id: form.bulkgate_app_id ?? null,
          bulkgate_app_token: form.bulkgate_app_token ?? null,
          reminder_webhook_url: form.reminder_webhook_url ?? null,
        })
        .eq('id', 1);
      if (error) throw error;
      clearSettingsCache();
      toast.success('SMS nastavitve shranjene');
    } catch {
      toast.error(t('error.save_failed'));
    } finally {
      setSavingSmsSettings(false);
    }
  }

  function handleChange(
    field: keyof Settings,
    value: string | number | null
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
    setSaved(false);
  }

  function toggleSection(section: SectionKey) {
    setOpenSection((prev) => (prev === section ? null : section));
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

  // --- Accounting exports ---
  const exportPeriodSuffix = `${String(exportMonth).padStart(2, '0')}_${exportYear}`;
  const noInvoicesMsg = language === 'sl' ? 'Ni računov za izbrani mesec' : 'Nessuna fattura per il mese selezionato';
  const downloadedMsg = language === 'sl' ? 'Datoteka prenesena' : 'File scaricato';

  async function handleExportPartners() {
    setExportingPartners(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('client_id, client:clients(id, company_name, company_name_additional, address, city, postal_code, country, tax_number)')
        .eq('billing_month', exportMonth)
        .eq('billing_year_check', exportYear)
        .neq('status', 'cancelled');
      if (error) throw error;

      type PartnerQueryRow = {
        client_id: string | null;
        client: {
          id: string;
          company_name: string | null;
          company_name_additional: string | null;
          address: string | null;
          city: string | null;
          postal_code: string | null;
          country: string | null;
          tax_number: string | null;
        } | null;
      };
      const rows = (data ?? []) as unknown as PartnerQueryRow[];

      if (rows.length === 0) {
        toast.error(noInvoicesMsg);
        return;
      }

      // Deduplicate by client_id (each partner only once)
      const seen = new Set<string>();
      const partners: {
        sifra: string;
        naziv: string;
        naslov: string;
        mesto: string;
        davcna: string;
        posta: string;
        drzava: string;
      }[] = [];
      for (const row of rows) {
        const c = row.client;
        if (!c || !c.id || seen.has(c.id)) continue;
        seen.add(c.id);
        partners.push({
          sifra: c.id,
          naziv: c.company_name || c.company_name_additional || '',
          naslov: c.address ?? '',
          mesto: c.city ?? '',
          davcna: c.tax_number ?? '',
          posta: c.postal_code ? `${c.country ?? ''}-${c.postal_code}` : '',
          drzava: c.country ?? '',
        });
      }

      exportToExcel(
        partners,
        [
          { key: 'sifra', header: 'Šifra partnerja' },
          { key: 'naziv', header: 'Naziv' },
          { key: 'naslov', header: 'Naslov' },
          { key: 'mesto', header: 'Mesto' },
          { key: 'davcna', header: 'Davčna številka' },
          { key: 'posta', header: 'Poštna številka' },
          { key: 'drzava', header: 'Država' },
        ],
        `Archive1_${exportPeriodSuffix}.xlsx`,
      );
      toast.success(downloadedMsg);
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setExportingPartners(false);
    }
  }

  async function handleExportInvoices() {
    setExportingInvoices(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('invoice_number, invoice_date, status, subtotal, vat_amount, total, client_id')
        .eq('billing_month', exportMonth)
        .eq('billing_year_check', exportYear)
        .order('invoice_sequence', { ascending: true });
      if (error) throw error;

      type InvoiceQueryRow = {
        invoice_number: string;
        invoice_date: string;
        status: string | null;
        subtotal: number | null;
        vat_amount: number | null;
        total: number | null;
        client_id: string | null;
      };
      const rows = (data ?? []) as unknown as InvoiceQueryRow[];

      if (rows.length === 0) {
        toast.error(noInvoicesMsg);
        return;
      }

      const invoices = rows.map((r) => {
        const isCancelled = r.status === 'cancelled';
        const subtotal = isCancelled ? 0 : r.subtotal;
        const vat_amount = isCancelled ? 0 : r.vat_amount;
        const total = isCancelled ? 0 : r.total;
        return {
          stevilka: r.invoice_number,
          datum: formatExportDate(r.invoice_date),
          osnova: toMoney(subtotal),
          ddv: toMoney(vat_amount),
          skupaj: toMoney(total),
          sifra: r.client_id ?? '',
        };
      });

      exportToExcel(
        invoices,
        [
          { key: 'stevilka', header: 'Številka računa' },
          { key: 'datum', header: 'Datum računa' },
          { key: 'osnova', header: 'Osnova' },
          { key: 'ddv', header: 'DDV' },
          { key: 'skupaj', header: 'Skupaj' },
          { key: 'sifra', header: 'Šifra partnerja' },
        ],
        `Archive2_${exportPeriodSuffix}.xlsx`,
      );
      toast.success(downloadedMsg);
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setExportingInvoices(false);
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

              {/* Technical settings — collapsed by default */}
              <div
                className="rounded-10 overflow-hidden"
                style={{ border: '1px solid #e8f0eb' }}
              >
                <button
                  type="button"
                  onClick={() => setShowTechnicalSettings((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-text-muted hover:bg-accent-soft transition-colors"
                >
                  <span>
                    {language === 'sl' ? 'Tehnične nastavitve' : 'Impostazioni tecniche'}
                  </span>
                  {showTechnicalSettings ? (
                    <ChevronUp size={14} strokeWidth={1.8} />
                  ) : (
                    <ChevronDown size={14} strokeWidth={1.8} />
                  )}
                </button>
                {showTechnicalSettings && (
                  <div className="px-4 pb-4 pt-2 space-y-4 border-t border-accent-soft">
                    {/* N8N Webhook */}
                    <div>
                      <FieldLabel text={t('settings.n8n_webhook')} />
                      <input
                        type="url"
                        className="input-field w-full"
                        value={form.n8n_webhook_url ?? ''}
                        onChange={(e) => handleChange('n8n_webhook_url', e.target.value)}
                        placeholder="https://n8n.example.com/webhook/..."
                      />
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
                        placeholder="https://n8n.jedroplus.com/webhook/generate-monthly-invoices"
                      />
                    </div>

                    {/* VIES webhook */}
                    <div>
                      <FieldLabel text="VIES Webhook URL" />
                      <input
                        type="url"
                        className="input-field w-full"
                        value={form.vies_webhook_url ?? ''}
                        onChange={(e) => handleChange('vies_webhook_url', e.target.value)}
                        placeholder="https://n8n.jedroplus.com/webhook/vies-check"
                      />
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
                    </div>

                    {/* DeepL Webhook URL */}
                    <div>
                      <FieldLabel text="DeepL Webhook URL (n8n)" />
                      <input
                        type="text"
                        className="input-field w-full"
                        value={form.deepl_webhook_url ?? ''}
                        onChange={(e) => handleChange('deepl_webhook_url', e.target.value)}
                        placeholder="https://n8n.jedroplus.com/webhook/deepl-translate"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {/* ── SECTION 5: TEMPLATES ── */}
        {(() => {
          const INVOICE_TYPES: { type: InvoiceType; label: string }[] = [
            { type: 'monthly_rent', label: 'Mesečna najemnina / Canone Mensile' },
            { type: 'deposit',      label: 'Predplačilo/Polog / Anticipo' },
            { type: 'penalties',    label: 'Kazni / Contravvenzioni' },
            { type: 'insurance',    label: 'Zavarovanje / Assicurazione' },
            { type: 'damage',       label: 'Škoda / Danni' },
            { type: 'other',        label: 'Drugo / Altro' },
          ];
          const activeTemplate = templates.find((t) => t.invoice_type === activeTemplateType);

          return (
            <div
              className="card rounded-10 overflow-hidden border-l-4"
              style={{ borderLeftColor: '#a8d4b3' }}
            >
              <SectionHeader
                title={t('settings.templates')}
                open={openSection === 'templates'}
                onToggle={() => toggleSection('templates')}
              />
              {openSection === 'templates' && (
                <div className="px-5 pb-6 space-y-4 border-t border-accent-soft pt-4">
                  {/* Type tabs */}
                  <div className="flex flex-wrap gap-2">
                    {INVOICE_TYPES.map(({ type, label }) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setActiveTemplateType(type)}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          activeTemplateType === type
                            ? 'bg-primary text-white border-primary'
                            : 'border-accent-muted text-text-muted hover:border-primary hover:text-primary'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Template editor */}
                  {activeTemplate ? (
                    <div className="space-y-3">
                      {/* Lines list */}
                      {(!activeTemplate.lines || activeTemplate.lines.length === 0) ? (
                        <div
                          className="text-center py-6 text-sm text-text-muted rounded-10"
                          style={{ border: '1px dashed #c8e0cf' }}
                        >
                          Ni vrstic / Nessuna riga
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {activeTemplate.lines.map((line, idx) => (
                            <div
                              key={line.id}
                              className="rounded-10 p-3 space-y-2"
                              style={{ background: '#f8faf8', border: '1px solid #e8f0eb' }}
                            >
                              {/* Line type + reorder + delete */}
                              <div className="flex items-center gap-2">
                                {/* Type pills */}
                                <div className="flex gap-1">
                                  {(['text', 'item', 'space'] as InvoiceTemplateLine['line_type'][]).map((lt) => (
                                    <button
                                      key={lt}
                                      type="button"
                                      onClick={() => updateLine(activeTemplateType, line.id, { line_type: lt })}
                                      className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                                        line.line_type === lt
                                          ? 'bg-primary text-white border-primary'
                                          : 'border-accent-muted text-text-muted hover:border-primary'
                                      }`}
                                    >
                                      {lt === 'text'  ? t('settings.line_type_text')  :
                                       lt === 'item'  ? t('settings.line_type_item')  :
                                       t('settings.line_type_space')}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex-1" />
                                {/* Reorder */}
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => moveLine(activeTemplateType, line.id, 'up')}
                                  className="text-text-muted hover:text-primary disabled:opacity-30"
                                >
                                  <ArrowUp size={14} strokeWidth={1.8} />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === (activeTemplate.lines?.length ?? 0) - 1}
                                  onClick={() => moveLine(activeTemplateType, line.id, 'down')}
                                  className="text-text-muted hover:text-primary disabled:opacity-30"
                                >
                                  <ArrowDown size={14} strokeWidth={1.8} />
                                </button>
                                {/* Delete */}
                                <button
                                  type="button"
                                  onClick={() => removeLine(activeTemplateType, line.id)}
                                  className="text-text-muted hover:text-red-500"
                                >
                                  <Trash2 size={14} strokeWidth={1.8} />
                                </button>
                              </div>

                              {/* Content input (hidden for space lines) */}
                              {line.line_type !== 'space' && (
                                <div className="flex gap-2 items-center">
                                  <span className="text-xs text-text-muted w-16 shrink-0">Vsebina</span>
                                  <VariableAutocomplete
                                    value={line.content}
                                    onChange={(v) => updateLine(activeTemplateType, line.id, { content: v })}
                                  />
                                </div>
                              )}

                              {/* Unit price var (item only) */}
                              {line.line_type === 'item' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px' }}>
                                  <label style={{
                                    fontSize: '11px',
                                    color: '#6b8f75',
                                    fontWeight: '600',
                                    whiteSpace: 'nowrap',
                                  }}>
                                    {t('settings.unit_price_var')}
                                  </label>
                                  <div style={{ position: 'relative' }}>
                                    <select
                                      value={line.unit_price_var ?? ''}
                                      onChange={(e) => updateLine(activeTemplateType, line.id, { unit_price_var: e.target.value || null })}
                                      style={{
                                        appearance: 'none',
                                        WebkitAppearance: 'none',
                                        width: '100%',
                                        padding: '6px 28px 6px 10px',
                                        border: '1px solid #a8d4b3',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        color: '#1c2b22',
                                        background: 'white',
                                        cursor: 'pointer',
                                        outline: 'none',
                                      }}
                                    >
                                      <option value="">— {t('settings.no_price_var')} —</option>
                                      <option value="{received_installment}">{t('settings.var_received')}</option>
                                      <option value="{lease_installment}">{t('settings.var_lease')}</option>
                                      <option value="{deposit}">{t('settings.var_deposit')}</option>
                                      <option value="{annual_insurance_cost}">{t('settings.var_insurance')}</option>
                                    </select>
                                    <ChevronDown size={12} strokeWidth={1.5} style={{
                                      position: 'absolute',
                                      right: '8px',
                                      top: '50%',
                                      transform: 'translateY(-50%)',
                                      pointerEvents: 'none',
                                      color: '#6b8f75',
                                    }} />
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add line + Save */}
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => addLine(activeTemplateType)}
                          className="btn-secondary text-xs flex items-center gap-1"
                        >
                          + {t('settings.add_line')}
                        </button>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={() => saveTemplate(activeTemplate)}
                          disabled={savingTemplate}
                          className="btn-primary text-xs flex items-center gap-1"
                        >
                          {savingTemplate ? (
                            <><span className="spinner w-3 h-3" /> Shranjevanje...</>
                          ) : (
                            <><Check size={13} strokeWidth={2} /> Shrani / Salva</>
                          )}
                        </button>
                      </div>

                      {/* Available variables collapsible */}
                      <div
                        className="rounded-10 overflow-hidden"
                        style={{ border: '1px solid #e8f0eb' }}
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedVars((v) => !v)}
                          className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-text-muted hover:bg-accent-soft"
                        >
                          <span>{t('settings.available_vars')}</span>
                          <ChevronRight
                            size={13}
                            strokeWidth={1.8}
                            className={`transition-transform ${expandedVars ? 'rotate-90' : ''}`}
                          />
                        </button>
                        {expandedVars && (
                          <div className="px-3 pb-3 flex flex-wrap gap-2">
                            {TEMPLATE_VARIABLES.map((v) => (
                              <span
                                key={v.key}
                                className="text-xs px-2 py-1 rounded-full font-mono"
                                style={{ background: '#eaf4ed', color: '#1a4731', border: '1px solid #c8e0cf' }}
                                title={`${v.description_sl} / ${v.description_it}`}
                              >
                                {v.key}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-text-muted py-4 text-center">
                      Nalaganje predlog... / Caricamento modelli...
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── SECTION 6: REMINDERS ── */}
        <div className="card rounded-10 overflow-hidden border-l-4" style={{ borderLeftColor: '#f59e0b' }}>
          <SectionHeader
            title={t('rem.reminders')}
            open={openSection === 'reminders'}
            onToggle={() => toggleSection('reminders')}
          />
          {openSection === 'reminders' && (
            <div className="px-5 pb-6 border-t border-accent-soft space-y-8">

              {/* ── Del A: Predloge opomnikov ── */}
              <div className="pt-4">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                  Predloge opomnikov / Modelli di sollecito
                </p>
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((level) => {
                    const tmpl = reminderTemplates.find((t) => t.reminder_level === level);
                    const levelColors: Record<number, string> = {
                      1: 'border-blue-200 bg-blue-50/40',
                      2: 'border-amber-200 bg-amber-50/40',
                      3: 'border-orange-200 bg-orange-50/40',
                      4: 'border-red-200 bg-red-50/40',
                    };
                    const levelNames: Record<number, string> = {
                      1: '1° Sollecito',
                      2: '2° Sollecito',
                      3: '3° Sollecito',
                      4: '4° Sollecito (Finale)',
                    };
                    const smsLen = (tmpl?.body_sms_it ?? '').length;
                    return (
                      <div key={level} className={`rounded-10 border p-4 space-y-3 ${levelColors[level] ?? ''}`}>
                        <div className="flex items-center gap-2">
                          <Bell size={14} strokeWidth={1.8} className="text-text-muted" />
                          <span className="text-sm font-semibold text-text-dark">{levelNames[level]}</span>
                        </div>
                        {tmpl ? (
                          <>
                            <div>
                              <FieldLabel text="Subject emaila" />
                              <input
                                className="input-field w-full text-sm"
                                value={tmpl.subject_email_it}
                                onChange={(e) => updateReminderTemplate(level, { subject_email_it: e.target.value })}
                                placeholder="Oggetto email..."
                              />
                            </div>
                            <div>
                              <FieldLabel text="Besedilo emaila" />
                              <textarea
                                className="input-field w-full text-sm resize-none"
                                rows={6}
                                value={tmpl.body_email_it}
                                onChange={(e) => updateReminderTemplate(level, { body_email_it: e.target.value })}
                                placeholder="Telo emaila..."
                              />
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <FieldLabel text="Besedilo SMS" />
                                <span className={`text-xs font-mono ${smsLen > 160 ? 'text-red-500 font-bold' : 'text-text-muted'}`}>
                                  {smsLen}/160 znakov
                                </span>
                              </div>
                              <textarea
                                className="input-field w-full text-sm resize-none"
                                rows={3}
                                value={tmpl.body_sms_it}
                                onChange={(e) => updateReminderTemplate(level, { body_sms_it: e.target.value })}
                                placeholder="SMS besedilo..."
                              />
                            </div>
                            <div className="text-xs text-text-muted">
                              <span className="font-medium">Razpoložljive spremenljivke:</span>{' '}
                              {['{invoice_number}', '{service_period}', '{vehicle_name}', '{registration_number}', '{due_date}', '{client_name}', '{total}'].map((v) => (
                                <code key={v} className="px-1 py-0.5 rounded font-mono text-[11px]" style={{ background: '#eaf4ed', color: '#1a4731', border: '1px solid #c8e0cf' }}>{v}</code>
                              )).reduce((acc, el, i) => i === 0 ? [el] : [...acc, ' ', el], [] as React.ReactNode[])}
                            </div>
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => saveReminderTemplate(level)}
                                disabled={savingReminderLevel === level}
                                className="btn-primary text-xs flex items-center gap-1"
                              >
                                {savingReminderLevel === level ? (
                                  <><span className="spinner w-3 h-3" /> Shranjevanje...</>
                                ) : (
                                  <><Check size={13} strokeWidth={2} /> Shrani</>
                                )}
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-text-muted italic">Predloga se nalaga...</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Del B: BulkGate & SMS nastavitve ── */}
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                  BulkGate & SMS nastavitve
                </p>
                <div className="space-y-4">
                  <div>
                    <FieldLabel text="SMS pošiljatelj (sms_sender_number)" />
                    <input
                      className="input-field w-full"
                      value={form.sms_sender_number ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, sms_sender_number: e.target.value }))}
                      placeholder="+38640123456"
                    />
                  </div>
                  <div>
                    <FieldLabel text="BulkGate Application ID" />
                    <input
                      className="input-field w-full"
                      value={form.bulkgate_app_id ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, bulkgate_app_id: e.target.value }))}
                      placeholder="123456"
                    />
                  </div>
                  <div>
                    <FieldLabel text="BulkGate Application Token" />
                    <input
                      type="password"
                      className="input-field w-full"
                      value={form.bulkgate_app_token ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, bulkgate_app_token: e.target.value }))}
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <FieldLabel text="Reminder Webhook URL" />
                    <input
                      className="input-field w-full"
                      value={form.reminder_webhook_url ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, reminder_webhook_url: e.target.value }))}
                      placeholder="https://n8n.example.com/webhook/send-reminder"
                    />
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={saveSmsSettings}
                      disabled={savingSmsSettings}
                      className="btn-primary text-sm flex items-center gap-2"
                    >
                      {savingSmsSettings ? (
                        <><span className="spinner w-4 h-4" /> Shranjevanje...</>
                      ) : (
                        <><Check size={14} strokeWidth={2} /> Shrani SMS nastavitve</>
                      )}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* ── SECTION 7: ACCOUNTING EXPORT ── */}
        <div className="card rounded-10 overflow-hidden border-l-4" style={{ borderLeftColor: '#16a34a' }}>
          <SectionHeader
            title={language === 'sl' ? 'Izvoz za računovodstvo' : 'Esportazione per contabilità'}
            open={openSection === 'export'}
            onToggle={() => toggleSection('export')}
          />
          {openSection === 'export' && (
            <div className="px-5 pb-6 space-y-5 border-t border-accent-soft pt-4">
              {/* Period selectors */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <FieldLabel text={language === 'sl' ? 'Mesec' : 'Mese'} />
                  <div className="relative">
                    <select
                      className="input-field w-full pr-9 appearance-none cursor-pointer"
                      value={exportMonth}
                      onChange={(e) => setExportMonth(parseInt(e.target.value, 10))}
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {String(m).padStart(2, '0')} — {EXPORT_MONTHS[language][m - 1]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={16}
                      strokeWidth={1.8}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel text={language === 'sl' ? 'Leto' : 'Anno'} />
                  <div className="relative">
                    <select
                      className="input-field w-full pr-9 appearance-none cursor-pointer"
                      value={exportYear}
                      onChange={(e) => setExportYear(parseInt(e.target.value, 10))}
                    >
                      {EXPORT_YEARS.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <ChevronDown
                      size={16}
                      strokeWidth={1.8}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                    />
                  </div>
                </div>
              </div>

              {/* Export buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleExportPartners}
                  disabled={exportingPartners}
                  className="btn-secondary text-sm flex items-center gap-2"
                >
                  {exportingPartners ? (
                    <><span className="spinner w-4 h-4" /> {t('common.loading')}</>
                  ) : (
                    <><Users size={15} strokeWidth={1.8} /> {language === 'sl' ? 'Izvozi partnerje' : 'Esporta partner'}</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleExportInvoices}
                  disabled={exportingInvoices}
                  className="btn-secondary text-sm flex items-center gap-2"
                >
                  {exportingInvoices ? (
                    <><span className="spinner w-4 h-4" /> {t('common.loading')}</>
                  ) : (
                    <><FileText size={15} strokeWidth={1.8} /> {language === 'sl' ? 'Izvozi račune' : 'Esporta fatture'}</>
                  )}
                </button>
              </div>

              <p className="text-xs text-text-muted">
                {language === 'sl'
                  ? `Datoteki: Archive1_${exportPeriodSuffix}.xlsx (partnerji), Archive2_${exportPeriodSuffix}.xlsx (računi)`
                  : `File: Archive1_${exportPeriodSuffix}.xlsx (partner), Archive2_${exportPeriodSuffix}.xlsx (fatture)`}
              </p>
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
