import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InvoiceRecord, Settings, InvoiceCode } from '../types';
import { supabase } from './supabase';
import {
  getSecondaryLanguage,
  biLabel,
  getBilingualPeriod,
  normalizeITtoSL,
  normalizeSLtoIT,
  getSecondaryTranslation,
  translateWithDeepL,
  type InvoiceLang,
} from './invoiceTranslator';

// ─── TEXT SANITIZER ──────────────────────────────────────────────────────────
// All text passed to doc.text() must go through deepSanitize() — jsPDF cannot
// render accented/diacritic characters with the built-in helvetica font.
// Also strips zero-width spaces and other invisible chars that cause spaced-out rendering.
function deepSanitize(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/[​‌‍﻿­]/g, '')
    .replace(/ /g, ' ')
    .replace(/[^\x00-\x7F]/g, (c) => {
      const map: Record<string, string> = {
        'š': 's', 'č': 'c', 'ž': 'z', 'Š': 'S', 'Č': 'C', 'Ž': 'Z',
        'đ': 'd', 'Đ': 'D', 'ć': 'c', 'Ć': 'C',
        'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
        'à': 'a', 'è': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u',
        'ä': 'a', 'ë': 'e', 'ï': 'i', 'ö': 'o', 'ü': 'u',
        'ñ': 'n',
        '‘': "'", '’': "'", '“': '"', '”': '"',
      };
      return map[c] !== undefined ? map[c] : '';
    });
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────
function formatDateIT(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

// ─── LOGO FETCHING ───────────────────────────────────────────────────────────
async function fetchLogoBase64(url: string): Promise<string | null> {
  try {
    const isStoragePath = url.includes('supabase') || !url.startsWith('http');
    let fetchUrl = url;

    if (isStoragePath) {
      const path = url.includes('invoice-pdfs/')
        ? url.split('invoice-pdfs/')[1]
        : url;
      const { data } = await supabase.storage
        .from('invoice-pdfs')
        .createSignedUrl(path, 300);
      if (!data?.signedUrl) return null;
      fetchUrl = data.signedUrl;
    }

    const response = await fetch(fetchUrl);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── TAX LABEL ───────────────────────────────────────────────────────────────
function getTaxLabel(secondaryLang: InvoiceLang | null): string {
  if (!secondaryLang) return 'ID za DDV';
  if (secondaryLang === 'IT') return 'ID za DDV / P. IVA';
  return 'ID za DDV / VAT ID';
}

// ─── PAYMENT METHOD SL TRANSLATION ───────────────────────────────────────────
function getPaymentMethodSL(method: string): string {
  const methodMap: Record<string, string> = {
    'BONIFICO BANCARIO': 'BANCNO NAKAZILO',
    'bonifico bancario': 'bancno nakazilo',
    'Bonifico bancario': 'Bancno nakazilo',
    'BONIFICO': 'BANCNO NAKAZILO',
    'CONTANTI': 'GOTOVINA',
    'CARTA DI CREDITO': 'KREDITNA KARTICA',
    'ASSEGNO': 'CEK',
    'PAYPAL': 'PAYPAL',
  };
  return methodMap[method] || method;
}

// ─── REVERSE CHARGE DISCLAIMER TEXT ──────────────────────────────────────────
// Always Slovenian only — no secondary language for this legal text
function getReverseChargeText(): string[] {
  return [
    'DDV v skladu s 1. odstavkom 25. clena ZDDV-1 obracunan',
    'Reverse Charge',
  ];
}

// ─── MAIN PDF GENERATOR ──────────────────────────────────────────────────────
export async function generateInvoicePDF(
  invoice: InvoiceRecord,
  settings: Settings,
  invoiceCodes?: InvoiceCode[]
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Determine languages — primary is always SL, secondary depends on client country
  const secondaryLang: InvoiceLang | null = getSecondaryLanguage(invoice.client?.country || null);

  // Helper: bilingual label (SL primary, secondary after "/" — or just SL if no secondary)
  const bi = (slText: string): string => {
    if (!secondaryLang) return deepSanitize(slText);
    const combined = biLabel(slText, secondaryLang);
    if (combined !== slText) return deepSanitize(combined);
    if (secondaryLang === 'IT') {
      const normalized = normalizeSLtoIT(slText);
      if (normalized !== slText) return deepSanitize(`${slText} / ${normalized}`);
    }
    return deepSanitize(slText);
  };

  // input_language tells us what language the item descriptions are stored in
  const inputLang = ((invoice as InvoiceRecord & { input_language?: string }).input_language || 'IT') as 'IT' | 'SL';

  // biDesc: translate item description to { primary (SL), secondary (IT/EN/null) }
  const biDesc = async (
    description: string,
    itemCode?: string | null,
    lang: 'IT' | 'SL' = 'IT'
  ): Promise<{ primary: string; secondary: string | null }> => {
    if (!description || !description.trim()) return { primary: '', secondary: null };

    if (itemCode && invoiceCodes) {
      const codeRecord = invoiceCodes.find(c => c.code === itemCode);
      if (codeRecord) {
        const primary = deepSanitize(codeRecord.description_sl || codeRecord.description_it);
        let secondary: string | null = null;
        if (secondaryLang === 'IT') secondary = deepSanitize(codeRecord.description_it);
        else if (secondaryLang === 'EN') secondary = deepSanitize(codeRecord.description_en || codeRecord.description_it);
        return { primary, secondary: secondary !== primary ? secondary : null };
      }
    }

    let slText: string;
    let originalIT: string | null = null;

    if (lang === 'IT') {
      originalIT = description;
      slText = normalizeITtoSL(description);
      if (slText === description && settings.deepl_webhook_url) {
        const deepLSL = await translateWithDeepL(description, 'SL', settings.deepl_webhook_url);
        if (deepLSL && deepLSL !== description) slText = deepLSL;
      }
    } else {
      slText = description;
    }

    if (!secondaryLang) {
      return { primary: deepSanitize(slText), secondary: null };
    }

    let secText: string | null = null;

    if (secondaryLang === 'IT') {
      if (originalIT && originalIT !== slText) {
        secText = originalIT;
      } else {
        const normalized = normalizeSLtoIT(slText);
        if (normalized !== slText) {
          secText = normalized;
        } else if (settings.deepl_webhook_url) {
          const deepLIT = await translateWithDeepL(slText, 'IT', settings.deepl_webhook_url);
          if (deepLIT && deepLIT !== slText) secText = deepLIT;
        }
      }
      // NEVER leave Italian clients without Italian secondary
      if (!secText) secText = originalIT || description;
    } else if (secondaryLang === 'EN') {
      const static_ = getSecondaryTranslation(slText, 'EN');
      if (static_) {
        secText = static_;
      } else if (settings.deepl_webhook_url) {
        const deepLEN = await translateWithDeepL(slText, 'EN', settings.deepl_webhook_url);
        if (deepLEN && deepLEN !== slText) secText = deepLEN;
      }
    }

    return {
      primary: deepSanitize(slText),
      secondary: secText && deepSanitize(secText) !== deepSanitize(slText) ? deepSanitize(secText) : null,
    };
  };

  const marginL = 15;
  const marginR = 195;
  let y = 10;

  // ─── FETCH LOGOS (async before drawing) ──────────────────────────────────
  const [logoManutecnica, varentLogoBase64] = await Promise.all([
    settings.logo_manutecnica_url ? fetchLogoBase64(settings.logo_manutecnica_url) : Promise.resolve(null),
    settings.logo_varent_url ? fetchLogoBase64(settings.logo_varent_url) : Promise.resolve(null),
  ]);

  // ─── MANUTECNICA LOGO (top, left-aligned) ────────────────────────────────
  if (logoManutecnica) {
    doc.addImage(logoManutecnica, 'JPEG', marginL, y, 70, 20);
    y += 26;
  } else {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MANUTECNICA D.O.O.', marginL, y + 8);
    doc.setFont('helvetica', 'normal');
    y += 16;
  }

  // ─── COMPANY DATA (top right, same height as logo) ───────────────────────
  const companyY = 12;
  const companyRightEdge = marginR;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(deepSanitize(settings.company_name || 'MANUTECNICA D.O.O.'), companyRightEdge, companyY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(deepSanitize(settings.company_address || 'BREZNIKOVA ULICA, 15'), companyRightEdge, companyY + 4, { align: 'right' });
  doc.text(
    `${deepSanitize(settings.company_postal || '1230')} - ${deepSanitize(settings.company_city || 'DOMZALE')} (${deepSanitize(settings.company_country || 'SI')})`,
    companyRightEdge, companyY + 8, { align: 'right' }
  );
  doc.text(`DDV ${deepSanitize(settings.company_tax_number || 'SI51128551')}`, companyRightEdge, companyY + 12, { align: 'right' });
  if (settings.company_reg_number) {
    doc.text(`Mat. ${deepSanitize(settings.company_reg_number)}`, companyRightEdge, companyY + 16, { align: 'right' });
  }
  doc.text(deepSanitize(settings.company_email || ''), companyRightEdge, companyY + 20, { align: 'right' });

  y = Math.max(y, companyY + 26);

  // ─── INVOICE NUMBER BOX (left) ───────────────────────────────────────────
  const boxY = y;
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(marginL, boxY, 65, 22);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  if (!secondaryLang) {
    // SL only — single row, number on same line
    doc.text('RACUN ST.:', marginL + 2, boxY + 12);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(deepSanitize(invoice.invoice_number), marginL + 28, boxY + 12);
    doc.setFont('helvetica', 'normal');
  } else {
    // Bilingual — SL on top, secondary below — NO "/" separator
    doc.text('RACUN ST.:', marginL + 2, boxY + 7);
    const secNumberLabel = secondaryLang === 'IT' ? 'FATTURA N.' : 'INVOICE NO.';
    doc.text(secNumberLabel, marginL + 2, boxY + 14);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(deepSanitize(invoice.invoice_number), marginL + 35, boxY + 11);
    doc.setFont('helvetica', 'normal');
  }

  // ─── CLIENT BOX (right) ──────────────────────────────────────────────────
  const client = invoice.client;
  const clientLines: string[] = [];

  const clientName = deepSanitize(
    client?.company_name ||
    client?.company_name_additional ||
    ''
  );
  if (clientName) clientLines.push(clientName);

  const clientNameAdd = deepSanitize(client?.company_name_additional || '');
  if (clientNameAdd && clientNameAdd !== clientName) clientLines.push(clientNameAdd);

  const address = deepSanitize(client?.address || '');
  if (address) clientLines.push(address);

  const postalCode = deepSanitize(client?.postal_code || '');
  const city = deepSanitize(client?.city || '');
  const country = deepSanitize(client?.country || '');
  const cityLine = [postalCode, city, country].filter(v => v.length > 0).join(' - ');
  if (cityLine) clientLines.push(cityLine);

  if (client?.registration_number) {
    clientLines.push(`C.F. ${deepSanitize(client.registration_number)}`);
  }
  if (client?.tax_number) {
    clientLines.push(`${getTaxLabel(secondaryLang)} ${deepSanitize(client.tax_number)}`);
  }

  const lineHeight = 4.5;
  const clientBoxPadding = 5;
  const clientBoxHeight = Math.max(24, clientLines.length * lineHeight + clientBoxPadding);
  doc.rect(110, boxY, 85, clientBoxHeight);

  clientLines.forEach((line, i) => {
    doc.setFontSize(i === 0 ? 8.5 : 7.5);
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    const maxWidth = 82;
    const textWidth = doc.getTextWidth(line);
    const displayLine = textWidth > maxWidth
      ? line.substring(0, Math.floor(line.length * maxWidth / textWidth) - 2) + '..'
      : line;
    doc.text(displayLine, 112, boxY + clientBoxPadding + (i * lineHeight));
  });
  doc.setFont('helvetica', 'normal');

  y = boxY + Math.max(22, clientBoxHeight) + 4;

  // ─── DATE ROW ────────────────────────────────────────────────────────────
  const dateRowY = y;
  doc.setLineWidth(0.3);
  doc.rect(marginL, dateRowY, 65, 14);
  doc.setFontSize(7.5);
  if (!secondaryLang) {
    // SL only — single row, date on same line
    doc.text('Datum racuna:', marginL + 2, dateRowY + 8);
    doc.setFontSize(10);
    doc.text(formatDateIT(invoice.invoice_date), marginL + 36, dateRowY + 8);
  } else {
    // Bilingual — SL top, secondary below — NO "/" separator
    doc.text('Datum racuna', marginL + 2, dateRowY + 5);
    const secDateLabel = secondaryLang === 'IT' ? 'Data fattura' : 'Invoice date';
    doc.text(secDateLabel, marginL + 2, dateRowY + 10);
    doc.setFontSize(10);
    doc.text(formatDateIT(invoice.invoice_date), marginL + 38, dateRowY + 8);
  }

  if (invoice.service_period) {
    const serviceLabel = deepSanitize(bi('Datum opr. Storitev:'));
    const biPeriod = deepSanitize(getBilingualPeriod(invoice.service_period, secondaryLang));
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(serviceLabel, marginR, dateRowY + 5, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(biPeriod, marginR, dateRowY + 10, { align: 'right' });
    doc.setFont('helvetica', 'normal');
  }

  y += 20;

  // ─── ITEMS TABLE ─────────────────────────────────────────────────────────
  const items = invoice.items || [];

  function isPurelyNumeric(text: string): boolean {
    return /^[\d\s.,€$/+-]+$/.test(text.trim());
  }

  // Build table body — translate each item via biDesc
  const tableBody: object[][] = [];

  for (const item of items) {
    if (item.line_type === 'space') {
      tableBody.push([{ content: '' }, { content: '' }, { content: '' }, { content: '' }, { content: '' }]);
      continue;
    }

    // Skip translation for purely numeric content
    if (isPurelyNumeric(item.description)) {
      tableBody.push([
        { content: '' },
        { content: deepSanitize(item.description), styles: { fontSize: 7.5 } },
        { content: item.quantity === 1 ? '1' : String(item.quantity || 0) },
        { content: item.unit_price > 0 ? `${formatCurrency(item.unit_price)} EUR` : '' },
        { content: item.total > 0 ? `${formatCurrency(item.total)} EUR` : '' },
      ]);
      continue;
    }

    let desc = await biDesc(item.description, item.code, inputLang);

    // Safety check: Italian clients MUST have Italian secondary
    if (secondaryLang === 'IT' && !desc.secondary && desc.primary) {
      const itFallback = normalizeSLtoIT(item.description) !== item.description
        ? normalizeSLtoIT(item.description)
        : item.description;
      desc = { ...desc, secondary: deepSanitize(itFallback) };
    }

    const showTrans = item.show_translation !== false;
    const secondaryDesc = showTrans && desc.secondary ? desc.secondary : '';

    const descContent =
      secondaryDesc && secondaryDesc !== desc.primary
        ? { content: desc.primary + '\n' + secondaryDesc, styles: { fontSize: 7, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } } }
        : { content: desc.primary, styles: { fontSize: 7.5 } };

    if (item.line_type === 'text') {
      tableBody.push([
        { content: '' },
        descContent,
        { content: '' },
        { content: '' },
        { content: '' },
      ]);
    } else {
      tableBody.push([
        { content: '' },
        descContent,
        { content: item.quantity === 1 ? '1' : (item.quantity || 0).toString() },
        { content: item.unit_price > 0 ? `${formatCurrency(item.unit_price)} EUR` : '' },
        { content: item.total > 0 ? `${formatCurrency(item.total)} EUR` : '' },
      ]);
    }
  }

  // Reverse charge disclaimer row
  if (invoice.is_reverse_charge) {
    const rcLines = getReverseChargeText();
    tableBody.push([
      { content: '' },
      { content: rcLines.join('\n'), styles: { fontSize: 7, fontStyle: 'italic' } },
      { content: '' },
      { content: '' },
      { content: '' },
    ]);
  }

  // Column headers — SL primary with secondary after "/"
  const headers = [
    bi('koda'),
    bi('opis'),
    bi('kol.'),
    bi('cena/enoto'),
    bi('skupaj'),
  ];

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 },
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fontStyle: 'bold',
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 95 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
    },
    margin: { left: marginL, right: 10 },
  });

  const tableEndY = (doc as any).lastAutoTable.finalY;

  // ─── TOTALS (right) ──────────────────────────────────────────────────────
  const totalsX = 140;
  y = tableEndY + 5;
  doc.setLineWidth(0.2);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(bi('neto'), totalsX, y);
  doc.text(`${formatCurrency(invoice.subtotal)} EUR`, marginR, y, { align: 'right' });
  y += 5;

  if (invoice.is_reverse_charge) {
    const vatLabel = secondaryLang === 'IT' ? 'DDV / IVA 0%'
      : secondaryLang === 'EN' ? 'DDV / VAT 0%'
      : 'DDV 0%';
    doc.text(vatLabel, totalsX, y);
    doc.text('0,00 EUR', marginR, y, { align: 'right' });
  } else {
    const vatLabel = secondaryLang === 'IT' ? `DDV / IVA ${invoice.vat_rate || 22}%`
      : secondaryLang === 'EN' ? `DDV / VAT ${invoice.vat_rate || 22}%`
      : `DDV ${invoice.vat_rate || 22}%`;
    doc.text(vatLabel, totalsX, y);
    doc.text(`${formatCurrency(invoice.vat_amount)} EUR`, marginR, y, { align: 'right' });
  }
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(bi('SKUPAJ'), totalsX, y);
  doc.text(`${formatCurrency(invoice.total)} EUR`, marginR, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  // ─── PAYMENT INFO (left, aligned with totals) ─────────────────────────────
  const payStartY = tableEndY + 5;
  const payX = marginL;
  const labelW = 32;
  const valueW = 58;
  const rowH = 8;

  const slPayMethod = getPaymentMethodSL(settings.payment_method || 'BONIFICO BANCARIO');
  const payMethodValue = secondaryLang === 'IT'
    ? `${slPayMethod}\n${settings.payment_method || 'BONIFICO BANCARIO'}`
    : secondaryLang === 'EN'
      ? `${slPayMethod}\nBANK TRANSFER`
      : slPayMethod;
  const placiloLabel = secondaryLang
    ? `PLACILO /\n${secondaryLang === 'IT' ? 'PAGAMENTO' : 'PAYMENT'}`
    : 'PLACILO';
  const rokPlacilaLabel = secondaryLang
    ? `ROK PLACILA /\n${secondaryLang === 'IT' ? 'SCADENZA' : 'DUE DATE'}`
    : 'ROK PLACILA';

  const payRows =
    invoice.payment_schedules && invoice.payment_schedules.length > 0
      ? [
          ['IBAN', deepSanitize(settings.iban || '')],
          ['SWIFT', deepSanitize(settings.swift || '')],
          [placiloLabel, payMethodValue],
          ...invoice.payment_schedules.map((s, i) => [
            i === 0 ? rokPlacilaLabel : '',
            `${formatDateIT(s.due_date)} EUR ${formatCurrency(s.amount)}`,
          ]),
        ]
      : [
          ['IBAN', deepSanitize(settings.iban || '')],
          ['SWIFT', deepSanitize(settings.swift || '')],
          [placiloLabel, payMethodValue],
          [rokPlacilaLabel, invoice.due_date ? formatDateIT(invoice.due_date) : ''],
        ];

  doc.setFontSize(7);
  payRows.forEach((row, i) => {
    const rowY = payStartY + (i * rowH);
    if (row[0]) {
      const labelLines = row[0].split('\n');
      labelLines.forEach((line, li) => {
        doc.text(deepSanitize(line), payX, rowY + 3 + (li * 3.5));
      });
    }
    doc.rect(payX + labelW, rowY, valueW, rowH);
    const valueLines = row[1].split('\n');
    valueLines.forEach((vline, vli) => {
      doc.text(deepSanitize(vline), payX + labelW + 2, rowY + 3 + (vli * 3.5));
    });
  });

  // ─── FOOTER ──────────────────────────────────────────────────────────────
  const footerY = 268;

  doc.setDrawColor(180);
  doc.setLineWidth(0.2);
  doc.line(marginL, footerY - 2, marginR, footerY - 2);

  if (varentLogoBase64) {
    doc.addImage(varentLogoBase64, 'JPEG', 70, footerY + 2, 70, 26);
  }

  return doc.output('blob');
}
