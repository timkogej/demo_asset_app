import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Eye, Send, Download, CheckCircle, AlertTriangle, X, FileText, Plus, Trash2,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { getSettings } from '../lib/settings';
import { clientDisplayName } from '../lib/clientHelpers';
import { checkVies, shouldUseReverseCharge } from '../lib/vies';
import {
  calculateInvoiceTotals,
  formatCurrency,
  formatDate,
  calculateDueDate,
  getItalianMonth,
} from '../lib/invoiceCalculations';
import { generateInvoicePDF } from '../lib/pdfGenerator';
import type {
  Language, InvoiceRecord, InvoiceStatus, InvoiceType,
  InvoiceItem, Client, Vehicle, Settings,
} from '../types';

interface InvoicesProps {
  t: (key: string) => string;
  language: Language;
}

// ---- badge helpers ----

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  sent: 'bg-amber-100 text-amber-700',
  paid: 'bg-accent-soft text-primary',
  cancelled: 'bg-red-100 text-red-600 line-through',
};

const TYPE_STYLES: Record<InvoiceType, string> = {
  monthly_rent: 'bg-primary/10 text-primary',
  deposit: 'bg-purple-100 text-purple-700',
  penalties: 'bg-red-100 text-red-600',
  insurance: 'bg-sky-100 text-sky-700',
  damage: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-100 text-gray-600',
};

function StatusBadge({ status, t }: { status: InvoiceStatus; t: (k: string) => string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status]}`}>
      {t(`inv.status_${status}`)}
    </span>
  );
}

function TypeBadge({ type, t }: { type: InvoiceType; t: (k: string) => string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_STYLES[type]}`}>
      {t(`inv.type_${type}`)}
    </span>
  );
}

// ---- form types ----

interface FormItem {
  id: string;
  code: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_type: 'item' | 'text' | 'space';
  show_translation: boolean;
}

interface FormSchedule {
  id: string;
  due_date: string;
  amount: number;
}

interface ManualForm {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceType: InvoiceType;
  servicePeriod: string;
  clientId: string;
  vehicleId: string;
  contractRefIt: string;
  contractRefSl: string;
  isReverseCharge: boolean;
  viesStatus: 'idle' | 'checking' | 'valid' | 'invalid' | 'not_applicable';
  dueDate: string;
  notes: string;
  items: FormItem[];
  usePaymentSchedule: boolean;
  paymentSchedules: FormSchedule[];
}

const BLANK_FORM: ManualForm = {
  invoiceNumber: '',
  invoiceDate: new Date().toISOString().split('T')[0],
  invoiceType: 'monthly_rent',
  servicePeriod: '',
  clientId: '',
  vehicleId: '',
  contractRefIt: '',
  contractRefSl: '',
  isReverseCharge: false,
  viesStatus: 'idle',
  dueDate: '',
  notes: '',
  items: [],
  usePaymentSchedule: false,
  paymentSchedules: [],
};

const INVOICE_TYPES: InvoiceType[] = [
  'monthly_rent', 'deposit', 'penalties', 'insurance', 'damage', 'other',
];

const INVOICE_STATUSES: InvoiceStatus[] = [
  'draft', 'confirmed', 'sent', 'paid', 'cancelled',
];

const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

function newItemId() {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---- main component ----

export default function Invoices({ t, language: _language }: InvoicesProps) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // data
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [filterYear, setFilterYear] = useState(currentYear);
  const [filterMonth, setFilterMonth] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<InvoiceType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // monthly generation
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResults, setGenerateResults] = useState<{
    created: number; skipped: number; errors: string[];
  } | null>(null);
  const [genMonth, setGenMonth] = useState(currentMonth);
  const [genYear, setGenYear] = useState(currentYear);

  // preview
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceRecord | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // send
  const [sendTarget, setSendTarget] = useState<InvoiceRecord | null>(null);
  const [sending, setSending] = useState(false);

  // cancel
  const [cancelTarget, setCancelTarget] = useState<InvoiceRecord | null>(null);

  // manual form
  const [showManualForm, setShowManualForm] = useState(false);
  const [formStep, setFormStep] = useState(1);
  const [form, setForm] = useState<ManualForm>(BLANK_FORM);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [formPdfUrl, setFormPdfUrl] = useState<string | null>(null);
  const [formPdfLoading, setFormPdfLoading] = useState(false);
  const viesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- fetch ----

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          client:clients(id, company_name, company_name_additional, email, country, tax_number, is_vat_payer),
          vehicle:vehicles(id, registration_number, vehicle_name, contract_number, lease_start_date)
        `)
        .order('invoice_sequence', { ascending: false });

      if (error) throw error;
      setInvoices((data as InvoiceRecord[]) || []);
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchClientsAndVehicles = useCallback(async () => {
    try {
      const [{ data: clientData }, { data: vehicleData }] = await Promise.all([
        supabase
          .from('clients')
          .select('id, company_name, company_name_additional, email, country, tax_number, is_vat_payer')
          .eq('is_client', true)
          .order('company_name', { ascending: true, nullsFirst: false }),
        supabase.from('vehicles').select('*, client:clients(id, company_name, company_name_additional, email, country, tax_number, is_vat_payer)').order('registration_number'),
      ]);
      setClients((clientData as Client[]) || []);
      setVehicles((vehicleData as Vehicle[]) || []);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
    fetchClientsAndVehicles();
  }, [fetchInvoices, fetchClientsAndVehicles]);

  // ---- filter ----

  const filtered = invoices.filter((inv) => {
    if (inv.invoice_year !== filterYear) return false;
    if (filterMonth !== '' && inv.billing_month !== filterMonth) return false;
    if (filterStatus !== 'all' && inv.status !== filterStatus) return false;
    if (filterType !== 'all' && inv.invoice_type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const clientName = inv.client ? clientDisplayName(inv.client as Client).toLowerCase() : '';
      const reg = inv.vehicle?.registration_number?.toLowerCase() || '';
      const num = inv.invoice_number.toLowerCase();
      if (!clientName.includes(q) && !reg.includes(q) && !num.includes(q)) return false;
    }
    return true;
  });

  // ---- KPI ----

  const thisMonthInvoices = invoices.filter(
    (inv) => inv.invoice_year === currentYear && inv.billing_month === currentMonth
  );
  const kpiTotal = thisMonthInvoices.reduce((s, i) => s + i.total, 0);
  const kpiPending = invoices
    .filter((i) => i.status === 'sent' || i.status === 'confirmed')
    .reduce((s, i) => s + i.total, 0);
  const kpiPaid = invoices
    .filter((i) => i.status === 'paid' && i.invoice_year === currentYear)
    .reduce((s, i) => s + i.total, 0);

  // ---- monthly generation ----

  async function handleGenerateMonthly() {
    setGenerating(true);
    try {
      const settings = await getSettings();
      const { data: activeVehicles } = await supabase
        .from('vehicles')
        .select('*, client:clients(*)')
        .eq('status', 'active')
        .not('client_id', 'is', null);

      const results = { created: 0, skipped: 0, errors: [] as string[] };

      for (const vehicle of (activeVehicles || [])) {
        // check existing
        const { data: existing } = await supabase
          .from('invoices')
          .select('id')
          .eq('vehicle_id', vehicle.id)
          .eq('invoice_year', genYear)
          .eq('billing_month', genMonth)
          .neq('status', 'cancelled')
          .maybeSingle();

        if (existing) { results.skipped++; continue; }

        // VIES check
        let isReverseCharge = false;
        const client = vehicle.client;
        if (client && client.country !== 'SI' && client.is_vat_payer && client.tax_number) {
          try {
            const viesResult = await checkVies(client.tax_number, client.country);
            isReverseCharge = shouldUseReverseCharge(client, viesResult.valid);
          } catch {
            isReverseCharge = false;
          }
        }

        // next invoice number
        const { data: numData, error: numErr } = await supabase
          .rpc('get_next_invoice_number', { p_year: genYear });
        if (numErr || !numData?.[0]) { results.errors.push(vehicle.registration_number); continue; }

        const invoiceDate = new Date(genYear, genMonth - 1, 1).toISOString().split('T')[0];
        const dueDays = settings?.payment_due_days ?? 30;
        const dueDate = calculateDueDate(invoiceDate, dueDays);
        const subtotal = vehicle.received_installment || 0;
        const vatRate = settings?.vat_rate ?? 22;
        const vatAmount = isReverseCharge ? 0 : Math.round(subtotal * vatRate) / 100;
        const servicePeriod = getItalianMonth(genMonth - 1, genYear);
        const contractRefDate = vehicle.lease_start_date || invoiceDate;
        const contractRefIt = `${settings?.contract_ref_it || ''} ${formatDate(contractRefDate)}`.trim();
        const contractRefSl = `${settings?.contract_ref_sl || ''} ${formatDate(contractRefDate)}`.trim();

        const invoiceRecord = {
          invoice_number: numData[0].invoice_number,
          invoice_year: genYear,
          invoice_sequence: numData[0].sequence_number,
          invoice_type: 'monthly_rent',
          client_id: vehicle.client_id,
          vehicle_id: vehicle.id,
          invoice_date: invoiceDate,
          service_period: servicePeriod,
          due_date: dueDate,
          contract_ref_date: contractRefDate,
          contract_ref_it: contractRefIt,
          contract_ref_sl: contractRefSl,
          subtotal,
          vat_rate: vatRate,
          vat_amount: vatAmount,
          total: subtotal + vatAmount,
          is_reverse_charge: isReverseCharge,
          status: 'draft',
          language: client?.country === 'SI' ? 'sl' : 'it',
          billing_month: genMonth,
        };

        const { data: newInv, error: invErr } = await supabase
          .from('invoices')
          .insert(invoiceRecord)
          .select()
          .single();

        if (invErr || !newInv) { results.errors.push(vehicle.registration_number); continue; }

        const rcText = isReverseCharge
          ? 'DDV v skladu S 1. Odstavkom 25. clena ZDDV-1 obracunan\nReverse Charge'
          : '';

        await supabase.from('invoice_items').insert([
          { invoice_id: newInv.id, sort_order: 0, description: contractRefIt, line_type: 'text', quantity: 1, unit_price: 0 },
          { invoice_id: newInv.id, sort_order: 1, description: contractRefSl, line_type: 'text', quantity: 1, unit_price: 0 },
          { invoice_id: newInv.id, sort_order: 2, description: 'NOLEGGIO LUNGO TERMINE', line_type: 'text', quantity: 1, unit_price: 0 },
          { invoice_id: newInv.id, sort_order: 3, description: vehicle.vehicle_name || '', line_type: 'text', quantity: 1, unit_price: 0 },
          { invoice_id: newInv.id, sort_order: 4, description: `TARGA ${vehicle.registration_number}`, line_type: 'text', quantity: 1, unit_price: 0 },
          { invoice_id: newInv.id, sort_order: 5, description: `CANONE MESE DI ${servicePeriod.toUpperCase()}`, line_type: 'item', quantity: 1, unit_price: subtotal },
          { invoice_id: newInv.id, sort_order: 6, description: rcText, line_type: 'text', quantity: 1, unit_price: 0 },
        ]);

        results.created++;
      }

      setShowGenerateConfirm(false);
      setGenerateResults(results);
      await fetchInvoices();
    } catch {
      toast.error(t('error.generate_failed'));
    } finally {
      setGenerating(false);
    }
  }

  // Track whether pdfBlobUrl is a local blob (needs revoke) or a signed URL (does not)
  const [previewIsBlob, setPreviewIsBlob] = useState(false);

  // ---- shared: fetch full invoice with all relations ----

  async function fetchFullInvoice(invoiceId: string): Promise<InvoiceRecord> {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        client:clients(
          id,
          company_name,
          company_name_additional,
          email,
          phone,
          address,
          postal_code,
          city,
          country,
          tax_number,
          registration_number,
          is_vat_payer
        ),
        vehicle:vehicles(
          id,
          registration_number,
          vehicle_name,
          lease_start_date
        ),
        items:invoice_items(*),
        payment_schedules:invoice_payment_schedules(*)
      `)
      .eq('id', invoiceId)
      .single();
    if (error || !data) throw new Error('Could not load invoice data');
    const fullInvoice = data as unknown as InvoiceRecord;
    if (fullInvoice.items) {
      fullInvoice.items.sort((a, b) => a.sort_order - b.sort_order);
    }
    if (fullInvoice.payment_schedules) {
      fullInvoice.payment_schedules.sort((a, b) =>
        new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      );
    }
    return fullInvoice;
  }

  // ---- preview ----

  async function openPreview(invoice: InvoiceRecord) {
    setPreviewInvoice(invoice);
    setPdfBlobUrl(null);
    setPdfLoading(true);
    try {
      // Always fetch fresh full invoice data so client/vehicle relations are complete
      const full = await fetchFullInvoice(invoice.id);
      const settings = await getSettings();
      const blob = await generateInvoicePDF(full, settings);
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
      setPreviewIsBlob(true);
    } catch {
      toast.error(t('error.pdf_failed'));
    } finally {
      setPdfLoading(false);
    }
  }

  function closePreview() {
    if (previewIsBlob && pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(null);
    setPreviewInvoice(null);
    setPreviewIsBlob(false);
  }

  // ---- download ----

  async function handleDownload(invoice: InvoiceRecord) {
    try {
      // Always fetch fresh full invoice data so client/vehicle relations are complete
      const full = await fetchFullInvoice(invoice.id);
      const settings = await getSettings();
      const blob = await generateInvoicePDF(full, settings);
      const filename = `Fattura_${invoice.invoice_number.replace('/', '-')}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('error.pdf_failed'));
    }
  }

  // ---- confirm invoice ----

  async function handleConfirm(invoice: InvoiceRecord) {
    try {
      await supabase
        .from('invoices')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('id', invoice.id);
      setInvoices((prev) =>
        prev.map((i) => (i.id === invoice.id ? { ...i, status: 'confirmed' } : i))
      );
      if (previewInvoice?.id === invoice.id) setPreviewInvoice({ ...invoice, status: 'confirmed' });
      toast.success(t('inv.confirm'));
    } catch {
      toast.error(t('error.save_failed'));
    }
  }

  // ---- send ----

  async function sendInvoiceById(invoiceId: string) {
    console.log('sendInvoiceById called', invoiceId);
    const settings = await getSettings();
    console.log('settings loaded', settings);
    console.log('webhook url:', settings?.n8n_webhook_url);

    if (!settings?.n8n_webhook_url) {
      toast.error('N8N Webhook URL non configurato / N8N Webhook URL ni nastavljen');
      return;
    }

    // Fetch fresh full invoice data so client/vehicle relations are complete
    const full = await fetchFullInvoice(invoiceId);

    // Generate & upload PDF
    const pdfBlob = await generateInvoicePDF(full, settings);
    const pdfPath = `invoices/${full.invoice_year}/${full.invoice_number.replace('/', '-')}.pdf`;

    const { error: uploadError } = await supabase.storage
      .from('invoice-pdfs')
      .upload(pdfPath, pdfBlob, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw uploadError;

    // Generate signed URL (1 hour — enough for n8n to download)
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('invoice-pdfs')
      .createSignedUrl(pdfPath, 3600);
    if (signedUrlError || !signedUrlData) throw new Error('Could not generate signed URL');
    const freshPdfUrl = signedUrlData.signedUrl;

    // Store both the path (permanent) and the signed URL (for display)
    await supabase.from('invoices').update({ pdf_path: pdfPath, pdf_url: freshPdfUrl }).eq('id', invoiceId);

    // Call n8n webhook
    if (!settings.n8n_webhook_url.includes('YOUR_WEBHOOK')) {
      const clientName = full.client ? clientDisplayName(full.client as Client) : '';
      const payload = {
        invoice_id: full.id,
        invoice_number: full.invoice_number,
        pdf_path: pdfPath, // storage path — n8n generates its own signed URL
        client_email: full.client?.email,
        client_name: clientName,
        vehicle_name: full.vehicle?.vehicle_name ?? '',
        registration_number: full.vehicle?.registration_number ?? '',
        total_amount: full.total,
        due_date: full.due_date ? formatDate(full.due_date) : '',
        language: full.language ?? 'it',
        service_period: full.service_period ?? '',
      };
      console.log('Sending webhook payload:', payload);
      try {
        const response = await fetch(settings.n8n_webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        console.log('Webhook response status:', response.status);
        let responseData: unknown;
        try { responseData = await response.json(); } catch { responseData = null; }
        console.log('Webhook response data:', responseData);
        if (!response.ok) {
          throw new Error(`Webhook failed: ${response.status}`);
        }
      } catch (error) {
        console.error('Webhook error:', error);
        toast.error('Errore invio / Napaka pošiljanja: ' + (error as Error).message);
        throw error;
      }
    }

    await supabase.from('invoices').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      sent_to_email: (full as InvoiceRecord).client?.email || null,
    }).eq('id', invoiceId);

    setInvoices((prev) =>
      prev.map((i) => (i.id === invoiceId ? { ...i, status: 'sent', pdf_path: pdfPath, pdf_url: freshPdfUrl } : i))
    );
  }

  async function handleSend() {
    if (!sendTarget) return;
    setSending(true);
    try {
      await sendInvoiceById(sendTarget.id);
      setSendTarget(null);
      toast.success(`${t('inv.send')} ✓`);
    } catch {
      toast.error(t('error.save_failed'));
    } finally {
      setSending(false);
    }
  }

  // ---- mark paid ----

  async function handleMarkPaid(invoice: InvoiceRecord) {
    try {
      await supabase
        .from('invoices')
        .update({ status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', invoice.id);
      setInvoices((prev) =>
        prev.map((i) => (i.id === invoice.id ? { ...i, status: 'paid' } : i))
      );
      toast.success(t('inv.mark_paid'));
    } catch {
      toast.error(t('error.save_failed'));
    }
  }

  // ---- cancel ----

  async function handleCancel() {
    if (!cancelTarget) return;
    try {
      await supabase
        .from('invoices')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', cancelTarget.id);
      setInvoices((prev) =>
        prev.map((i) => (i.id === cancelTarget.id ? { ...i, status: 'cancelled' } : i))
      );
      setCancelTarget(null);
      toast.success(t('inv.cancel'));
    } catch {
      toast.error(t('error.save_failed'));
    }
  }

  // ---- manual form ----

  async function initManualForm() {
    try {
      const settings = await getSettings();
      const { data: numRpcData, error: numRpcErr } = await supabase
        .rpc('get_next_invoice_number', { p_year: new Date().getFullYear() });
      if (numRpcErr) throw numRpcErr;
      const invNum = numRpcData?.[0]?.invoice_number || '';
      const today = new Date().toISOString().split('T')[0];
      const dueDate = calculateDueDate(today, settings?.payment_due_days ?? 30);
      setForm({
        ...BLANK_FORM,
        invoiceNumber: invNum,
        invoiceDate: today,
        dueDate,
        contractRefIt: settings?.contract_ref_it || '',
        contractRefSl: settings?.contract_ref_sl || '',
        servicePeriod: getItalianMonth(new Date().getMonth(), currentYear),
        items: buildDefaultItems('monthly_rent', '', '', '', '', 0, false, ''),
      });
      setFormStep(1);
      setFormPdfUrl(null);
    } catch {
      toast.error(t('error.fetch_failed'));
    }
  }

  function buildDefaultItems(
    type: InvoiceType,
    contractRefIt: string,
    contractRefSl: string,
    vehicleName: string,
    regNumber: string,
    unitPrice: number,
    isRC: boolean,
    servicePeriod: string
  ): FormItem[] {
    if (type === 'monthly_rent') {
      return [
        { id: newItemId(), code: '', description: contractRefIt, quantity: 1, unit_price: 0, line_type: 'text', show_translation: true },
        { id: newItemId(), code: '', description: contractRefSl, quantity: 1, unit_price: 0, line_type: 'text', show_translation: true },
        { id: newItemId(), code: '', description: 'NOLEGGIO LUNGO TERMINE', quantity: 1, unit_price: 0, line_type: 'text', show_translation: true },
        { id: newItemId(), code: '', description: vehicleName, quantity: 1, unit_price: 0, line_type: 'text', show_translation: true },
        { id: newItemId(), code: '', description: regNumber ? `TARGA ${regNumber}` : '', quantity: 1, unit_price: 0, line_type: 'text', show_translation: true },
        { id: newItemId(), code: '', description: servicePeriod ? `CANONE MESE DI ${servicePeriod.toUpperCase()}` : 'CANONE MENSILE', quantity: 1, unit_price: unitPrice, line_type: 'item', show_translation: true },
        { id: newItemId(), code: '', description: isRC ? 'DDV v skladu S 1. Odstavkom 25. clena ZDDV-1 obracunan\nReverse Charge' : '', quantity: 1, unit_price: 0, line_type: 'text', show_translation: true },
      ];
    }
    if (type === 'deposit') {
      return [
        { id: newItemId(), code: '', description: 'ANTICIPO CONTRATTUALE', quantity: 1, unit_price: unitPrice, line_type: 'item', show_translation: true },
      ];
    }
    if (type === 'penalties') {
      return [
        { id: newItemId(), code: '', description: 'ADDEBITO CONTRAVVENZIONI', quantity: 1, unit_price: unitPrice, line_type: 'item', show_translation: true },
      ];
    }
    if (type === 'insurance') {
      return [
        { id: newItemId(), code: '', description: 'ADDEBITO ASSICURAZIONE', quantity: 1, unit_price: unitPrice, line_type: 'item', show_translation: true },
      ];
    }
    if (type === 'damage') {
      return [
        { id: newItemId(), code: '', description: 'RISARCIMENTO DANNI', quantity: 1, unit_price: unitPrice, line_type: 'item', show_translation: true },
      ];
    }
    return [];
  }

  function handleClientSelect(clientId: string) {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;
    const clientVehicles = vehicles.filter((v) => v.client_id === clientId);
    setFilteredVehicles(clientVehicles);
    setForm((f) => ({ ...f, clientId, vehicleId: '', isReverseCharge: false, viesStatus: 'idle' }));

    // VIES check
    if (client.country !== 'SI' && client.is_vat_payer && client.tax_number) {
      if (viesTimerRef.current) clearTimeout(viesTimerRef.current);
      setForm((f) => ({ ...f, viesStatus: 'checking' }));
      viesTimerRef.current = setTimeout(async () => {
        try {
          const result = await checkVies(client.tax_number!, client.country!);
          const rc = shouldUseReverseCharge(client, result.valid);
          setForm((f) => ({
            ...f,
            viesStatus: result.valid ? 'valid' : 'invalid',
            isReverseCharge: rc,
          }));
        } catch {
          setForm((f) => ({ ...f, viesStatus: 'invalid' }));
        }
      }, 500);
    } else {
      setForm((f) => ({ ...f, viesStatus: 'not_applicable' }));
    }
  }

  function handleVehicleSelect(vehicleId: string) {
    const vehicle = vehicles.find((v) => v.id === vehicleId);
    if (!vehicle) return;
    const unitPrice = vehicle.received_installment || 0;
    const settings_contract_it = form.contractRefIt;
    const settings_contract_sl = form.contractRefSl;
    const refDate = vehicle.lease_start_date || form.invoiceDate;
    const contractRefIt = `${settings_contract_it} ${formatDate(refDate)}`.trim();
    const contractRefSl = `${settings_contract_sl} ${formatDate(refDate)}`.trim();
    setForm((f) => ({
      ...f,
      vehicleId,
      items: buildDefaultItems(
        f.invoiceType, contractRefIt, contractRefSl,
        vehicle.vehicle_name || '', vehicle.registration_number,
        unitPrice, f.isReverseCharge, f.servicePeriod
      ),
    }));
  }

  function handleTypeChange(type: InvoiceType) {
    const vehicle = vehicles.find((v) => v.id === form.vehicleId);
    const unitPrice = vehicle?.received_installment || 0;
    setForm((f) => ({
      ...f,
      invoiceType: type,
      items: buildDefaultItems(
        type, f.contractRefIt, f.contractRefSl,
        vehicle?.vehicle_name || '', vehicle?.registration_number || '',
        unitPrice, f.isReverseCharge, f.servicePeriod
      ),
    }));
  }

  // live totals
  const formItems = form.items.map((i) => ({
    ...i, id: i.id, invoice_id: '', sort_order: 0, code: i.code || null, total: i.quantity * i.unit_price,
    line_type: i.line_type, show_translation: i.show_translation,
  } as InvoiceItem));

  const getFormSettings = async (): Promise<Settings> => getSettings();

  const formTotals = calculateInvoiceTotals(formItems, 22, form.isReverseCharge);

  async function goToStep3() {
    setFormStep(3);
    setFormPdfUrl(null);
    setFormPdfLoading(true);
    try {
      const settings = await getFormSettings();
      const client = clients.find((c) => c.id === form.clientId) || null;
      const vehicle = vehicles.find((v) => v.id === form.vehicleId) || null;
      const fakeInvoice: InvoiceRecord = {
        id: 'preview',
        invoice_number: form.invoiceNumber,
        invoice_year: currentYear,
        invoice_sequence: 0,
        invoice_type: form.invoiceType,
        client_id: form.clientId || null,
        vehicle_id: form.vehicleId || null,
        invoice_date: form.invoiceDate,
        service_date: null,
        service_period: form.servicePeriod,
        due_date: form.dueDate,
        contract_ref_date: null,
        contract_ref_it: form.contractRefIt,
        contract_ref_sl: form.contractRefSl,
        subtotal: formTotals.subtotal,
        vat_rate: settings?.vat_rate ?? 22,
        vat_amount: formTotals.vatAmount,
        total: formTotals.total,
        is_reverse_charge: form.isReverseCharge,
        vat_exempt_reason: null,
        status: 'draft',
        sent_at: null,
        sent_to_email: null,
        pdf_url: null,
        pdf_path: null,
        language: client?.country === 'SI' ? 'sl' : 'it',
        notes: form.notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        billing_month: null,
        client: client as Client,
        vehicle: vehicle as Vehicle,
        items: formItems,
        payment_schedules: form.usePaymentSchedule
          ? form.paymentSchedules.map((s) => ({
              id: s.id, invoice_id: 'preview', due_date: s.due_date,
              amount: s.amount, is_paid: false, paid_at: null, notes: null,
            }))
          : [],
      };
      const blob = await generateInvoicePDF(fakeInvoice, settings);
      const url = URL.createObjectURL(blob);
      setFormPdfUrl(url);
    } catch {
      toast.error(t('error.pdf_failed'));
    } finally {
      setFormPdfLoading(false);
    }
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    try {
      const settings = await getFormSettings();
      const { data: numData, error: numErr } = await supabase
        .rpc('get_next_invoice_number', { p_year: new Date().getFullYear() });
      if (numErr) throw numErr;
      const invoiceNumber = numData?.[0]?.invoice_number;
      const sequenceNumber = numData?.[0]?.sequence_number;
      const invoiceRecord = {
        invoice_number: form.invoiceNumber || invoiceNumber,
        invoice_year: currentYear,
        invoice_sequence: sequenceNumber || 0,
        invoice_type: form.invoiceType,
        client_id: form.clientId || null,
        vehicle_id: form.vehicleId || null,
        invoice_date: form.invoiceDate,
        service_period: form.servicePeriod,
        due_date: form.dueDate,
        contract_ref_it: form.contractRefIt,
        contract_ref_sl: form.contractRefSl,
        subtotal: formTotals.subtotal,
        vat_rate: settings?.vat_rate ?? 22,
        vat_amount: formTotals.vatAmount,
        total: formTotals.total,
        is_reverse_charge: form.isReverseCharge,
        status: 'draft',
        language: (clients.find((c) => c.id === form.clientId)?.country === 'SI') ? 'sl' : 'it',
        notes: form.notes,
        billing_month: null,
      };

      const { data: newInv, error } = await supabase
        .from('invoices')
        .insert(invoiceRecord)
        .select()
        .single();

      if (error) throw error;

      await supabase.from('invoice_items').insert(
        form.items.map((item, i) => ({
          invoice_id: newInv.id,
          sort_order: i,
          description: item.description,
          line_type: item.line_type,
          quantity: item.quantity,
          unit_price: item.unit_price,
          show_translation: item.show_translation,
        }))
      );

      if (form.usePaymentSchedule && form.paymentSchedules.length > 0) {
        await supabase.from('invoice_payment_schedules').insert(
          form.paymentSchedules.map((s) => ({
            invoice_id: newInv.id,
            due_date: s.due_date,
            amount: s.amount,
            is_paid: false,
          }))
        );
      }

      closeManualForm();
      await fetchInvoices();
      toast.success(t('inv.save_draft'));
    } catch {
      toast.error(t('error.save_failed'));
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleSaveAndSend() {
    setSavingDraft(true);
    try {
      const settings = await getFormSettings();
      const { data: numData, error: numErr } = await supabase
        .rpc('get_next_invoice_number', { p_year: new Date().getFullYear() });
      if (numErr) throw numErr;
      const invoiceNumber = numData?.[0]?.invoice_number;
      const sequenceNumber = numData?.[0]?.sequence_number;
      const invoiceRecord = {
        invoice_number: form.invoiceNumber || invoiceNumber,
        invoice_year: currentYear,
        invoice_sequence: sequenceNumber || 0,
        invoice_type: form.invoiceType,
        client_id: form.clientId || null,
        vehicle_id: form.vehicleId || null,
        invoice_date: form.invoiceDate,
        service_period: form.servicePeriod,
        due_date: form.dueDate,
        contract_ref_it: form.contractRefIt,
        contract_ref_sl: form.contractRefSl,
        subtotal: formTotals.subtotal,
        vat_rate: settings?.vat_rate ?? 22,
        vat_amount: formTotals.vatAmount,
        total: formTotals.total,
        is_reverse_charge: form.isReverseCharge,
        status: 'confirmed',
        language: (clients.find((c) => c.id === form.clientId)?.country === 'SI') ? 'sl' : 'it',
        notes: form.notes,
        billing_month: null,
      };

      const { data: newInv, error } = await supabase
        .from('invoices')
        .insert(invoiceRecord)
        .select()
        .single();
      if (error) throw error;

      await supabase.from('invoice_items').insert(
        form.items.map((item, i) => ({
          invoice_id: newInv.id,
          sort_order: i,
          description: item.description,
          line_type: item.line_type,
          quantity: item.quantity,
          unit_price: item.unit_price,
          show_translation: item.show_translation,
        }))
      );

      if (form.usePaymentSchedule && form.paymentSchedules.length > 0) {
        await supabase.from('invoice_payment_schedules').insert(
          form.paymentSchedules.map((s) => ({
            invoice_id: newInv.id,
            due_date: s.due_date,
            amount: s.amount,
            is_paid: false,
          }))
        );
      }

      await sendInvoiceById(newInv.id);
      closeManualForm();
      await fetchInvoices();
      toast.success(`${t('inv.send')} ✓`);
    } catch {
      toast.error(t('error.save_failed'));
    } finally {
      setSavingDraft(false);
    }
  }

  function closeManualForm() {
    if (formPdfUrl) URL.revokeObjectURL(formPdfUrl);
    setFormPdfUrl(null);
    setShowManualForm(false);
    setForm(BLANK_FORM);
    setFormStep(1);
  }

  const years = [currentYear - 1, currentYear, currentYear + 1];

  // ---- render ----

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* ---- Top bar ---- */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="page-title flex-1 min-w-0">{t('inv.title')}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Year */}
          <select
            value={filterYear}
            onChange={(e) => setFilterYear(Number(e.target.value))}
            className="input-field py-1.5 text-sm"
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {/* Month */}
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value === '' ? '' : Number(e.target.value))}
            className="input-field py-1.5 text-sm"
          >
            <option value="">— {t('common.filter')} —</option>
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as InvoiceStatus | 'all')}
            className="input-field py-1.5 text-sm"
          >
            <option value="all">{t('common.filter')} status</option>
            {INVOICE_STATUSES.map((s) => (
              <option key={s} value={s}>{t(`inv.status_${s}`)}</option>
            ))}
          </select>
          {/* Search */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('common.search')}
            className="input-field py-1.5 text-sm min-w-[180px]"
          />
          {/* Actions */}
          <button
            onClick={() => { setShowManualForm(true); initManualForm(); }}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <Plus size={15} />
            {t('inv.new_manual')}
          </button>
          <button
            onClick={() => setShowGenerateConfirm(true)}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <FileText size={15} />
            {t('inv.generate_monthly')}
          </button>
        </div>
      </div>

      {/* ---- Type filter pills ---- */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterType === 'all' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Tutti
        </button>
        {INVOICE_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filterType === type ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {t(`inv.type_${type}`)}
          </button>
        ))}
      </div>

      {/* ---- KPI Cards ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">Totale mese corrente</p>
          {loading ? (
            <div className="h-8 w-24 bg-gray-100 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-text-dark">€ {formatCurrency(kpiTotal)}</p>
          )}
        </div>
        <div className="card p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">Da incassare</p>
          {loading ? (
            <div className="h-8 w-24 bg-gray-100 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-amber-600">€ {formatCurrency(kpiPending)}</p>
          )}
        </div>
        <div className="card p-4">
          <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">Incassato ({currentYear})</p>
          {loading ? (
            <div className="h-8 w-24 bg-gray-100 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-accent">€ {formatCurrency(kpiPaid)}</p>
          )}
        </div>
      </div>

      {/* ---- Table ---- */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted gap-3">
            <FileText size={40} strokeWidth={1.2} />
            <p className="text-sm">{t('inv.no_invoices')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">{t('inv.number')}</th>
                  <th className="table-header">{t('inv.date')}</th>
                  <th className="table-header">{t('inv.client')}</th>
                  <th className="table-header">{t('inv.vehicle')}</th>
                  <th className="table-header">{t('inv.type')}</th>
                  <th className="table-header text-right">{t('inv.subtotal')}</th>
                  <th className="table-header text-right">{t('inv.vat')}</th>
                  <th className="table-header text-right">{t('inv.total')}</th>
                  <th className="table-header">{t('inv.status')}</th>
                  <th className="table-header">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr
                    key={inv.id}
                    className={`table-row ${inv.status === 'cancelled' ? 'opacity-50' : ''}`}
                  >
                    <td className="table-cell">
                      <span className={`font-mono font-bold text-primary ${inv.status === 'cancelled' ? 'line-through' : ''}`}>
                        {inv.invoice_number}
                      </span>
                    </td>
                    <td className="table-cell text-sm text-text-muted">{formatDate(inv.invoice_date)}</td>
                    <td className="table-cell text-sm">
                      {inv.client ? clientDisplayName(inv.client as Client) : '—'}
                    </td>
                    <td className="table-cell">
                      {inv.vehicle ? (
                        <span className="font-mono text-xs">{inv.vehicle.registration_number}</span>
                      ) : '—'}
                    </td>
                    <td className="table-cell">
                      <TypeBadge type={inv.invoice_type} t={t} />
                    </td>
                    <td className="table-cell text-right text-sm">€ {formatCurrency(inv.subtotal)}</td>
                    <td className="table-cell text-right text-sm">
                      {inv.is_reverse_charge ? (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-medium">RC</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 font-medium">{inv.vat_rate}%</span>
                      )}
                    </td>
                    <td className="table-cell text-right font-semibold text-sm">€ {formatCurrency(inv.total)}</td>
                    <td className="table-cell">
                      <StatusBadge status={inv.status} t={t} />
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openPreview(inv)}
                          className="p-1.5 rounded hover:bg-accent-soft text-text-muted hover:text-primary transition-colors"
                          title={t('inv.preview')}
                        >
                          <Eye size={15} strokeWidth={1.8} />
                        </button>
                        {(inv.status === 'draft' || inv.status === 'confirmed') && (
                          <button
                            onClick={() => setSendTarget(inv)}
                            className="p-1.5 rounded hover:bg-accent-soft text-text-muted hover:text-primary transition-colors"
                            title={t('inv.send')}
                          >
                            <Send size={15} strokeWidth={1.8} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(inv)}
                          className="p-1.5 rounded hover:bg-accent-soft text-text-muted hover:text-primary transition-colors"
                          title={t('inv.download')}
                        >
                          <Download size={15} strokeWidth={1.8} />
                        </button>
                        {inv.status === 'sent' && (
                          <button
                            onClick={() => handleMarkPaid(inv)}
                            className="p-1.5 rounded hover:bg-accent-soft text-text-muted hover:text-accent transition-colors"
                            title={t('inv.mark_paid')}
                          >
                            <CheckCircle size={15} strokeWidth={1.8} />
                          </button>
                        )}
                        {(inv.status === 'draft' || inv.status === 'confirmed') && (
                          <button
                            onClick={() => setCancelTarget(inv)}
                            className="p-1.5 rounded hover:bg-red-50 text-text-muted hover:text-danger transition-colors"
                            title={t('inv.cancel')}
                          >
                            <X size={15} strokeWidth={1.8} />
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

      {/* ===== MODALS ===== */}

      {/* ---- Generate confirm modal ---- */}
      {showGenerateConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowGenerateConfirm(false)}>
          <div className="bg-white rounded-10 shadow-xl p-6 max-w-sm w-full animate-slideIn" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title mb-2">
              {t('inv.generate_monthly')}
            </h3>
            <div className="flex gap-3 mb-4">
              <select
                value={genMonth}
                onChange={(e) => setGenMonth(Number(e.target.value))}
                className="input-field flex-1"
              >
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
              <select
                value={genYear}
                onChange={(e) => setGenYear(Number(e.target.value))}
                className="input-field flex-1"
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <p className="text-sm text-text-muted mb-1">
              Generare le fatture per <strong>{MONTHS[genMonth - 1]} {genYear}</strong>?
            </p>
            <p className="text-xs text-text-muted mb-4">
              Verranno create fatture per tutti i veicoli attivi.<br />
              I veicoli che hanno già una fattura per questo mese verranno saltati.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowGenerateConfirm(false)} className="btn-secondary">
                {t('btn.cancel')}
              </button>
              <button onClick={handleGenerateMonthly} disabled={generating} className="btn-primary">
                {generating ? t('inv.generating') : 'Genera'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Generate results modal ---- */}
      {generateResults && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setGenerateResults(null)}>
          <div className="bg-white rounded-10 shadow-xl p-6 max-w-sm w-full animate-slideIn" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title mb-4">{t('inv.monthly_generated')}</h3>
            <div className="space-y-2 text-sm mb-5">
              <p>✅ {t('inv.monthly_generated')} <strong>{generateResults.created}</strong></p>
              <p>⏭ Già esistenti: <strong>{generateResults.skipped}</strong></p>
              <p>❌ Errori: <strong>{generateResults.errors.length}</strong>
                {generateResults.errors.length > 0 && (
                  <span className="text-xs text-text-muted ml-1">({generateResults.errors.join(', ')})</span>
                )}
              </p>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setGenerateResults(null)} className="btn-primary">
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Send confirm modal ---- */}
      {sendTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !sending && setSendTarget(null)}>
          <div className="bg-white rounded-10 shadow-xl p-6 max-w-sm w-full animate-slideIn" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title mb-3">{t('inv.send')}</h3>
            <p className="text-sm text-text-muted mb-1">
              {t('inv.confirm_send').replace('{email}', sendTarget.client?.email || '—')}
            </p>
            <p className="text-sm font-semibold text-text-dark mb-4">
              {sendTarget.invoice_number} — € {formatCurrency(sendTarget.total)}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setSendTarget(null)} disabled={sending} className="btn-secondary">
                {t('btn.cancel')}
              </button>
              <button onClick={handleSend} disabled={sending} className="btn-primary">
                {sending ? t('inv.sending') : t('inv.send')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Cancel confirm modal ---- */}
      {cancelTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setCancelTarget(null)}>
          <div className="bg-white rounded-10 shadow-xl p-6 max-w-sm w-full animate-slideIn" onClick={(e) => e.stopPropagation()}>
            <h3 className="section-title mb-3">{t('inv.cancel')}</h3>
            <p className="text-sm text-text-muted mb-1">{t('inv.confirm_cancel')}</p>
            <p className="text-sm font-semibold text-text-dark mb-4">{cancelTarget.invoice_number}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setCancelTarget(null)} className="btn-secondary">{t('btn.cancel')}</button>
              <button onClick={handleCancel} className="btn-danger">{t('inv.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- PDF Preview modal ---- */}
      {previewInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closePreview}>
          <div
            className="bg-white rounded-10 shadow-2xl flex flex-col animate-slideIn"
            style={{ maxWidth: 800, width: '100%', height: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-accent-soft">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-primary">{previewInvoice.invoice_number}</span>
                <StatusBadge status={previewInvoice.status} t={t} />
              </div>
              <button onClick={closePreview} className="p-1.5 rounded hover:bg-accent-soft text-text-muted">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              {pdfLoading ? (
                <div className="h-full flex items-center justify-center">
                  <span className="spinner" />
                </div>
              ) : pdfBlobUrl ? (
                <iframe src={pdfBlobUrl} className="w-full h-full" title="Invoice Preview" />
              ) : (
                <div className="h-full flex items-center justify-center text-text-muted text-sm">
                  {t('error.pdf_failed')}
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-accent-soft">
              <button onClick={closePreview} className="btn-secondary text-sm">{t('common.close')}</button>
              <button onClick={() => handleDownload(previewInvoice)} className="btn-secondary text-sm">
                <Download size={14} className="inline mr-1" />
                {t('inv.download')}
              </button>
              {previewInvoice.status === 'draft' && (
                <button onClick={() => handleConfirm(previewInvoice)} className="btn-primary text-sm">
                  {t('inv.confirm')}
                </button>
              )}
              {(previewInvoice.status === 'draft' || previewInvoice.status === 'confirmed') && (
                <button onClick={() => { closePreview(); setSendTarget(previewInvoice); }} className="btn-primary text-sm">
                  {t('inv.send')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Manual Invoice Form modal ---- */}
      {showManualForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeManualForm}>
          <div
            className="bg-white rounded-10 shadow-2xl flex flex-col animate-slideIn w-full overflow-hidden"
            style={{ maxWidth: 860, maxHeight: '95vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-accent-soft flex-shrink-0">
              <div className="flex items-center gap-4">
                <h3 className="section-title">{t('inv.new_manual')}</h3>
                <div className="flex gap-1">
                  {[1, 2, 3].map((s) => (
                    <div key={s} className={`w-6 h-1.5 rounded-full transition-colors ${formStep >= s ? 'bg-primary' : 'bg-gray-200'}`} />
                  ))}
                </div>
              </div>
              <button onClick={closeManualForm} className="p-1.5 rounded hover:bg-accent-soft text-text-muted">
                <X size={18} />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5 min-h-0">
              {/* ---- Step 1 ---- */}
              {formStep === 1 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Left column */}
                  <div className="space-y-4">
                    <div>
                      <label className="label">{t('inv.number')}</label>
                      <input value={form.invoiceNumber} readOnly className="input-field bg-gray-50 cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="label">{t('inv.date')}</label>
                      <input
                        type="date"
                        value={form.invoiceDate}
                        onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label">{t('inv.type')}</label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {INVOICE_TYPES.map((type) => (
                          <button
                            key={type}
                            onClick={() => handleTypeChange(type)}
                            className={`px-3 py-1.5 rounded-10 text-xs font-medium border transition-colors ${form.invoiceType === type ? 'bg-primary text-white border-primary' : 'border-accent-muted text-text-muted hover:border-primary hover:text-primary'}`}
                          >
                            {t(`inv.type_${type}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="label">{t('inv.period')}</label>
                      <input
                        value={form.servicePeriod}
                        onChange={(e) => setForm((f) => ({ ...f, servicePeriod: e.target.value }))}
                        className="input-field"
                        placeholder="e.g. Marzo 2026"
                      />
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="space-y-4">
                    <div>
                      <label className="label">{t('inv.client')}</label>
                      <select
                        value={form.clientId}
                        onChange={(e) => handleClientSelect(e.target.value)}
                        className="input-field"
                      >
                        <option value="">— seleziona cliente —</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            [{c.id}] {clientDisplayName(c)}
                          </option>
                        ))}
                      </select>
                      {/* VIES status */}
                      {form.clientId && form.viesStatus !== 'idle' && (
                        <div className="mt-1 text-xs flex items-center gap-1">
                          {form.viesStatus === 'checking' && (
                            <>
                              <span className="spinner w-3 h-3" />
                              <span className="text-text-muted">{t('inv.vies_checking')}</span>
                            </>
                          )}
                          {form.viesStatus === 'valid' && (
                            <>
                              <CheckCircle size={13} strokeWidth={1.8} className="text-green-600" />
                              <span className="text-green-600">VIES valido → Reverse Charge</span>
                            </>
                          )}
                          {form.viesStatus === 'invalid' && (
                            <>
                              <AlertTriangle size={13} strokeWidth={1.8} className="text-amber-600" />
                              <span className="text-amber-600">VIES non valido → IVA 22%</span>
                            </>
                          )}
                          {form.viesStatus === 'not_applicable' && (
                            <span className="text-text-muted">Cliente nazionale → IVA 22%</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="label">{t('inv.vehicle')}</label>
                      <select
                        value={form.vehicleId}
                        onChange={(e) => handleVehicleSelect(e.target.value)}
                        className="input-field"
                        disabled={!form.clientId}
                      >
                        <option value="">— seleziona veicolo —</option>
                        {filteredVehicles.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.registration_number} {v.vehicle_name ? `— ${v.vehicle_name}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">{t('inv.contract_ref')} (IT)</label>
                      <input
                        value={form.contractRefIt}
                        onChange={(e) => setForm((f) => ({ ...f, contractRefIt: e.target.value }))}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="label">{t('inv.contract_ref')} (SL)</label>
                      <input
                        value={form.contractRefSl}
                        onChange={(e) => setForm((f) => ({ ...f, contractRefSl: e.target.value }))}
                        className="input-field"
                      />
                    </div>
                    {/* RC badge */}
                    <div className="flex items-center gap-2">
                      {form.isReverseCharge ? (
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                          {t('inv.reverse_charge')}
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                          IVA 22%
                        </span>
                      )}
                      {form.isReverseCharge && (
                        <span className="text-xs text-text-muted">Cliente estero + soggetto IVA + VIES valido</span>
                      )}
                    </div>
                    <div>
                      <label className="label">{t('inv.due_date')}</label>
                      <input
                        type="date"
                        value={form.dueDate}
                        onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ---- Step 2 ---- */}
              {formStep === 2 && (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-accent-soft">
                          <th className="text-left py-2 pr-2 text-xs font-medium text-text-muted w-6">#</th>
                          <th className="text-left py-2 pr-2 text-xs font-medium text-text-muted">{t('inv.description')}</th>
                          <th className="text-center py-2 pr-2 text-xs font-medium text-text-muted w-16">{t('inv.quantity')}</th>
                          <th className="text-right py-2 pr-2 text-xs font-medium text-text-muted w-24">{t('inv.unit_price')}</th>
                          <th className="text-right py-2 pr-2 text-xs font-medium text-text-muted w-24">{t('inv.item_total')}</th>
                          <th className="text-center py-2 pr-2 text-xs font-medium text-text-muted w-20">Tipo</th>
                          <th className="text-center py-2 pr-2 text-xs font-medium text-text-muted w-8" title="Mostra traduzione / Pokazi prevod">TR</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {form.items.map((item, idx) => (
                          <tr key={item.id} className="border-b border-gray-50">
                            <td className="py-1.5 pr-2 text-text-muted text-xs">{idx + 1}</td>
                            <td className="py-1.5 pr-2">
                              <textarea
                                value={item.description}
                                onChange={(e) => setForm((f) => ({
                                  ...f,
                                  items: f.items.map((i) => i.id === item.id ? { ...i, description: e.target.value } : i),
                                }))}
                                rows={1}
                                className="input-field py-1 text-sm w-full resize-none"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              {item.line_type === 'item' ? (
                                <input
                                  type="number"
                                  value={item.quantity}
                                  min={1}
                                  onChange={(e) => setForm((f) => ({
                                    ...f,
                                    items: f.items.map((i) => i.id === item.id ? { ...i, quantity: Number(e.target.value) } : i),
                                  }))}
                                  className="input-field py-1 text-sm text-center w-full"
                                />
                              ) : <span className="text-xs text-text-muted text-center block">—</span>}
                            </td>
                            <td className="py-1.5 pr-2">
                              {item.line_type === 'item' ? (
                                <input
                                  type="number"
                                  value={item.unit_price}
                                  step={0.01}
                                  onChange={(e) => setForm((f) => ({
                                    ...f,
                                    items: f.items.map((i) => i.id === item.id ? { ...i, unit_price: Number(e.target.value) } : i),
                                  }))}
                                  className="input-field py-1 text-sm text-right w-full"
                                />
                              ) : <span className="text-xs text-text-muted text-right block">—</span>}
                            </td>
                            <td className="py-1.5 pr-2 text-right text-sm text-text-muted">
                              {item.line_type === 'item' ? `€ ${formatCurrency(item.quantity * item.unit_price)}` : '—'}
                            </td>
                            <td className="py-1.5 pr-2">
                              <select
                                value={item.line_type}
                                onChange={(e) => setForm((f) => ({
                                  ...f,
                                  items: f.items.map((i) => i.id === item.id ? { ...i, line_type: e.target.value as FormItem['line_type'] } : i),
                                }))}
                                className="input-field py-1 text-xs"
                              >
                                <option value="item">Item</option>
                                <option value="text">Testo</option>
                                <option value="space">Spazio</option>
                              </select>
                            </td>
                            <td className="py-1.5 pr-2 text-center">
                              {(item.line_type === 'item' || item.line_type === 'text') && (
                                <button
                                  type="button"
                                  title={item.show_translation ? 'Nascondi traduzione / Skrij prevod' : 'Mostra traduzione / Pokazi prevod'}
                                  onClick={() => setForm((f) => ({
                                    ...f,
                                    items: f.items.map((i) => i.id === item.id ? { ...i, show_translation: !i.show_translation } : i),
                                  }))}
                                  className={`p-1 rounded text-xs font-medium transition-colors ${
                                    item.show_translation
                                      ? 'bg-primary/10 text-primary'
                                      : 'bg-gray-100 text-text-muted'
                                  }`}
                                >
                                  {item.show_translation ? '🌐' : '—'}
                                </button>
                              )}
                            </td>
                            <td className="py-1.5">
                              <div className="flex flex-col gap-0.5">
                                <button
                                  onClick={() => setForm((f) => {
                                    const items = [...f.items];
                                    if (idx === 0) return f;
                                    [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
                                    return { ...f, items };
                                  })}
                                  className="p-0.5 text-text-muted hover:text-primary"
                                  disabled={idx === 0}
                                >
                                  <ChevronUp size={12} />
                                </button>
                                <button
                                  onClick={() => setForm((f) => {
                                    const items = [...f.items];
                                    if (idx === items.length - 1) return f;
                                    [items[idx + 1], items[idx]] = [items[idx], items[idx + 1]];
                                    return { ...f, items };
                                  })}
                                  className="p-0.5 text-text-muted hover:text-primary"
                                  disabled={idx === form.items.length - 1}
                                >
                                  <ChevronDown size={12} />
                                </button>
                              </div>
                            </td>
                            <td className="py-1.5">
                              <button
                                onClick={() => setForm((f) => ({ ...f, items: f.items.filter((i) => i.id !== item.id) }))}
                                className="p-1 text-text-muted hover:text-danger transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={() => setForm((f) => ({
                      ...f,
                      items: [...f.items, { id: newItemId(), code: '', description: '', quantity: 1, unit_price: 0, line_type: 'item', show_translation: true }],
                    }))}
                    className="btn-secondary text-sm flex items-center gap-1.5"
                  >
                    <Plus size={14} />
                    {t('inv.add_item')}
                  </button>

                  {/* Live totals bar */}
                  <div className="sticky bottom-0 bg-white border-t border-accent-soft -mx-5 px-5 py-3 flex items-center justify-end gap-6 text-sm">
                    <span className="text-text-muted">
                      {t('inv.subtotal')}: <strong className="text-text-dark">€ {formatCurrency(formTotals.subtotal)}</strong>
                    </span>
                    <span className="text-text-muted">
                      {form.isReverseCharge ? t('inv.reverse_charge') : `IVA ${22}%`}:{' '}
                      <strong className="text-text-dark">€ {formatCurrency(formTotals.vatAmount)}</strong>
                    </span>
                    <span className="text-text-muted">
                      {t('inv.total')}: <strong className="text-primary text-base">€ {formatCurrency(formTotals.total)}</strong>
                    </span>
                  </div>

                  {/* Payment schedule */}
                  {(form.invoiceType === 'insurance' || form.invoiceType === 'deposit') && (
                    <div className="border-t border-accent-soft pt-4">
                      <div className="flex items-center gap-3 mb-3">
                        <label className="section-title text-sm">{t('inv.payment_schedule')}</label>
                        <button
                          onClick={() => setForm((f) => ({ ...f, usePaymentSchedule: !f.usePaymentSchedule }))}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.usePaymentSchedule ? 'bg-primary' : 'bg-gray-200'}`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${form.usePaymentSchedule ? 'translate-x-4' : 'translate-x-1'}`} />
                        </button>
                      </div>
                      {form.usePaymentSchedule && (
                        <div className="space-y-2">
                          {form.paymentSchedules.map((sched) => (
                            <div key={sched.id} className="flex items-center gap-2">
                              <input
                                type="date"
                                value={sched.due_date}
                                onChange={(e) => setForm((f) => ({
                                  ...f,
                                  paymentSchedules: f.paymentSchedules.map((s) => s.id === sched.id ? { ...s, due_date: e.target.value } : s),
                                }))}
                                className="input-field flex-1"
                              />
                              <input
                                type="number"
                                value={sched.amount}
                                step={0.01}
                                onChange={(e) => setForm((f) => ({
                                  ...f,
                                  paymentSchedules: f.paymentSchedules.map((s) => s.id === sched.id ? { ...s, amount: Number(e.target.value) } : s),
                                }))}
                                className="input-field w-28 text-right"
                                placeholder="€"
                              />
                              <button
                                onClick={() => setForm((f) => ({ ...f, paymentSchedules: f.paymentSchedules.filter((s) => s.id !== sched.id) }))}
                                className="p-1 text-text-muted hover:text-danger"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                          <button
                            onClick={() => setForm((f) => ({
                              ...f,
                              paymentSchedules: [...f.paymentSchedules, { id: newItemId(), due_date: '', amount: 0 }],
                            }))}
                            className="btn-secondary text-sm flex items-center gap-1.5"
                          >
                            <Plus size={14} /> Aggiungi rata
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ---- Step 3 ---- */}
              {formStep === 3 && (
                <div className="h-full min-h-96">
                  {formPdfLoading ? (
                    <div className="flex items-center justify-center h-96">
                      <span className="spinner" />
                    </div>
                  ) : formPdfUrl ? (
                    <iframe src={formPdfUrl} className="w-full" style={{ height: '60vh' }} title="Preview" />
                  ) : (
                    <div className="flex items-center justify-center h-96 text-text-muted text-sm">
                      {t('error.pdf_failed')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-accent-soft flex-shrink-0">
              <div>
                {formStep > 1 && (
                  <button onClick={() => setFormStep((s) => s - 1)} className="btn-secondary text-sm">
                    ← Indietro
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                {formStep < 3 && (
                  <button
                    onClick={() => formStep === 2 ? goToStep3() : setFormStep((s) => s + 1)}
                    className="btn-primary text-sm"
                  >
                    Avanti →
                  </button>
                )}
                {formStep === 3 && (
                  <>
                    <button onClick={handleSaveDraft} disabled={savingDraft} className="btn-secondary text-sm">
                      {savingDraft ? t('common.loading') : t('inv.save_draft')}
                    </button>
                    <button
                      onClick={handleSaveAndSend}
                      disabled={savingDraft}
                      className="btn-primary text-sm"
                    >
                      {savingDraft ? t('common.loading') : 'Conferma e invia →'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
