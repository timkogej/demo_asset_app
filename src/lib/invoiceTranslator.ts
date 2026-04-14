export type InvoiceLang = 'SL' | 'IT' | 'EN';

export function getPrimaryLanguage(): InvoiceLang {
  return 'SL'; // Always Slovenian
}

export function getSecondaryLanguage(countryCode: string | null): InvoiceLang | null {
  if (!countryCode) return null;
  const upper = countryCode.toUpperCase().trim();
  if (upper === 'SI') return null;      // SL only
  if (upper === 'IT') return 'IT';      // SL + IT
  return 'EN';                          // SL + EN
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
  'PLACILO':        { IT: 'PAGAMENTO',        EN: 'PAYMENT' },
  'ROK PLACILA':    { IT: 'SCADENZA',         EN: 'DUE DATE' },
  'BANCNO NAKAZILO': { IT: 'BONIFICO BANCARIO', EN: 'BANK TRANSFER' },
  'GOTOVINA':       { IT: 'CONTANTI',          EN: 'CASH' },
  'KREDITNA KARTICA': { IT: 'CARTA DI CREDITO', EN: 'CREDIT CARD' },

  // Invoice content — SL primary, IT secondary
  'DOLGOROCNI NAJEM':    { IT: 'NOLEGGIO LUNGO TERMINE',       EN: 'LONG TERM RENTAL' },
  'REGISTRSKA ST.':      { IT: 'TARGA',                         EN: 'PLATE NO.' },
  'Registrska st.':      { IT: 'Targa',                         EN: 'Plate no.' },
  'REGISTRSKA':          { IT: 'TARGA',                         EN: 'PLATE' },
  'POGODBENI POLOG':     { IT: 'ANTICIPO CONTRATTUALE',         EN: 'CONTRACT DEPOSIT' },
  'OBRACUN KAZNI':       { IT: 'ADDEBITO CONTRAVVENZIONI',      EN: 'PENALTIES CHARGE' },
  'OBRACUN ZAVAROVANJA': { IT: 'ADDEBITO ASSICURAZIONE',        EN: 'INSURANCE CHARGE' },
  'POVRACILO SKODE':     { IT: 'RISARCIMENTO DANNI',            EN: 'DAMAGE COMPENSATION' },
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

  // Month names SL → IT (both upper and title case)
  const SL_TO_IT_MONTHS: Record<string, string> = {
    'JANUAR': 'GENNAIO', 'FEBRUAR': 'FEBBRAIO', 'MAREC': 'MARZO',
    'APRIL': 'APRILE', 'MAJ': 'MAGGIO', 'JUNIJ': 'GIUGNO',
    'JULIJ': 'LUGLIO', 'AVGUST': 'AGOSTO', 'SEPTEMBER': 'SETTEMBRE',
    'OKTOBER': 'OTTOBRE', 'NOVEMBER': 'NOVEMBRE', 'DECEMBER': 'DICEMBRE',
    'Januar': 'Gennaio', 'Februar': 'Febbraio', 'Marec': 'Marzo',
    'April': 'Aprile', 'Maj': 'Maggio', 'Junij': 'Giugno',
    'Julij': 'Luglio', 'Avgust': 'Agosto', 'September': 'Settembre',
    'Oktober': 'Ottobre', 'November': 'Novembre', 'December': 'Dicembre',
  };

  for (const [sl, it] of Object.entries(SL_TO_IT_MONTHS)) {
    result = result.replace(new RegExp(`\\b${sl}\\b`, 'g'), it);
  }

  // Core invoice terms SL → IT (longest match first to avoid partial replacements)
  const SL_TO_IT: Record<string, string> = {
    'DOLGOROCNI NAJEM OSEBNEGA VOZILA':                          'NOLEGGIO A LUNGO TERMINE AUTOVETTURA',
    'DOLGOROCNI NAJEM TOVORNEGA VOZILA':                         'NOLEGGIO A LUNGO TERMINE AUTOCARRO',
    'DOLGOROCNI NAJEM':                                          'NOLEGGIO LUNGO TERMINE',
    'MESECNINA ZA':                                              'CANONE MESE DI',
    'MESECNA NAJEMNINA':                                         'CANONE MENSILE',
    'POGODBENI POLOG':                                           'ANTICIPO CONTRATTUALE',
    'POVRACILO SKODE':                                           'RISARCIMENTO DANNI',
    'OBRACUN KAZNI':                                             'ADDEBITO CONTRAVVENZIONI',
    'OBRACUN ZAVAROVANJA':                                       'ADDEBITO ASSICURAZIONE',
    'REGISTRSKA ST.':                                            'TARGA',
    'REGISTRSKA':                                                'TARGA',
    'Sklicevanje na pogodbo z dne':                              'Riferimento contratto del',
    'Opravljene storitve po pogodbi z dne':                      'Opravljiene storitve po pogodbi z dne',
    'BANCNO NAKAZILO':                                           'BONIFICO BANCARIO',
    'GOTOVINA':                                                  'CONTANTI',
    'KREDITNA KARTICA':                                          'CARTA DI CREDITO',
    'STROSEK PRANJA OSEBNEGA VOZILA':                            'ADDEBITO SPESE DI LAVAGGIO AUTOVETTURA',
    'STROSEK PRANJA TOVORNEGA VOZILA':                           'ADDEBITO SPESE DI LAVAGGIO AUTOCARRO',
    'STROSEK TOCENJA GORIVA':                                    'ADDEBITO SPESE DI RIFORNIMENTO CARBURANTE',
    'OBRACUN ZAVAROVALNIСКЕ POLICE':                             'ADDEBITO POLIZZA ASSICURATIVA',
    'STROSEK LETNE REGISTRACIJE':                                'ADDEBITO SPESE DI REGISTRAZIONE ANNUALE',
    'STROSEK PRVE REGISTRACIJE':                                 'ADDEBITO SPESE DI IMMATRICOLAZIONE',
    'STROSEK ODJAVE VOZILA':                                     'ADDEBITO SPESE DI RADIAZIONE',
    'STROSEK UVOZA':                                             'ADDEBITO SPESE DI IMPORTAZIONE',
    'STROSEK IZTERJAVE PO ROKU - RAZRED 1':                      'ADDEBITO SPESE DI INCASSO OLTRE TERMINE - FASCIA 1',
    'STROSEK IZTERJAVE PO ROKU - RAZRED 2':                      'ADDEBITO SPESE DI INCASSO OLTRE TERMINE - FASCIA 2',
    'STROSEK IZTERJAVE PO ROKU - RAZRED 3':                      'ADDEBITO SPESE DI INCASSO OLTRE TERMINE - FASCIA 3',
    'STROSEK IZTERJAVE PO ROKU - RAZRED 4':                      'ADDEBITO SPESE DI INCASSO OLTRE TERMINE - FASCIA 4',
    'STROSEK IZVENPOGODBENIH STORITEV - TEKOCINA ZA STEKLA':     'ADDEBITO SPESE PER SERVIZI EXTRA CONTRATTO - LIQUIDO LAVAVETRI',
    'STROSEK IZVENPOGODBENIH STORITEV - ADBLUE':                 'ADDEBITO SPESE PER SERVIZI EXTRA CONTRATTO - ADBLUE',
    'STROSEK IZVENPOGODBENIH STORITEV - SPLOSNO':                'ADDEBITO SPESE PER SERVIZI EXTRA CONTRATTO - GENERICO',
    'STROSEK IZVENPOGODBENIH STORITEV - NADOMESTNO VOZILO':      'ADDEBITO SPESE PER SERVIZI EXTRA CONTRATTO - VETTURA DI CORTESIA',
    'STROSEK IZVENPOGODBENIH STORITEV - VZDRZEVANJE':            'ADDEBITO SPESE PER SERVIZI EXTRA CONTRATTO - MANUTENZIONE',
    'STROSEK IZVENPOGODBENIH STORITEV - KAROSERIJA':             'ADDEBITO SPESE PER SERVIZI EXTRA CONTRATTO - CARROZZERIA',
    'STROSEK IZVENPOGODBENIH STORITEV - PNEVMATIKE':             'ADDEBITO SPESE PER SERVIZI EXTRA CONTRATTO - PNEUMATICI',
    'STROSEK IZVENPOGODBENIH STORITEV - STEKLA':                 'ADDEBITO SPESE PER SERVIZI EXTRA CONTRATTO - CRISTALLI',
    'STROSEK PREVOZA - PREMESTITVE - DOSTAVE - PREVZEMA':        'ADDEBITO SPESE DI TRASPORTO - TRASFERIMENTO - CONSEGNA - RITIRO',
    'STORITEV ISKANJA IN UPRAVLJANJA DOBAVITELJEV':              'SERVIZIO DI RICERCA E GESTIONE FORNITORI',
    'STORITEV RAZVOJA MARKETINGA IN PROMOCIJE':                  'SERVIZIO DI RICERCA SVILUPPO MARKETING PROMOZIONE',
    'STROSEK OBNOVE OPREME - KOMPLET PRVE POMOCI':               'ADDEBITO RIPRISTINO DOTAZIONI - CASSETTA PS',
    'STROSEK OBNOVE OPREME - GASILNIK':                          'ADDEBITO RIPRISTINO DOTAZIONI - ESTINTORE',
    'STROSEK OBNOVE OPREME - KIT ZARNIC H1 H4 H7':              'ADDEBITO RIPRISTINO DOTAZIONI - KIT LAMPADE H1 H4 H7',
    'STROSEK OBNOVE OPREME - ODSEVNI JOPIC':                     'ADDEBITO RIPRISTINO DOTAZIONI - GILET AV',
    'STROSEK OBNOVE OPREME - VARNOSTNI TRIKOTNIK':               'ADDEBITO RIPRISTINO DOTAZIONI - TRIANGOLO',
    'STROSEK OBNOVE OPREME - SPLOSNO':                           'ADDEBITO RIPRISTINO DOTAZIONI - GENERICO',
    'STROSEK IZVENPOGODBENIH STORITEV':                          'ADDEBITO SPESE PER SERVIZI EXTRA CONTRATTO',
    'POVRACILO SKODE CL. 4':                                     'RISARCIMENTO DANNI ART. 4',
    'POVRACILO SKODE CL. 8':                                     'RISARCIMENTO DANNI ART. 8',
    'OBRACUN KAZNI CL. 12':                                      'ADDEBITO PENALE ART. 12',
    'STROSEK PONOVNEGA OBVESTILA O PREKRSKU':                    'ADDEBITO SPESE DI RINOTIFICA CONTRAVVENZIONE',
  };

  // Apply longest match first to avoid partial replacements
  const sortedKeys = Object.keys(SL_TO_IT).sort((a, b) => b.length - a.length);
  for (const sl of sortedKeys) {
    result = result.replace(new RegExp(sl, 'gi'), SL_TO_IT[sl]);
  }

  // Handle MESECNINA ZA + month + year
  result = result.replace(
    /MESECNINA ZA ([A-Z]+) (\d{4})/gi,
    (_match, month, year) => {
      const itMonth = SL_TO_IT_MONTHS[month.toUpperCase()] || month;
      return `CANONE MESE DI ${itMonth} ${year}`;
    }
  );

  // Handle MESECNINA ZA + month (no year)
  result = result.replace(
    /MESECNINA ZA ([A-Z]+)$/gi,
    (_match, month) => {
      const itMonth = SL_TO_IT_MONTHS[month.toUpperCase()] || month;
      return `CANONE MESE DI ${itMonth}`;
    }
  );

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

// Translate text via DeepL webhook — supports SL, EN, IT targets
export async function translateWithDeepL(
  text: string,
  targetLang: 'SL' | 'EN' | 'IT',
  deeplWebhookUrl: string
): Promise<string> {
  if (!text || !deeplWebhookUrl) return text;
  if (shouldSkipTranslation(text)) return text;

  try {
    const deeplTargetLang =
      targetLang === 'SL' ? 'SL' :
      targetLang === 'IT' ? 'IT' :
      'EN-GB';

    const response = await fetch(deeplWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        source_lang: targetLang === 'SL' ? 'IT' : 'SL',
        target_lang: deeplTargetLang,
      }),
    });
    if (!response.ok) return text;
    const data = await response.json();
    return data.translation || text;
  } catch {
    return text;
  }
}

// Get secondary translation (SL → IT or SL → EN) via static dict, then DeepL fallback
export async function translateSLtoSecondary(
  slText: string,
  secondaryLang: InvoiceLang,
  deeplWebhookUrl: string
): Promise<string> {
  if (!slText) return slText;
  if (secondaryLang === 'SL') return slText;
  if (shouldSkipTranslation(slText)) return slText;

  if (secondaryLang === 'IT') {
    // 1. Try static normalization first
    const normalized = normalizeSLtoIT(slText);
    if (normalized !== slText) return normalized;

    // 2. Try static translations dict
    const static_ = getSecondaryTranslation(slText, 'IT');
    if (static_ && static_ !== slText) return static_;

    // 3. DeepL SL → IT
    if (deeplWebhookUrl) {
      const result = await translateWithDeepL(slText, 'IT', deeplWebhookUrl);
      if (result && result !== slText) return result;
    }

    // 4. NEVER fall back to English — return original SL text
    return slText;
  }

  if (secondaryLang === 'EN') {
    const static_ = getSecondaryTranslation(slText, 'EN');
    if (static_ && static_ !== slText) return static_;

    if (deeplWebhookUrl) {
      const result = await translateWithDeepL(slText, 'EN', deeplWebhookUrl);
      if (result && result !== slText) return result;
    }
    return slText;
  }

  return slText;
}
