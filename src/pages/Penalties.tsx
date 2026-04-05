import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import type { Penalty, Vehicle, Language } from '../types';

interface PenaltiesProps {
  t: (key: string) => string;
  language: Language;
}

interface PenaltyFormData {
  vehicle_id: string;
  amount: string;
  reason: string;
  penalty_date: string;
}

const emptyForm: PenaltyFormData = {
  vehicle_id: '',
  amount: '',
  reason: '',
  penalty_date: format(new Date(), 'yyyy-MM-dd'),
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

export default function Penalties({ t }: PenaltiesProps) {
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<PenaltyFormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<PenaltyFormData>>({});
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [penaltiesRes, vehiclesRes] = await Promise.all([
        supabase
          .from('penalties')
          .select('*, vehicle:vehicles(*, client:clients(*)), client:clients(*)')
          .order('penalty_date', { ascending: false }),
        supabase
          .from('vehicles')
          .select('*, client:clients(*)')
          .order('plate'),
      ]);

      if (penaltiesRes.error) throw penaltiesRes.error;
      if (vehiclesRes.error) throw vehiclesRes.error;

      setPenalties((penaltiesRes.data as Penalty[]) || []);
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

  const openAdd = () => {
    setForm(emptyForm);
    setErrors({});
    setModalOpen(true);
  };

  const getSelectedVehicle = (): Vehicle | undefined => {
    return vehicles.find((v) => v.id === form.vehicle_id);
  };

  const validate = (): boolean => {
    const newErrors: Partial<PenaltyFormData> = {};
    if (!form.vehicle_id) newErrors.vehicle_id = t('form.required');
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0) {
      newErrors.amount = t('form.invalid_amount');
    }
    if (!form.penalty_date) newErrors.penalty_date = t('form.required');
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const selectedVehicle = getSelectedVehicle();
    if (!selectedVehicle) {
      toast.error(t('form.required'));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        vehicle_id: form.vehicle_id,
        client_id: selectedVehicle.client_id,
        amount: parseFloat(form.amount),
        reason: form.reason.trim() || null,
        penalty_date: form.penalty_date,
      };

      const { error } = await supabase.from('penalties').insert(payload);
      if (error) throw error;

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
      const { error } = await supabase.from('penalties').delete().eq('id', deleteId);
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
        <h2 className="page-title">{t('penalties.title')}</h2>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus size={15} strokeWidth={2} />
          {t('btn.add_penalty')}
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="spinner" />
          </div>
        ) : penalties.length === 0 ? (
          <div className="p-12 text-center">
            <AlertTriangle size={40} strokeWidth={1} className="text-accent-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">{t('penalties.no_penalties')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="table-header">{t('penalties.vehicle_plate')}</th>
                  <th className="table-header">{t('penalties.client_name')}</th>
                  <th className="table-header">{t('penalties.amount')}</th>
                  <th className="table-header">{t('penalties.reason')}</th>
                  <th className="table-header">{t('penalties.date')}</th>
                  <th className="table-header">{t('penalties.linked_invoice')}</th>
                  <th className="table-header">{t('vehicles.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {penalties.map((penalty) => {
                  const isPending = !penalty.added_to_invoice_id;
                  return (
                    <tr
                      key={penalty.id}
                      className={`table-row ${isPending ? 'bg-amber-50 hover:bg-amber-100/60' : ''}`}
                    >
                      <td className="table-cell font-mono font-semibold text-primary">
                        {penalty.vehicle?.plate || '—'}
                      </td>
                      <td className="table-cell">{penalty.client?.company_name || '—'}</td>
                      <td className="table-cell font-semibold text-danger">
                        {formatCurrency(penalty.amount)}
                      </td>
                      <td className="table-cell text-text-muted">
                        {penalty.reason || '—'}
                      </td>
                      <td className="table-cell text-text-muted">
                        {formatDate(penalty.penalty_date)}
                      </td>
                      <td className="table-cell">
                        {penalty.added_to_invoice_id ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-soft text-success">
                            {t('penalties.linked_invoice')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            {t('penalties.pending')}
                          </span>
                        )}
                      </td>
                      <td className="table-cell">
                        <button
                          onClick={() => setDeleteId(penalty.id)}
                          className="text-text-muted hover:text-danger transition-colors"
                          title={t('btn.delete')}
                        >
                          <Trash2 size={15} strokeWidth={1.8} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t('penalties.add_title')}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div>
            <label className="label">{t('penalties.select_vehicle')} *</label>
            <select
              className="input-field"
              value={form.vehicle_id}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_id: e.target.value }))}
            >
              <option value="">— {t('penalties.select_vehicle')} —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} — {v.make} {v.model}
                  {v.client ? ` (${v.client.company_name})` : ''}
                </option>
              ))}
            </select>
            {errors.vehicle_id && <p className="error-text">{errors.vehicle_id}</p>}
          </div>

          {/* Auto-fill client info */}
          {getSelectedVehicle()?.client && (
            <div className="bg-accent-soft/50 rounded-10 px-3 py-2 text-xs text-text-muted">
              <span className="font-medium text-text-dark">
                {getSelectedVehicle()?.client?.company_name}
              </span>
              {' — '}
              {getSelectedVehicle()?.client?.email}
            </div>
          )}

          <div>
            <label className="label">{t('penalties.amount')} (€) *</label>
            <input
              type="number"
              className="input-field"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="150.00"
              min="0"
              step="0.01"
            />
            {errors.amount && <p className="error-text">{errors.amount}</p>}
          </div>

          <div>
            <label className="label">{t('penalties.reason')}</label>
            <textarea
              className="input-field resize-none"
              rows={3}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="Eccesso di chilometraggio..."
            />
          </div>

          <div>
            <label className="label">{t('penalties.date')} *</label>
            <input
              type="date"
              className="input-field"
              value={form.penalty_date}
              onChange={(e) => setForm((f) => ({ ...f, penalty_date: e.target.value }))}
            />
            {errors.penalty_date && <p className="error-text">{errors.penalty_date}</p>}
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
        message={t('penalties.confirm_delete')}
        t={t}
      />
    </div>
  );
}
