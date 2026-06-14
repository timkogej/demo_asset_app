import { useEffect, useState } from 'react';
import { X, Bell, Mail, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTranslation } from '../../i18n/useTranslation';
import { formatCurrency, formatDate } from '../../lib/invoiceCalculations';
import { clientDisplayName } from '../../lib/clientHelpers';
import type { InvoiceRecord, ReminderTemplate } from '../../types';

export const REMINDER_LEVEL_NAMES: Record<number, string> = {
  1: '1° Sollecito',
  2: '2° Sollecito',
  3: '3° Sollecito',
  4: '4° Sollecito (Finale)',
};

export const REMINDER_LEVEL_COLORS: Record<number, string> = {
  1: 'bg-blue-100 text-blue-700 border-blue-200',
  2: 'bg-amber-100 text-amber-700 border-amber-200',
  3: 'bg-orange-100 text-orange-700 border-orange-200',
  4: 'bg-red-100 text-red-700 border-red-200',
};

export const REMINDER_BUTTON_COLORS: Record<number, string> = {
  1: 'bg-blue-600 hover:bg-blue-700 text-white',
  2: 'bg-amber-500 hover:bg-amber-600 text-white',
  3: 'bg-orange-500 hover:bg-orange-600 text-white',
  4: 'bg-red-600 hover:bg-red-700 text-white',
};

interface ReminderConfirmModalProps {
  invoice: InvoiceRecord;
  reminderLevel: number;
  sending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ReminderConfirmModal({
  invoice,
  reminderLevel,
  sending,
  onClose,
  onConfirm,
}: ReminderConfirmModalProps) {
  const { t } = useTranslation();
  const [template, setTemplate] = useState<ReminderTemplate | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  useEffect(() => {
    async function load() {
      setLoadingTemplate(true);
      try {
        const { data } = await supabase
          .from('reminder_templates')
          .select('*')
          .eq('id', reminderLevel)
          .single();
        setTemplate(data as ReminderTemplate | null);
      } catch {
        // non-critical
      } finally {
        setLoadingTemplate(false);
      }
    }
    load();
  }, [reminderLevel]);

  const levelName = REMINDER_LEVEL_NAMES[reminderLevel] ?? `Opomnik ${reminderLevel}`;
  const clientName = invoice.client ? clientDisplayName(invoice.client as Parameters<typeof clientDisplayName>[0]) : '—';

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-10 shadow-2xl w-full max-w-lg animate-slideIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-accent-soft">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-text-muted" strokeWidth={1.8} />
            <h3 className="font-semibold text-text-dark text-sm">{t('rem.send_prefix')} {levelName}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-accent-soft text-text-muted">
            <X size={16} />
          </button>
        </div>

        {/* Invoice info */}
        <div className="px-5 py-4 border-b border-accent-soft bg-accent-soft/30">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-text-muted">Račun:</span>
              <span className="ml-1 font-mono font-bold text-primary">{invoice.invoice_number}</span>
            </div>
            <div>
              <span className="text-text-muted">Znesek:</span>
              <span className="ml-1 font-semibold text-text-dark">€ {formatCurrency(invoice.total)}</span>
            </div>
            <div>
              <span className="text-text-muted">Stranka:</span>
              <span className="ml-1 text-text-dark">{clientName}</span>
            </div>
            <div>
              <span className="text-text-muted">Zapadlost:</span>
              <span className="ml-1 text-text-dark">{invoice.due_date ? formatDate(invoice.due_date) : '—'}</span>
            </div>
            {invoice.vehicle && (
              <div className="col-span-2">
                <span className="text-text-muted">Vozilo:</span>
                <span className="ml-1 font-mono text-text-dark">{invoice.vehicle.registration_number}</span>
                {invoice.vehicle.vehicle_name && (
                  <span className="ml-1 text-text-muted">({invoice.vehicle.vehicle_name})</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Template preview */}
        <div className="px-5 py-4 space-y-3 max-h-64 overflow-y-auto">
          {loadingTemplate ? (
            <div className="space-y-2">
              <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
              <div className="h-16 bg-gray-100 rounded animate-pulse" />
              <div className="h-10 bg-gray-100 rounded animate-pulse" />
            </div>
          ) : template ? (
            <>
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted mb-1.5">
                  <Mail size={12} strokeWidth={1.8} />
                  Email — {template.subject_email_it}
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-text-dark font-mono whitespace-pre-wrap leading-relaxed">
                  {template.body_email_it || '(prazno)'}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-text-muted mb-1.5">
                  <MessageSquare size={12} strokeWidth={1.8} />
                  SMS
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-text-dark font-mono whitespace-pre-wrap leading-relaxed">
                  {template.body_sms_it || '(prazno)'}
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-text-muted italic">Predloga za ta nivo ni bila najdena.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-accent-soft">
          <button onClick={onClose} disabled={sending} className="btn-secondary text-sm">
            Prekliči
          </button>
          <button
            onClick={onConfirm}
            disabled={sending}
            className={`flex items-center gap-2 px-4 py-2 rounded-10 font-medium text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${REMINDER_BUTTON_COLORS[reminderLevel] ?? 'bg-primary hover:bg-primary-hover text-white'}`}
          >
            {sending && <span className="spinner w-3.5 h-3.5" />}
            <Bell size={14} strokeWidth={1.8} />
            {t('rem.send')}
          </button>
        </div>
      </div>
    </div>
  );
}
