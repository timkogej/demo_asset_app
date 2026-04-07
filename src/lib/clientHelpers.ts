import type { Client } from '../types';

export function clientDisplayName(client: Client | { company_name: string | null; company_name_additional: string | null; id: string }): string {
  return client.company_name || client.company_name_additional || client.id;
}

export function countryFlag(code: string | null): string {
  if (!code) return '';
  const flags: Record<string, string> = {
    SI: '🇸🇮', IT: '🇮🇹', HR: '🇭🇷', DE: '🇩🇪',
    RO: '🇷🇴', AT: '🇦🇹', HU: '🇭🇺', FR: '🇫🇷',
    ES: '🇪🇸', NL: '🇳🇱', BE: '🇧🇪', PL: '🇵🇱',
  };
  return flags[code.toUpperCase()] ?? code;
}
