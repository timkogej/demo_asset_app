import { useState, useEffect, useCallback } from 'react';
import { Car, Plus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SearchInput from '../components/ui/SearchInput';
import type { Vehicle, Client, Language } from '../types';

interface VehiclesProps {
  t: (key: string) => string;
  language: Language;
}

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
}

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
};

function formatCurrency(amount: number): string {
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

type StatusFilter = 'all' | 'active' | 'maintenance' | 'returning';

export default function Vehicles({ t }: VehiclesProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [form, setForm] = useState<VehicleFormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<VehicleFormData>>({});
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vehiclesRes, clientsRes] = await Promise.all([
        supabase
          .from('vehicles')
          .select('*, client:clients(*)')
          .order('created_at', { ascending: false }),
        supabase.from('clients').select('*').order('name'),
      ]);

      if (vehiclesRes.error) throw vehiclesRes.error;
      if (clientsRes.error) throw clientsRes.error;

      setVehicles((vehiclesRes.data as Vehicle[]) || []);
      setClients((clientsRes.data as Client[]) || []);
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
      (v.client?.name || '').toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'all' || v.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const openAdd = () => {
    setEditingVehicle(null);
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEdit = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setForm({
      plate: vehicle.plate,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year?.toString() || '',
      current_km: vehicle.current_km.toString(),
      status: vehicle.status,
      client_id: vehicle.client_id || '',
      lease_start_date: vehicle.lease_start_date || '',
      lease_end_date: vehicle.lease_end_date || '',
      monthly_rate: vehicle.monthly_rate.toString(),
    });
    setErrors({});
    setModalOpen(true);
  };

  const validate = (): boolean => {
    const newErrors: Partial<VehicleFormData> = {};
    if (!form.plate.trim()) newErrors.plate = t('form.required');
    if (!form.make.trim()) newErrors.make = t('form.required');
    if (!form.model.trim()) newErrors.model = t('form.required');
    if (!form.current_km || isNaN(Number(form.current_km))) newErrors.current_km = t('form.required');
    if (!form.monthly_rate || isNaN(Number(form.monthly_rate))) newErrors.monthly_rate = t('form.invalid_amount');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        plate: form.plate.trim().toUpperCase(),
        make: form.make.trim(),
        model: form.model.trim(),
        year: form.year ? parseInt(form.year) : null,
        current_km: parseInt(form.current_km),
        status: form.status,
        client_id: form.client_id || null,
        lease_start_date: form.lease_start_date || null,
        lease_end_date: form.lease_end_date || null,
        monthly_rate: parseFloat(form.monthly_rate),
      };

      if (editingVehicle) {
        const { error } = await supabase
          .from('vehicles')
          .update(payload)
          .eq('id', editingVehicle.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('vehicles').insert(payload);
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
      const { error } = await supabase.from('vehicles').delete().eq('id', deleteId);
      if (error) throw error;
      toast.success(t('btn.delete'));
      fetchData();
    } catch {
      toast.error(t('error.delete_failed'));
    } finally {
      setDeleteId(null);
    }
  };

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: t('vehicles.filter_all') },
    { key: 'active', label: t('vehicles.filter_active') },
    { key: 'maintenance', label: t('vehicles.filter_maintenance') },
    { key: 'returning', label: t('vehicles.filter_returning') },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="page-title">{t('vehicles.title')}</h2>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus size={15} strokeWidth={2} />
          {t('btn.add_vehicle')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('vehicles.search_placeholder')}
        />
        <div className="flex gap-1 bg-bg border border-accent-muted rounded-10 p-1">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3 py-1 rounded-10 text-xs font-medium transition-colors duration-150 ${
                statusFilter === tab.key
                  ? 'bg-primary text-white'
                  : 'text-text-muted hover:text-text-dark hover:bg-accent-soft'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Car size={40} strokeWidth={1} className="text-accent-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">{t('common.no_data')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">{t('vehicles.plate')}</th>
                  <th className="table-header">{t('vehicles.make')}</th>
                  <th className="table-header">{t('vehicles.model')}</th>
                  <th className="table-header">{t('vehicles.year')}</th>
                  <th className="table-header">{t('vehicles.current_km')}</th>
                  <th className="table-header">{t('vehicles.client')}</th>
                  <th className="table-header">{t('vehicles.monthly_rate')}</th>
                  <th className="table-header">{t('vehicles.lease_end')}</th>
                  <th className="table-header">{t('vehicles.status')}</th>
                  <th className="table-header">{t('vehicles.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((vehicle) => (
                  <tr key={vehicle.id} className="table-row">
                    <td className="table-cell font-mono font-semibold text-primary">
                      {vehicle.plate}
                    </td>
                    <td className="table-cell">{vehicle.make}</td>
                    <td className="table-cell">{vehicle.model}</td>
                    <td className="table-cell text-text-muted">{vehicle.year || '—'}</td>
                    <td className="table-cell text-text-muted">
                      {vehicle.current_km.toLocaleString('it-IT')}
                    </td>
                    <td className="table-cell">
                      {vehicle.client?.name || (
                        <span className="text-text-muted">{t('vehicles.no_client')}</span>
                      )}
                    </td>
                    <td className="table-cell font-medium">
                      {formatCurrency(vehicle.monthly_rate)}
                    </td>
                    <td className="table-cell text-text-muted">
                      {formatDate(vehicle.lease_end_date)}
                    </td>
                    <td className="table-cell">
                      <Badge status={vehicle.status} t={(k) => {
                        const key = k.replace('status.', '');
                        return t(`status.${key}`);
                      }} />
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEdit(vehicle)}
                          className="text-text-muted hover:text-primary transition-colors"
                          title={t('btn.edit')}
                        >
                          <Pencil size={15} strokeWidth={1.8} />
                        </button>
                        <button
                          onClick={() => setDeleteId(vehicle.id)}
                          className="text-text-muted hover:text-danger transition-colors"
                          title={t('btn.delete')}
                        >
                          <Trash2 size={15} strokeWidth={1.8} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingVehicle ? t('vehicles.edit_title') : t('vehicles.add_title')}
        maxWidth="max-w-2xl"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">{t('vehicles.plate')} *</label>
            <input
              className="input-field"
              value={form.plate}
              onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))}
              placeholder="AB 123 CD"
            />
            {errors.plate && <p className="error-text">{errors.plate}</p>}
          </div>
          <div>
            <label className="label">{t('vehicles.make')} *</label>
            <input
              className="input-field"
              value={form.make}
              onChange={(e) => setForm((f) => ({ ...f, make: e.target.value }))}
              placeholder="BMW"
            />
            {errors.make && <p className="error-text">{errors.make}</p>}
          </div>
          <div>
            <label className="label">{t('vehicles.model')} *</label>
            <input
              className="input-field"
              value={form.model}
              onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
              placeholder="320d"
            />
            {errors.model && <p className="error-text">{errors.model}</p>}
          </div>
          <div>
            <label className="label">{t('vehicles.year')}</label>
            <input
              type="number"
              className="input-field"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              placeholder="2023"
              min="1990"
              max="2030"
            />
          </div>
          <div>
            <label className="label">{t('vehicles.current_km')} *</label>
            <input
              type="number"
              className="input-field"
              value={form.current_km}
              onChange={(e) => setForm((f) => ({ ...f, current_km: e.target.value }))}
              placeholder="45000"
              min="0"
            />
            {errors.current_km && <p className="error-text">{errors.current_km}</p>}
          </div>
          <div>
            <label className="label">{t('vehicles.monthly_rate')} (€) *</label>
            <input
              type="number"
              className="input-field"
              value={form.monthly_rate}
              onChange={(e) => setForm((f) => ({ ...f, monthly_rate: e.target.value }))}
              placeholder="650.00"
              min="0"
              step="0.01"
            />
            {errors.monthly_rate && <p className="error-text">{errors.monthly_rate}</p>}
          </div>
          <div>
            <label className="label">{t('vehicles.status')}</label>
            <select
              className="input-field"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  status: e.target.value as 'active' | 'maintenance' | 'returning',
                }))
              }
            >
              <option value="active">{t('status.active')}</option>
              <option value="maintenance">{t('status.maintenance')}</option>
              <option value="returning">{t('status.returning')}</option>
            </select>
          </div>
          <div>
            <label className="label">{t('vehicles.client')}</label>
            <select
              className="input-field"
              value={form.client_id}
              onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
            >
              <option value="">{t('vehicles.no_client')}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('vehicles.lease_start_date')}</label>
            <input
              type="date"
              className="input-field"
              value={form.lease_start_date}
              onChange={(e) => setForm((f) => ({ ...f, lease_start_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">{t('vehicles.lease_end_date')}</label>
            <input
              type="date"
              className="input-field"
              value={form.lease_end_date}
              onChange={(e) => setForm((f) => ({ ...f, lease_end_date: e.target.value }))}
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
        message={t('vehicles.confirm_delete')}
        t={t}
      />
    </div>
  );
}
