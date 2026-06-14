import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getSettings } from '../lib/settings';
import type { PaymentReminder } from '../types';

export function useInvoiceReminders(invoiceId: string) {
  const [reminders, setReminders] = useState<PaymentReminder[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!invoiceId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_reminders')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('sent_at', { ascending: true });
      if (error) throw error;
      setReminders((data as PaymentReminder[]) || []);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { reminders, loading, refetch };
}

export function useClientReminderCounts() {
  const [reminderCounts, setReminderCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_reminders')
        .select('client_id');
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const row of (data || [])) {
        const key = row.client_id as string;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      setReminderCounts(counts);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { reminderCounts, loading, refetch };
}

interface SendReminderResult {
  success: boolean;
  reminder_level: number;
  invoice_number: string;
  email_status: string;
  sms_status: string;
  sent_at: string;
}

export function useSendReminder() {
  const [sending, setSending] = useState(false);

  const sendReminder = useCallback(async (
    invoiceId: string,
    reminderLevel: number,
    triggeredBy: string,
    onSuccess?: () => void,
  ): Promise<SendReminderResult> => {
    setSending(true);
    try {
      const settings = await getSettings();
      const webhookUrl = settings?.reminder_webhook_url;
      if (!webhookUrl) {
        throw new Error('Reminder webhook URL ni nastavljen / Reminder webhook URL non configurato');
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          reminder_level: reminderLevel,
          triggered_by: triggeredBy,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.status}`);
      }

      const result: SendReminderResult = await response.json();
      onSuccess?.();
      return result;
    } finally {
      setSending(false);
    }
  }, []);

  return { sendReminder, sending };
}
