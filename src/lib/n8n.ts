import toast from 'react-hot-toast';

/**
 * Triggers the n8n monthly invoice webhook.
 * n8n should be configured to:
 * 1. Fetch all active vehicles from Supabase
 * 2. Generate invoice records for the current month
 * 3. Send email notifications to clients
 *
 * Configure webhook URL in .env as VITE_N8N_WEBHOOK_URL
 */
export async function triggerMonthlyInvoiceWebhook(): Promise<void> {
  const webhookUrl = import.meta.env.VITE_N8N_WEBHOOK_URL;

  if (!webhookUrl || webhookUrl.includes('your-n8n-instance')) {
    console.warn('N8N webhook URL not configured, skipping webhook trigger');
    return;
  }

  const now = new Date();
  const payload = {
    trigger: 'monthly_invoice',
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    timestamp: now.toISOString(),
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with status ${response.status}`);
    }

    toast.success('Webhook n8n notificato con successo');
  } catch (error) {
    console.error('N8N webhook error:', error);
    toast.error('Errore nella notifica webhook n8n');
  }
}
