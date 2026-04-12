export type InvoiceLang = 'SL' | 'IT' | 'EN';

export function getPrimaryLanguage(): InvoiceLang {
  return 'SL'; // Always Slovenian
}

export function getSecondaryLanguage(countryCode: string | null): InvoiceLang | null {
  if (!countryCode || countryCode.toUpperCase() === 'SI') return null; // SL only
  if (countryCode.toUpperCase() === 'IT') return 'IT';
  return 'EN';
}

// Static translations: SL is always the primary key, IT/EN are secondary values
const STATIC_TRANSLATIONS: Record<string, { IT: string; EN: string }> = {
  // Invoice header labels
  'RACUN ST.':              { IT: 'FATTURA N.',              EN: 'INVOICE NO.' },
  'Datum racuna':           { IT: 'Data fattura',            EN: 'Invoice date' },
  'Datum opr. Storitev:':   { IT: 'Data prest. Servizi:',   EN: 'Date of service:' },

  // Table headers
  'koda':         { IT: 'cod',          EN: 'code' },
  'opis':         { IT: 'descrizione',  EN: 'description' },
  'kol.':         { IT: 'q.tà',        EN: 'qty.' },
  'cena/enoto':   { IT: 'prezzo u. €', EN: 'unit price' },
  'skupaj':       { IT: 'totale €',    EN: 'total' },

  // Totals
  'neto':         { IT: 'netto',   EN: 'net' },
  'SKUPAJ':       { IT: 'TOTALE',  EN: 'TOTAL' },

  // Payment labels
  'PLACILO':      { IT: 'PAGAMENTO',        EN: 'PAYMENT' },
  'ROK PLACILA':  { IT: 'SCADENZA',         EN: 'DUE DATE' },

  // Invoice content — SL primary, IT secondary
  'DOLGOROCNI NAJEM':    { IT: 'NOLEGGIO LUNGO TERMINE',    EN: 'LONG TERM RENTAL' },
  'REGISTRSKA ST.':      { IT: 'TARGA',                     EN: 'PLATE NO.' },
  'Registrska st.':      { IT: 'Targa',                     EN: 'Plate no.' },
  'POGODBENI POLOG':     { IT: 'ANTICIPO CONTRATTUALE',     EN: 'CONTRACT DEPOSIT' },
  'OBRACUN KAZNI':       { IT: 'ADDEBITO CONTRAVVENZIONI',  EN: 'PENALTIES CHARGE' },
  'OBRACUN ZAVAROVANJA': { IT: 'ADDEBITO ASSICURAZIONE',   EN: 'INSURANCE CHARGE' },
  'POVRACILO SKODE':     { IT: 'RISARCIMENTO DANNI',        EN: 'DAMAGE COMPENSATION' },
  'Sklicevanje na pogodbo z dne': { IT: 'Riferimento contratto del', EN: 'Contract reference dated' },
  'Opravljene storitve po pogodbi z dne': {
    IT: 'Opravljiene storitve po pogodbi z dne',
    EN: 'Services rendered per contract dated',
  },
  'DDV v skladu s 1. odstavkom 25. clena ZDDV-1 obracunan': {
    IT: 'IVA ai sensi dell\'art. 25 comma 1 dello ZDDV-1 applicata',
    EN: 'VAT pursuant to Art. 25 para. 1 of ZDDV-1 applied',
  },
  'Reverse Charge': { IT: 'Reverse Charge', EN: 'Reverse Charge' },

  // Months — SL primary
  'Januar':    { IT: 'Gennaio',   EN: 'January' },
  'Februar':   { IT: 'Febbraio',  EN: 'February' },
  'Marec':     { IT: 'Marzo',     EN: 'March' },
  'April':     { IT: 'Aprile',    EN: 'April' },
  'Maj':       { IT: 'Maggio',    EN: 'May' },
  'Junij':     { IT: 'Giugno',    EN: 'June' },
  'Julij':     { IT: 'Luglio',    EN: 'July' },
  'Avgust':    { IT: 'Agosto',    EN: 'August' },
  'September': { IT: 'Settembre', EN: 'September' },
  'Oktober':   { IT: 'Ottobre',   EN: 'October' },
  'November':  { IT: 'Novembre',  EN: 'November' },
  'December':  { IT: 'Dicembre',  EN: 'December' },

  // Italian months as SL keys too (for lookup when input is already normalised)
  'Gennaio':   { IT: 'Gennaio',   EN: 'January' },
  'Febbraio':  { IT: 'Febbraio',  EN: 'February' },
  'Marzo':     { IT: 'Marzo',     EN: 'March' },
  'Aprile':    { IT: 'Aprile',    EN: 'April' },
  'Maggio':    { IT: 'Maggio',    EN: 'May' },
  'Giugno':    { IT: 'Giugno',    EN: 'June' },
  'Luglio':    { IT: 'Luglio',    EN: 'July' },
  'Agosto':    { IT: 'Agosto',    EN: 'August' },
  'Settembre': { IT: 'Settembre', EN: 'September' },
  'Ottobre':   { IT: 'Ottobre',   EN: 'October' },
  'Novembre':  { IT: 'Novembre',  EN: 'November' },
  'Dicembre':  { IT: 'Dicembre',  EN: 'December' },
};

// IT months → SL mapping (for normalising Italian input)
const IT_TO_SL_MONTHS: Record<string, string> = {
  'GENNAIO': 'Januar', 'FEBBRAIO': 'Februar', 'MARZO': 'Marec',
  'APRILE': 'April', 'MAGGIO': 'Maj', 'GIUGNO': 'Junij',
  'LUGLIO': 'Julij', 'AGOSTO': 'Avgust', 'SETTEMBRE': 'September',
  'OTTOBRE': 'Oktober', 'NOVEMBRE': 'November', 'DICEMBRE': 'December',
};

// Convert IT input to SL (normalise Italian descriptions to Slovenian)
export function normalizeITtoSL(text: string): string {
  if (!text) return text;
  let result = text;

  // Convert Italian months to Slovenian (case-aware)
  for (const [itMonth, slMonth] of Object.entries(IT_TO_SL_MONTHS)) {
    result = result.replace(new RegExp(itMonth, 'gi'), (match) => {
      if (match === match.toUpperCase()) return slMonth.toUpperCase();
      if (match[0] === match[0].toUpperCase()) return slMonth;
      return slMonth.toLowerCase();
    });
  }

  // Convert common IT terms to SL
  const itToSL: Record<string, string> = {
    'NOLEGGIO LUNGO TERMINE': 'DOLGOROCNI NAJEM',
    'TARGA': 'REGISTRSKA ST.',
    'CANONE MENSILE': 'MESECNINA',
    'ANTICIPO CONTRATTUALE': 'POGODBENI POLOG',
    'ADDEBITO CONTRAVVENZIONI': 'OBRACUN KAZNI',
    'ADDEBITO ASSICURAZIONE': 'OBRACUN ZAVAROVANJA',
    'RISARCIMENTO DANNI': 'POVRACILO SKODE',
    'Riferimento contratto del': 'Sklicevanje na pogodbo z dne',
    'Opravljiene storitve po pogodbi z dne': 'Opravljene storitve po pogodbi z dne',
  };

  for (const [it, sl] of Object.entries(itToSL)) {
    result = result.replace(new RegExp(it, 'gi'), sl);
  }

  // Handle "CANONE MESE DI APRILE 2026" → "MESECNINA ZA APRIL 2026"
  result = result.replace(
    /CANONE MESE DI ([A-Z]+) (\d{4})/gi,
    (_match, month, year) => {
      const slMonth = IT_TO_SL_MONTHS[month.toUpperCase()] || month;
      return `MESECNINA ZA ${slMonth.toUpperCase()} ${year}`;
    }
  );

  return result;
}

// Get secondary translation of SL text from the static dictionary
export function getSecondaryTranslation(slText: string, secondaryLang: InvoiceLang | null): string | null {
  if (!secondaryLang || secondaryLang === 'SL') return null;
  const found = STATIC_TRANSLATIONS[slText];
  if (found) return found[secondaryLang] || null;
  return null;
}

// Build bilingual label: "SL tekst / secondary tekst" or just "SL tekst"
export function biLabel(slText: string, secondaryLang: InvoiceLang | null): string {
  if (!secondaryLang) return slText;
  const secondary = getSecondaryTranslation(slText, secondaryLang);
  if (!secondary || secondary === slText) return slText;
  return `${slText} / ${secondary}`;
}

// Normalise service period: convert IT month names to SL
export function normalizeServicePeriod(period: string | null): string {
  if (!period) return '';
  let result = period;
  for (const [itMonth, slMonth] of Object.entries(IT_TO_SL_MONTHS)) {
    result = result.replace(new RegExp(itMonth, 'gi'), slMonth);
  }
  return result;
}

// Build bilingual service period: "April / Aprile 2026" or just "April 2026"
export function getBilingualPeriod(period: string | null, secondaryLang: InvoiceLang | null): string {
  if (!period) return '';
  const slPeriod = normalizeServicePeriod(period);
  if (!secondaryLang) return slPeriod;

  const parts = slPeriod.split(' ');
  const slMonth = parts[0];
  const year = parts[1] || '';
  const secondary = STATIC_TRANSLATIONS[slMonth];
  if (!secondary) return slPeriod;
  const secMonth = secondaryLang !== 'SL' ? secondary[secondaryLang] : null;
  if (!secMonth || secMonth === slMonth) return slPeriod;

  // "April 2026 / Aprile 2026" → "April / Aprile 2026"
  return `${slPeriod} / ${secMonth} ${year}`.replace(
    `${slMonth} ${year} / ${secMonth} ${year}`,
    `${slMonth} / ${secMonth} ${year}`
  );
}

function shouldSkipTranslation(text: string): boolean {
  if (!text || text.trim() === '') return true;

  // Skip ONLY if the ENTIRE string is a date (no other text)
  if (/^\d{1,4}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/.test(text.trim())) return true;

  // Skip ONLY if the ENTIRE string is a number (possibly with EUR/km)
  if (/^[\d\s.,]+(EUR|km|KM|€)?$/.test(text.trim())) return true;

  // Skip registration plates (e.g. LJ44-TGG)
  if (/^[A-Z]{2}[\d]{2}-[A-Z]{3}$/.test(text.trim())) return true;

  // DO NOT skip strings that contain text + date/number combinations
  // e.g. "CANONE MESE DI APRILE 2026" — contains text, must translate
  // e.g. "Riferimento contratto del 24/11/2025" — contains text, must translate

  return false;
}

// Translate IT description → SL via static normalisation, then DeepL fallback
export async function translateITtoSL(
  text: string,
  deeplWebhookUrl: string
): Promise<string> {
  if (!text) return text;
  if (shouldSkipTranslation(text)) return text;

  // If text is already a known SL key, skip translation
  if (STATIC_TRANSLATIONS[text]) return text;

  // Static normalisation (always runs, no webhook needed)
  const normalized = normalizeITtoSL(text);
  if (normalized !== text) return normalized;

  // DeepL fallback — IT → SL
  if (!deeplWebhookUrl) return text;
  try {
    const response = await fetch(deeplWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source_lang: 'IT', target_lang: 'SL' }),
    });
    if (!response.ok) return text;
    const data = await response.json();
    return data.translation || text;
  } catch {
    return text;
  }
}

// Convert SL text back to IT (for secondary display in bilingual invoices)
export function normalizeSLtoIT(text: string): string {
  if (!text) return text;
  let result = text;

  const SL_TO_IT_MONTHS: Record<string, string> = {
    'JANUAR': 'GENNAIO', 'FEBRUAR': 'FEBBRAIO', 'MAREC': 'MARZO',
    'APRIL': 'APRILE', 'MAJ': 'MAGGIO', 'JUNIJ': 'GIUGNO',
    'JULIJ': 'LUGLIO', 'AVGUST': 'AGOSTO', 'SEPTEMBER': 'SETTEMBRE',
    'OKTOBER': 'OTTOBRE', 'NOVEMBER': 'NOVEMBRE', 'DECEMBER': 'DICEMBRE',
  };

  // "MESECNINA ZA APRIL 2026" → "CANONE MESE DI APRILE 2026"
  result = result.replace(
    /MESECNINA ZA ([A-Z]+) (\d{4})/gi,
    (_match, month, year) => {
      const itMonth = SL_TO_IT_MONTHS[month.toUpperCase()] || month;
      return `CANONE MESE DI ${itMonth} ${year}`;
    }
  );

  result = result.replace(/REGISTRSKA ST\./gi, 'TARGA');
  result = result.replace(/DOLGOROCNI NAJEM/gi, 'NOLEGGIO LUNGO TERMINE');
  result = result.replace(/BANCNO NAKAZILO/gi, 'BONIFICO BANCARIO');

  return result;
}

// Translate SL text while preserving embedded date values
// Extracts date → translates text part → reinserts date
export async function translateWithDatePreservation(
  text: string,
  targetLang: InvoiceLang,
  deeplWebhookUrl: string
): Promise<string> {
  if (!text || targetLang === 'SL') return text;

  // Extract date pattern if present (DD/MM/YYYY or similar)
  const dateMatch = text.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/);
  if (dateMatch) {
    const dateStr = dateMatch[0];
    const textWithoutDate = text.replace(dateStr, '§DATE§').trim();
    const translated = await translateSLtoSecondary(textWithoutDate, targetLang, deeplWebhookUrl);
    return translated.replace('§DATE§', dateStr);
  }
  return translateSLtoSecondary(text, targetLang, deeplWebhookUrl);
}

// Get secondary translation (SL → IT or SL → EN) via static dict, then DeepL fallback
export async function translateSLtoSecondary(
  slText: string,
  secondaryLang: InvoiceLang,
  deeplWebhookUrl: string
): Promise<string> {
  if (!slText || secondaryLang === 'SL') return slText;
  if (shouldSkipTranslation(slText)) return slText;

  // Static dict lookup first (always runs)
  const staticResult = getSecondaryTranslation(slText, secondaryLang);
  if (staticResult) return staticResult;

  // DeepL fallback — SL → IT or SL → EN
  if (!deeplWebhookUrl) return slText;
  try {
    const response = await fetch(deeplWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: slText,
        source_lang: 'SL',
        target_lang: secondaryLang === 'IT' ? 'IT' : 'EN-GB',
      }),
    });
    if (!response.ok) return slText;
    const data = await response.json();
    return data.translation || slText;
  } catch {
    return slText;
  }
}
