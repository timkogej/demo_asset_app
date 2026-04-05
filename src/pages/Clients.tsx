import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Pencil, Trash2, CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SearchInput from '../components/ui/SearchInput';
import { isValidClientId, formatClientId } from '../lib/utils';
import type { Client, Vehicle, Language } from '../types';

interface ClientsProps {
  t: (key: string) => string;
  language: Language;
}

type IsClientFilter = 'all' | 'clients' | 'others';

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
  company_name?: string;
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
  country: '',
  iban: '',
  bic: '',
  registration_number: '',
  tax_number: '',
  is_vat_payer: false,
  comment: '',
};

export default function Clients({ t }: ClientsProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isClientFilter, setIsClientFilter] = useState<IsClientFilter>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientFormData>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [idChecking, setIdChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [clientsRes, vehiclesRes] = await Promise.all([
        supabase
          .from('clients')
          .select('*, vehicles:vehicles(id, plate, make, model, lease_start_date, lease_end_date, monthly_rate)')
          .order('company_name', { ascending: true }),
        supabase
          .from('vehicles')
          .select('id, plate, client_id')
          .order('plate'),
      ]);

      if (clientsRes.error) throw clientsRes.error;
      if (vehiclesRes.error) throw vehiclesRes.error;

      setClients((clientsRes.data as Client[]) || []);
      setVehicles((vehiclesRes.data as Vehicle[]) || []);
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getClientVehicle = (clientId: string): Vehicle | undefined => {
    return vehicles.find((v) => v.client_id === clientId);
  };

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      c.company_name.toLowerCase().includes(q) ||
      (c.company_name_additional || '').toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q);

    const matchesFilter =
      isClientFilter === 'all' ||
      (isClientFilter === 'clients' && c.is_client) ||
      (isClientFilter === 'others' && !c.is_client);

    return matchesSearch && matchesFilter;
  });

  const openAdd = () => {
    setEditingClient(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setForm({
      id: client.id,
      company_name: client.company_name,
      company_name_additional: client.company_name_additional || '',
      is_client: client.is_client,
      email: client.email,
      phone: client.phone || '',
      address: client.address || '',
      postal_code: client.postal_code || '',
      city: client.city || '',
      country: client.country || '',
      iban: client.iban || '',
      bic: client.bic || '',
      registration_number: client.registration_number || '',
      tax_number: client.tax_number || '',
      is_vat_payer: client.is_vat_payer,
      comment: client.comment || '',
    });
    setErrors({});
    setModalOpen(true);
  };

  const handleIdBlur = async () => {
    if (!form.id || editingClient) return;
    if (!isValidClientId(form.id)) {
      setErrors((e) => ({ ...e, id: t('client.id_hint') }));
      return;
    }
    setIdChecking(true);
    try {
      const { data } = await supabase
        .from('clients')
        .select('id')
        .eq('id', form.id)
        .single();
      if (data) {
        setErrors((e) => ({ ...e, id: t('client.id_taken') }));
      } else {
        setErrors((e) => ({ ...e, id: undefined }));
      }
    } finally {
      setIdChecking(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!editingClient) {
      if (!form.id) {
        newErrors.id = t('form.required');
      } else if (!isValidClientId(form.id)) {
        newErrors.id = t('client.id_hint');
      }
    }
    if (!form.company_name.trim()) newErrors.company_name = t('form.required');
    if (!form.email.trim()) {
      newErrors.email = t('form.required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = t('form.invalid_email');
    }
    if (form.iban && form.iban.length < 15) {
      newErrors.iban = t('form.invalid_amount');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).filter((k) => newErrors[k as keyof FormErrors]).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (errors.id) return; // id_taken check failed
    setSaving(true);
    try {
      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update({
            company_name: form.company_name.trim(),
            company_name_additional: form.company_name_additional.trim() || null,
            is_client: form.is_client,
            email: form.email.trim().toLowerCase(),
            phone: form.phone.trim() || null,
            address: form.address.trim() || null,
            postal_code: form.postal_code.trim() || null,
            city: form.city.trim() || null,
            country: form.country.trim().toUpperCase() || null,
            iban: form.iban.trim() || null,
            bic: form.bic.trim() || null,
            registration_number: form.registration_number.trim() || null,
            tax_number: form.tax_number.trim() || null,
            is_vat_payer: form.is_vat_payer,
            comment: form.comment.trim() || null,
          })
          .eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert({
          id: form.id.toUpperCase(),
          company_name: form.company_name.trim(),
          company_name_additional: form.company_name_additional.trim() || null,
          is_client: form.is_client,
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          postal_code: form.postal_code.trim() || null,
          city: form.city.trim() || null,
          country: form.country.trim().toUpperCase() || null,
          iban: form.iban.trim() || null,
          bic: form.bic.trim() || null,
          registration_number: form.registration_number.trim() || null,
          tax_number: form.tax_number.trim() || null,
          is_vat_payer: form.is_vat_payer,
          comment: form.comment.trim() || null,
        });
        if (error) throw error;
      }
      toast.success(t('btn.save'));
      setModalOpen(false);
      fetchData();
    } catch {
      toast.error(t('error.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase.from('clients').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success(t('btn.delete'));
      fetchData();
    } catch {
      toast.error(t('error.delete_failed'));
    } finally {
      setDeleteId(null);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRow((prev) => (prev === id ? null : id));
  };

  const filterOptions: { key: IsClientFilter; label: string }[] = [
    { key: 'all', label: t('client.filter_all') },
    { key: 'clients', label: t('client.filter_clients_only') },
    { key: 'others', label: t('client.filter_others_only') },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="page-title">{t('clients.title')}</h2>
      </div>

      {/* Top bar: search + filter + add button */}
      <div className="flex items-center gap-3 flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('clients.search_placeholder')}
        />
        <div className="flex gap-1 bg-bg border border-accent-muted rounded-10 p-1">
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setIsClientFilter(opt.key)}
              className={`px-3 py-1 rounded-10 text-xs font-medium transition-colors duration-150 ${
                isClientFilter === opt.key
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:text-text-dark hover:bg-accent-soft'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 ml-auto">
          <Plus size={15} strokeWidth={2} />
          {t('clients.add_title')}
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={40} strokeWidth={1} className="text-accent-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">{t('common.no_data')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">{t('client.id')}</th>
                  <th className="table-header">{t('client.company_name')}</th>
                  <th className="table-header">Tip</th>
                  <th className="table-header">{t('client.email')}</th>
                  <th className="table-header">{t('client.phone')}</th>
                  <th className="table-header">{t('client.city')}</th>
                  <th className="table-header">{t('client.iban')}</th>
                  <th className="table-header">IVA/DDV</th>
                  <th className="table-header">Vozilo</th>
                  <th className="table-header">{t('clients.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => {
                  const vehicle = getClientVehicle(client.id);
                  const isExpanded = expandedRow === client.id;
                  return (
                    <>
                      <tr
                        key={client.id}
                        className="table-row cursor-pointer"
                        onClick={() => toggleRow(client.id)}
                      >
                        {/* ID */}
                        <td className="table-cell">
                          <span className="inline-flex items-center px-2 py-0.5 rounded font-mono text-xs font-bold text-primary border border-accent-muted bg-transparent">
                            {client.id}
                          </span>
                        </td>
                        {/* Company name */}
                        <td className="table-cell">
                          <div className="font-medium text-text-dark">{client.company_name}</div>
                          {client.company_name_additional && (
                            <div className="text-xs text-text-muted">{client.company_name_additional}</div>
                          )}
                        </td>
                        {/* Tip badge */}
                        <td className="table-cell">
                          {client.is_client ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                              {t('client.is_client_badge')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                              {t('client.is_other_badge')}
                            </span>
                          )}
                        </td>
                        {/* Email */}
                        <td className="table-cell">
                          <a
                            href={`mailto:${client.email}`}
                            className="text-primary hover:underline text-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {client.email}
                          </a>
                        </td>
                        {/* Phone */}
                        <td className="table-cell text-text-muted text-sm">
                          {client.phone || '—'}
                        </td>
                        {/* City */}
                        <td className="table-cell text-text-muted text-sm">
                          {[client.city, client.postal_code, client.country]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </td>
                        {/* IBAN */}
                        <td className="table-cell">
                          {client.iban ? (
                            <span
                              className="font-mono text-xs text-text-muted"
                              title={client.iban}
                            >
                              {client.iban.slice(0, 12)}...
                            </span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        {/* VAT payer */}
                        <td className="table-cell">
                          {client.is_vat_payer ? (
                            <CheckCircle size={16} strokeWidth={1.8} className="text-success" />
                          ) : (
                            <XCircle size={16} strokeWidth={1.8} className="text-text-muted" />
                          )}
                        </td>
                        {/* Vehicle */}
                        <td className="table-cell">
                          {vehicle ? (
                            <span className="font-mono font-semibold text-primary text-xs">
                              {vehicle.plate}
                            </span>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        {/* Actions */}
                        <td className="table-cell">
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => openEdit(client)}
                              className="text-text-muted hover:text-primary transition-colors"
                              title={t('btn.edit')}
                            >
                              <Pencil size={15} strokeWidth={1.8} />
                            </button>
                            <button
                              onClick={() => setDeleteId(client.id)}
                              className="text-text-muted hover:text-danger transition-colors"
                              title={t('btn.delete')}
                            >
                              <Trash2 size={15} strokeWidth={1.8} />
                            </button>
                            {isExpanded ? (
                              <ChevronUp size={14} strokeWidth={1.8} className="text-text-muted" />
                            ) : (
                              <ChevronDown size={14} strokeWidth={1.8} className="text-text-muted" />
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${client.id}-detail`} className="bg-accent-soft/30">
                          <td colSpan={10} className="px-5 py-3">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                              {client.registration_number && (
                                <div>
                                  <span className="text-text-muted">{t('client.registration_number')}: </span>
                                  <span className="font-mono font-medium">{client.registration_number}</span>
                                </div>
                              )}
                              {client.tax_number && (
                                <div>
                                  <span className="text-text-muted">{t('client.tax_number')}: </span>
                                  <span className="font-mono font-medium">{client.tax_number}</span>
                                </div>
                              )}
                              {client.bic && (
                                <div>
                                  <span className="text-text-muted">{t('client.bic')}: </span>
                                  <span className="font-mono font-medium">{client.bic}</span>
                                </div>
                              )}
                              {client.iban && (
                                <div>
                                  <span className="text-text-muted">{t('client.iban')}: </span>
                                  <span className="font-mono font-medium">{client.iban}</span>
                                </div>
                              )}
                              {client.address && (
                                <div>
                                  <span className="text-text-muted">{t('client.address')}: </span>
                                  <span>{client.address}</span>
                                </div>
                              )}
                              {client.comment && (
                                <div className="col-span-2">
                                  <span className="text-text-muted">{t('client.comment')}: </span>
                                  <span>{client.comment}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingClient ? t('clients.edit_title') : t('clients.add_title')}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-6">
          {/* Section 1 — Identifikacija */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Identifikacija / Identificazione
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('client.id')} *</label>
                <input
                  className="input-field font-mono"
                  value={form.id}
                  disabled={!!editingClient}
                  onChange={(e) => setForm((f) => ({ ...f, id: formatClientId(e.target.value) }))}
                  onBlur={handleIdBlur}
                  placeholder="CLI001"
                  maxLength={12}
                />
                {idChecking && <p className="text-xs text-text-muted mt-1">Checking...</p>}
                {errors.id && <p className="error-text">{errors.id}</p>}
                {!errors.id && !editingClient && (
                  <p className="text-xs text-text-muted mt-1">{t('client.id_hint')}</p>
                )}
              </div>
              <div className="flex items-center gap-3 pt-5">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_client: !f.is_client }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                    form.is_client ? 'bg-primary' : 'bg-accent-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                      form.is_client ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <label className="label mb-0 cursor-pointer" onClick={() => setForm((f) => ({ ...f, is_client: !f.is_client }))}>
                  {t('client.is_client')}
                </label>
              </div>
            </div>
          </div>

          {/* Section 2 — Naziv */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Naziv / Ragione Sociale
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('client.company_name')} *</label>
                <input
                  className="input-field"
                  value={form.company_name}
                  onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                  placeholder="Rossi s.r.l."
                />
                {errors.company_name && <p className="error-text">{errors.company_name}</p>}
              </div>
              <div>
                <label className="label">{t('client.company_name_additional')}</label>
                <input
                  className="input-field"
                  value={form.company_name_additional}
                  onChange={(e) => setForm((f) => ({ ...f, company_name_additional: e.target.value }))}
                  placeholder="Filiale di Milano"
                />
              </div>
            </div>
          </div>

          {/* Section 3 — Kontakt */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Kontakt / Contatto
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('client.email')} *</label>
                <input
                  type="email"
                  className="input-field"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="info@rossi.it"
                />
                {errors.email && <p className="error-text">{errors.email}</p>}
              </div>
              <div>
                <label className="label">{t('client.phone')}</label>
                <input
                  className="input-field"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+39 02 1234567"
                />
              </div>
              <div className="md:col-span-2">
                <label className="label">{t('client.address')}</label>
                <input
                  className="input-field"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Via Roma 12"
                />
              </div>
              <div>
                <label className="label">{t('client.postal_code')}</label>
                <input
                  className="input-field"
                  value={form.postal_code}
                  onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                  placeholder="20121"
                />
              </div>
              <div>
                <label className="label">{t('client.city')}</label>
                <input
                  className="input-field"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Milano"
                />
              </div>
              <div>
                <label className="label">{t('client.country')}</label>
                <input
                  className="input-field"
                  value={form.country}
                  onChange={(e) => setForm((f) => ({ ...f, country: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="IT"
                  maxLength={2}
                />
              </div>
            </div>
          </div>

          {/* Section 4 — Finančni podatki */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Finančni podatki / Dati finanziari
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">{t('client.iban')}</label>
                <input
                  className="input-field font-mono"
                  value={form.iban}
                  onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
                  placeholder="IT60 X054 2811 1010 0000 0123 456"
                />
                {errors.iban && <p className="error-text">{errors.iban}</p>}
              </div>
              <div>
                <label className="label">{t('client.bic')}</label>
                <input
                  className="input-field font-mono"
                  value={form.bic}
                  onChange={(e) => setForm((f) => ({ ...f, bic: e.target.value }))}
                  placeholder="BCITITMM"
                />
              </div>
              <div>
                <label className="label">{t('client.registration_number')}</label>
                <input
                  className="input-field"
                  value={form.registration_number}
                  onChange={(e) => setForm((f) => ({ ...f, registration_number: e.target.value }))}
                  placeholder="MI-1234567"
                />
              </div>
              <div>
                <label className="label">{t('client.tax_number')}</label>
                <input
                  className="input-field"
                  value={form.tax_number}
                  onChange={(e) => setForm((f) => ({ ...f, tax_number: e.target.value }))}
                  placeholder="IT12345678901"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_vat_payer: !f.is_vat_payer }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                    form.is_vat_payer ? 'bg-primary' : 'bg-accent-muted'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                      form.is_vat_payer ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
                <label className="label mb-0 cursor-pointer" onClick={() => setForm((f) => ({ ...f, is_vat_payer: !f.is_vat_payer }))}>
                  {t('client.is_vat_payer')}
                </label>
              </div>
            </div>
          </div>

          {/* Section 5 — Opomba */}
          <div>
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Opomba / Note
            </p>
            <textarea
              className="input-field resize-none w-full"
              rows={3}
              value={form.comment}
              onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              placeholder={t('client.comment')}
            />
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-accent-soft">
          <button onClick={() => setModalOpen(false)} className="btn-secondary">
            {t('btn.cancel')}
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? t('common.loading') : t('btn.save')}
          </button>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        message={t('clients.confirm_delete')}
        t={t}
      />
    </div>
  );
}
