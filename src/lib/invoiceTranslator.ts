export type InvoiceLang = 'IT' | 'SL' | 'EN';

// Determine secondary language based on client country
export function getSecondaryLanguage(countryCode: string | null): InvoiceLang {
  if (!countryCode) return 'EN';
  if (countryCode.toUpperCase() === 'SI') return 'SL';
  return 'EN';
}

// Static translations for common invoice terms
// Primary: Italian, Secondary: Slovenian or English
const STATIC_TRANSLATIONS: Record<string, { SL: string; EN: string }> = {
  // Month translations (Italian uppercase → SL / EN)
  'GENNAIO': { SL: 'JANUAR', EN: 'JANUARY' },
  'FEBBRAIO': { SL: 'FEBRUAR', EN: 'FEBRUARY' },
  'MARZO': { SL: 'MAREC', EN: 'MARCH' },
  'APRILE': { SL: 'APRIL', EN: 'APRIL' },
  'MAGGIO': { SL: 'MAJ', EN: 'MAY' },
  'GIUGNO': { SL: 'JUNIJ', EN: 'JUNE' },
  'LUGLIO': { SL: 'JULIJ', EN: 'JULY' },
  'AGOSTO': { SL: 'AVGUST', EN: 'AUGUST' },
  'SETTEMBRE': { SL: 'SEPTEMBER', EN: 'SEPTEMBER' },
  'OTTOBRE': { SL: 'OKTOBER', EN: 'OCTOBER' },
  'NOVEMBRE': { SL: 'NOVEMBER', EN: 'NOVEMBER' },
  'DICEMBRE': { SL: 'DECEMBER', EN: 'DECEMBER' },
  'RACUN ST.': { SL: 'RACUN ST.', EN: 'INVOICE NO.' },
  'FATTURA N.': { SL: 'RACUN ST.', EN: 'INVOICE NO.' },
  'Datum racuna': { SL: 'Datum racuna', EN: 'Invoice date' },
  'Data fattura': { SL: 'Datum racuna', EN: 'Invoice date' },
  'Datum opr. Storitev:': { SL: 'Datum opr. Storitev:', EN: 'Date of service:' },
  'Data prest. Servizi:': { SL: 'Datum opr. Storitev:', EN: 'Date of service:' },
  'cod': { SL: 'koda', EN: 'code' },
  'descrizione': { SL: 'opis', EN: 'description' },
  'q.ta': { SL: 'kol.', EN: 'qty.' },
  'prezzo u.': { SL: 'cena/enoto', EN: 'unit price' },
  'totale': { SL: 'skupaj', EN: 'total' },
  'netto': { SL: 'neto', EN: 'net' },
  'TOTALE': { SL: 'SKUPAJ', EN: 'TOTAL' },
  'IBAN': { SL: 'IBAN', EN: 'IBAN' },
  'SWIFT': { SL: 'SWIFT', EN: 'SWIFT' },
  'PAGAMENTO': { SL: 'PLACILO', EN: 'PAYMENT' },
  'ROK PLACILA': { SL: 'ROK PLACILA', EN: 'DUE DATE' },
  'SCADENZA': { SL: 'ROK PLACILA', EN: 'DUE DATE' },
  'NOLEGGIO LUNGO TERMINE': { SL: 'DOLGOROCNI NAJEM', EN: 'LONG TERM RENTAL' },
  'CANONE MESE DI': { SL: 'MESECNINA ZA', EN: 'MONTHLY FEE FOR' },
  'TARGA': { SL: 'REGISTRSKA', EN: 'PLATE' },
  'Targa': { SL: 'Registrska', EN: 'Plate' },
  'targa': { SL: 'registrska', EN: 'plate' },
  'ANTICIPO CONTRATTUALE': { SL: 'POGODBENI POLOG', EN: 'CONTRACT DEPOSIT' },
  'ADDEBITO CONTRAVVENZIONI': { SL: 'OBRACUN KAZNI', EN: 'PENALTIES CHARGE' },
  'ADDEBITO ASSICURAZIONE': { SL: 'OBRACUN ZAVAROVANJA', EN: 'INSURANCE CHARGE' },
  'RISARCIMENTO DANNI': { SL: 'POVRACILO SKODE', EN: 'DAMAGE COMPENSATION' },
  'Riferimento contratto del': { SL: 'Sklicevanje na pogodbo z dne', EN: 'Contract reference dated' },
  'Opravljiene storitve po pogodbi z dne': { SL: 'Opravljene storitve po pogodbi z dne', EN: 'Services rendered per contract dated' },
  'DDV v skladu S 1. Odstavkom 25. clena ZDDV-1 obracunan': {
    SL: 'DDV v skladu S 1. Odstavkom 25. clena ZDDV-1 obracunan',
    EN: 'VAT pursuant to Art. 25 para. 1 of ZDDV-1 applied',
  },
  'Reverse Charge': { SL: 'Reverse Charge', EN: 'Reverse Charge' },
};

export function translateStatic(text: string, lang: InvoiceLang): string {
  if (lang === 'IT') return text;
  const found = STATIC_TRANSLATIONS[text];
  if (found) return found[lang] || text;
  // Handle "TARGA [plate]" pattern — translate TARGA, leave registration number unchanged
  if (/\bTARGA\b/i.test(text)) {
    const replacement = lang === 'SL' ? 'REGISTRSKA' : 'PLATE';
    return text.replace(/\bTARGA\b/gi, (match) => {
      if (match === match.toUpperCase()) return replacement.toUpperCase();
      if (match[0] === match[0].toUpperCase()) return replacement.charAt(0) + replacement.slice(1).toLowerCase();
      return replacement.toLowerCase();
    });
  }
  // Full pattern: CANONE MESE DI <MONTH> <YEAR> — translate the month name too
  const canoneMatch = text.match(/^CANONE MESE DI ([A-Z]+) (\d{4})$/);
  if (canoneMatch) {
    const monthIT = canoneMatch[1];
    const year = canoneMatch[2];
    const monthTrans = STATIC_TRANSLATIONS[monthIT];
    const translatedMonth = monthTrans ? (monthTrans[lang] || monthIT) : monthIT;
    const prefix = lang === 'SL' ? 'MESECNINA ZA' : 'MONTHLY FEE FOR';
    return `${prefix} ${translatedMonth} ${year}`;
  }
  // Partial match fallback for CANONE MESE DI without year
  if (text.startsWith('CANONE MESE DI ')) {
    const rest = text.replace('CANONE MESE DI ', '');
    const prefix = lang === 'SL' ? 'MESECNINA ZA ' : 'MONTHLY FEE FOR ';
    return prefix + rest;
  }
  return text;
}

export function translateServicePeriod(period: string, lang: InvoiceLang): string {
  if (lang === 'IT' || !period) return period;
  // period format: "Aprile 2026"
  const parts = period.split(' ');
  if (parts.length >= 2) {
    const monthIT = parts[0].toUpperCase();
    const year = parts[1];
    const monthTrans = STATIC_TRANSLATIONS[monthIT];
    if (monthTrans) {
      const translatedMonth = monthTrans[lang] || parts[0];
      const monthFormatted = translatedMonth.charAt(0) + translatedMonth.slice(1).toLowerCase();
      return `${monthFormatted} ${year}`;
    }
  }
  return period;
}

// DeepL translation via n8n proxy webhook (avoids browser CORS restrictions)
// Called only for custom descriptions that aren't in the static dict
export async function translateWithDeepL(
  text: string,
  targetLang: 'SL' | 'EN',
  deeplWebhookUrl: string  // from settings.deepl_webhook_url — n8n webhook URL for DeepL
): Promise<string> {
  if (!text || !deeplWebhookUrl) return text;
  try {
    const response = await fetch(deeplWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        target_lang: targetLang === 'SL' ? 'SL' : 'EN-GB',
      }),
    });
    if (!response.ok) return text;
    const data = await response.json();
    return data.translation || text;
  } catch {
    return text;
  }
}
