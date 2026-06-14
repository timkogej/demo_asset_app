import { useRef, useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, Bell } from 'lucide-react';
import type { PaymentReminder } from '../../types';
import { REMINDER_LEVEL_NAMES, REMINDER_LEVEL_COLORS } from './ReminderConfirmModal';
import { useTranslation } from '../../i18n/useTranslation';

function StatusIcon({ status }: { status: 'sent' | 'failed' | 'pending' }) {
  if (status === 'sent') return <CheckCircle size={12} className="text-green-600" strokeWidth={2} />;
  if (status === 'failed') return <XCircle size={12} className="text-red-500" strokeWidth={2} />;
  return <Clock size={12} className="text-amber-500" strokeWidth={2} />;
}

function formatSentAt(sentAt: string): string {
  const d = new Date(sentAt);
  const date = d.toLocaleDateString('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
  return `${date} ob ${time}`;
}

interface ReminderHistoryPopoverProps {
  reminders: PaymentReminder[];
  children: React.ReactNode;
}

export default function ReminderHistoryPopover({ reminders, children }: ReminderHistoryPopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <div onClick={() => setOpen((o) => !o)} className="cursor-pointer">
        {children}
      </div>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 bg-white border border-accent-muted rounded-10 shadow-xl"
          style={{ minWidth: 280, maxWidth: 340 }}
        >
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-accent-soft">
            <Bell size={13} className="text-text-muted" strokeWidth={1.8} />
            <span className="text-xs font-semibold text-text-dark">{t('rem.history')}</span>
          </div>

          {reminders.length === 0 ? (
            <div className="px-3 py-3 text-xs text-text-muted italic">{t('rem.none')}</div>
          ) : (
            <div className="divide-y divide-accent-soft max-h-64 overflow-y-auto">
              {reminders.map((r) => (
                <div key={r.id} className="px-3 py-2.5 text-xs">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`px-1.5 py-0.5 rounded-full font-medium text-[11px] border ${REMINDER_LEVEL_COLORS[r.reminder_level] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                      {REMINDER_LEVEL_NAMES[r.reminder_level] ?? `Opomnik ${r.reminder_level}`}
                    </span>
                    <span className="text-text-muted">{formatSentAt(r.sent_at)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-text-muted">
                    <div className="flex items-center gap-1">
                      <StatusIcon status={r.email_status} />
                      <span>email {r.email_status === 'sent' ? '✓' : r.email_status === 'failed' ? '✗' : '…'}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <StatusIcon status={r.sms_status} />
                      <span>SMS {r.sms_status === 'sent' ? '✓' : r.sms_status === 'failed' ? '✗' : '…'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
