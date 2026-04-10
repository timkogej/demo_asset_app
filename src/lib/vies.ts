import { supabase } from './supabase';

export interface ViesResult {
  valid: boolean;
  name?: string;
  address?: string;
  error?: string;
}

export async function checkVies(
  vatNumber: string,
  countryCode: string
): Promise<ViesResult> {
  if (!vatNumber || !countryCode) return { valid: false };
  if (countryCode.toUpperCase() === 'SI') return { valid: false };

  try {
    const { data: settings } = await supabase
      .from('settings')
      .select('vies_webhook_url')
      .eq('id', 1)
      .single();

    const viesUrl = settings?.vies_webhook_url;
    if (!viesUrl) return { valid: false, error: 'VIES webhook not configured' };

    const response = await fetch(viesUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vat_number: vatNumber,
        country_code: countryCode.toUpperCase(),
      }),
    });

    if (!response.ok) return { valid: false, error: 'Webhook error' };

    const data = await response.json();
    return {
      valid: data.valid === true,
      name: data.name,
      address: data.address,
    };
  } catch {
    return { valid: false, error: 'Network error' };
  }
}

// Determine if invoice should use Reverse Charge:
// - Client country is NOT Slovenia (SI)
// - Client is VAT payer (is_vat_payer = true)
// - VIES confirms valid EU VAT number
export function shouldUseReverseCharge(
  client: { country: string | null; is_vat_payer: boolean; tax_number: string | null },
  viesValid: boolean
): boolean {
  return (
    client.country !== 'SI' &&
    client.is_vat_payer === true &&
    client.tax_number !== null &&
    viesValid === true
  );
}
