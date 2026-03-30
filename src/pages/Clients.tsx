import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Pencil, Trash2, Mail } from 'lucide-react';
import { format, differenceInMonths } from 'date-fns';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SearchInput from '../components/ui/SearchInput';
import type { Client, Vehicle, Language } from '../types';

interface ClientsProps {
  t: (key: string) => string;
  language: Language;
}

interface ClientFormData {
  name: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  language: 'it' | 'sl';
}

const emptyForm: ClientFormData = {
  name: '',
  email: '',
  phone: '',
  address: '',
  tax_id: '',
  language: 'it',
};

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'dd/MM/yyyy');
  } catch {
    return '—';
  }
}

function formatCurrency(amount: number): string {
  return `€${amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calculateMonthsElapsed(startDate?: string | null): number {
  if (!startDate) return 0;
  try {
    return Math.max(0, differenceInMonths(new Date(), new Date(startDate)));
  } catch {
    return 0;
  }
}

export default function Clients({ t }: ClientsProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientFormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<ClientFormData>>({});
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [clientsRes, vehiclesRes] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase
          .from('vehicles')
          .select('*, client:clients(*)')
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
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
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
      name: client.name,
      email: client.email,
      phone: client.phone || '',
      address: client.address || '',
      tax_id: client.tax_id || '',
      language: client.language,
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = (): boolean => {
    const newErrors: Partial<ClientFormData> = {};
    if (!form.name.trim()) newErrors.name = t('form.required');
    if (!form.email.trim()) {
      newErrors.email = t('form.required');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = t('form.invalid_email');
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        tax_id: form.tax_id.trim() || null,
        language: form.language,
      };

      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert(payload);
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="page-title">{t('clients.title')}</h2>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus size={15} strokeWidth={2} />
          {t('btn.add_client')}
        </button>
      </div>

      {/* Search */}
      <div>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('clients.search_placeholder')}
        />
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
                  <th className="table-header">{t('clients.name')}</th>
                  <th className="table-header">{t('clients.email')}</th>
                  <th className="table-header">{t('clients.phone')}</th>
                  <th className="table-header">{t('clients.tax_id')}</th>
                  <th className="table-header">{t('clients.assigned_vehicle')}</th>
                  <th className="table-header">{t('clients.lease_start')}</th>
                  <th className="table-header">{t('vehicles.monthly_rate')}</th>
                  <th className="table-header">{t('clients.months_elapsed')}</th>
                  <th className="table-header">{t('clients.language')}</th>
                  <th className="table-header">{t('clients.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((client) => {
                  const vehicle = getClientVehicle(client.id);
                  const monthsElapsed = calculateMonthsElapsed(vehicle?.lease_start_date);

                  return (
                    <tr key={client.id} className="table-row">
                      <td className="table-cell font-medium">{client.name}</td>
                      <td className="table-cell text-text-muted">{client.email}</td>
                      <td className="table-cell text-text-muted">{client.phone || '—'}</td>
                      <td className="table-cell text-text-muted font-mono text-xs">
                        {client.tax_id || '—'}
                      </td>
                      <td className="table-cell">
                        {vehicle ? (
                          <span className="font-mono font-semibold text-primary text-xs">
                            {vehicle.plate}
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="table-cell text-text-muted">
                        {formatDate(vehicle?.lease_start_date)}
                      </td>
                      <td className="table-cell font-medium">
                        {vehicle ? formatCurrency(vehicle.monthly_rate) : '—'}
                      </td>
                      <td className="table-cell text-text-muted">
                        {vehicle ? `${monthsElapsed} ${t('common.months')}` : '—'}
                      </td>
                      <td className="table-cell">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                            client.language === 'it'
                              ? 'bg-green-50 text-green-700'
                              : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {client.language === 'it' ? '🇮🇹 IT' : '🇸🇮 SL'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          <a
                            href={`mailto:${client.email}`}
                            className="text-text-muted hover:text-accent transition-colors"
                            title={t('btn.contact')}
                          >
                            <Mail size={15} strokeWidth={1.8} />
                          </a>
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

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingClient ? t('clients.edit_title') : t('clients.add_title')}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div>
            <label className="label">{t('clients.name')} *</label>
            <input
              className="input-field"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Mario Rossi"
            />
            {errors.name && <p className="error-text">{errors.name}</p>}
          </div>
          <div>
            <label className="label">{t('clients.email')} *</label>
            <input
              type="email"
              className="input-field"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="mario@example.com"
            />
            {errors.email && <p className="error-text">{errors.email}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">{t('clients.phone')}</label>
              <input
                className="input-field"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+39 333 123 4567"
              />
            </div>
            <div>
              <label className="label">{t('clients.tax_id')}</label>
              <input
                className="input-field"
                value={form.tax_id}
                onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
                placeholder="RSSMRC80A01F205X"
              />
            </div>
          </div>
          <div>
            <label className="label">{t('clients.address')}</label>
            <input
              className="input-field"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Via Roma 12, Milano"
            />
          </div>
          <div>
            <label className="label">{t('clients.language')}</label>
            <select
              className="input-field"
              value={form.language}
              onChange={(e) =>
                setForm((f) => ({ ...f, language: e.target.value as 'it' | 'sl' }))
              }
            >
              <option value="it">{t('clients.italian')}</option>
              <option value="sl">{t('clients.slovenian')}</option>
            </select>
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
