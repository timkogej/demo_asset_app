import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InvoiceRecord, Settings } from '../types';
import { supabase } from './supabase';
import {
  getSecondaryLanguage,
  biLabel,
  getBilingualPeriod,
  translateITtoSL,
  translateSLtoSecondary,
  translateWithDatePreservation,
  normalizeSLtoIT,
  type InvoiceLang,
} from './invoiceTranslator';

// ─── TEXT SANITIZER ──────────────────────────────────────────────────────────
// All text passed to doc.text() must go through sanitize() — jsPDF cannot
// render accented/diacritic characters with the built-in helvetica font.
function sanitize(text: string | null | undefined): string {
  return (text || '')
    .replace(/š/g, 's').replace(/Š/g, 'S')
    .replace(/č/g, 'c').replace(/Č/g, 'C')
    .replace(/ž/g, 'z').replace(/Ž/g, 'Z')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/ć/g, 'c').replace(/Ć/g, 'C')
    .replace(/á/g, 'a').replace(/é/g, 'e')
    .replace(/í/g, 'i').replace(/ó/g, 'o')
    .replace(/ú/g, 'u').replace(/ñ/g, 'n')
    .replace(/à/g, 'a').replace(/è/g, 'e')
    .replace(/ì/g, 'i').replace(/ò/g, 'o')
    .replace(/ù/g, 'u');
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
function getReverseChargeText(secondaryLang: InvoiceLang | null): string[] {
  const slText = 'DDV v skladu s 1. odstavkom 25. clena ZDDV-1 obracunan';
  const rcText = 'Reverse Charge';

  if (!secondaryLang) {
    return [slText, rcText];
  }
  if (secondaryLang === 'IT') {
    const itText = 'IVA ai sensi dell\'art. 25 comma 1 dello ZDDV-1 applicata';
    return [slText, rcText, itText, rcText];
  }
  if (secondaryLang === 'EN') {
    const enText = 'VAT pursuant to Art. 25 para. 1 of ZDDV-1 applied';
    return [slText, rcText, enText, rcText];
  }
  return [slText, rcText];
}

// ─── MAIN PDF GENERATOR ──────────────────────────────────────────────────────
export async function generateInvoicePDF(
  invoice: InvoiceRecord,
  settings: Settings
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Determine languages — primary is always SL, secondary depends on client country
  const secondaryLang: InvoiceLang | null = getSecondaryLanguage(invoice.client?.country || null);

  // Helper: bilingual label (SL primary, secondary after "/" — or just SL if no secondary)
  const bi = (slText: string): string => sanitize(biLabel(slText, secondaryLang));

  // input_language tells us what language the item descriptions are stored in
  const inputLang = (invoice as InvoiceRecord & { input_language?: string }).input_language || 'IT';

  const marginL = 15;
  const marginR = 195;
  let y = 10;

  // ─── FETCH LOGOS (async before drawing) ──────────────────────────────────
  const [logoManutecnica, varentLogoBase64] = await Promise.all([
    settings.logo_manutecnica_url ? fetchLogoBase64(settings.logo_manutecnica_url) : Promise.resolve(null),
    settings.logo_varent_url ? fetchLogoBase64(settings.logo_varent_url) : Promise.resolve(null),
  ]);

  // ─── MANUTECNICA LOGO (top, centered) ────────────────────────────────────
  if (logoManutecnica) {
    doc.addImage(logoManutecnica, 'JPEG', 65, y, 80, 22);
    y += 28;
  } else {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MANUTECNICA D.O.O.', 105, y + 8, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    y += 16;
  }

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
    doc.text(sanitize(invoice.invoice_number), marginL + 28, boxY + 12);
    doc.setFont('helvetica', 'normal');
  } else {
    // Bilingual — SL on top, secondary below — NO "/" separator
    doc.text('RACUN ST.:', marginL + 2, boxY + 7);
    const secNumberLabel = secondaryLang === 'IT' ? 'FATTURA N.' : 'INVOICE NO.';
    doc.text(secNumberLabel, marginL + 2, boxY + 14);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitize(invoice.invoice_number), marginL + 35, boxY + 11);
    doc.setFont('helvetica', 'normal');
  }

  // ─── CLIENT BOX (right) ──────────────────────────────────────────────────
  const client = invoice.client;
  const clientLines: string[] = [];

  const clientName = sanitize(
    client?.company_name ||
    client?.company_name_additional ||
    ''
  );
  if (clientName) clientLines.push(clientName);

  const clientNameAdd = sanitize(client?.company_name_additional || '');
  if (clientNameAdd && clientNameAdd !== clientName) clientLines.push(clientNameAdd);

  const address = sanitize(client?.address || '');
  if (address) clientLines.push(address);

  const postalCode = sanitize(client?.postal_code || '');
  const city = sanitize(client?.city || '');
  const country = sanitize(client?.country || '');
  const cityLine = [postalCode, city, country].filter(v => v.length > 0).join(' - ');
  if (cityLine) clientLines.push(cityLine);

  if (client?.registration_number) {
    clientLines.push(`C.F. ${sanitize(client.registration_number)}`);
  }
  if (client?.tax_number) {
    clientLines.push(`${getTaxLabel(secondaryLang)} ${sanitize(client.tax_number)}`);
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
    const serviceLabel = sanitize(bi('Datum opr. Storitev:'));
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(serviceLabel, 83, y + 5);
    const biPeriod = getBilingualPeriod(invoice.service_period, secondaryLang);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const labelWidth = doc.getTextWidth(serviceLabel);
    doc.text(sanitize(biPeriod), 83 + labelWidth + 3, y + 5);
    doc.setFont('helvetica', 'normal');
  }

  y += 20;

  // ─── ITEMS TABLE ─────────────────────────────────────────────────────────
  const items = invoice.items || [];

  // Translate descriptions: IT input → SL primary, then SL → secondary
  const slDescriptions: Record<string, string> = {};
  const secDescriptions: Record<string, string> = {};

  for (const item of items) {
    if (item.line_type === 'space') continue;

    // Step 1: get SL primary text
    const slText = inputLang === 'SL'
      ? item.description
      : await translateITtoSL(item.description, settings.deepl_webhook_url || '');
    slDescriptions[item.id] = slText;

    // Step 2: get secondary text (only if client is not SI)
    if (secondaryLang) {
      let secText: string;
      if (secondaryLang === 'IT') {
        // Try static normalization SL → IT first
        secText = normalizeSLtoIT(slText);
        // If no change, fall back to DeepL with date preservation
        if (secText === slText && settings.deepl_webhook_url) {
          secText = await translateWithDatePreservation(slText, 'IT', settings.deepl_webhook_url);
        }
      } else {
        // EN: use DeepL with date preservation
        secText = await translateWithDatePreservation(slText, 'EN', settings.deepl_webhook_url || '');
      }
      if (secText !== slText) {
        secDescriptions[item.id] = secText;
      }
    }
  }

  // Build table body
  const tableBody: object[][] = [];

  for (const item of items) {
    if (item.line_type === 'space') {
      tableBody.push([{ content: '' }, { content: '' }, { content: '' }, { content: '' }, { content: '' }]);
      continue;
    }

    const primaryDesc = sanitize(slDescriptions[item.id] ?? item.description);
    const showTrans = item.show_translation !== false;
    const secondaryDesc =
      showTrans && secondaryLang
        ? sanitize(secDescriptions[item.id] || '')
        : '';

    const descContent =
      secondaryDesc && secondaryDesc !== primaryDesc
        ? { content: primaryDesc + '\n' + secondaryDesc, styles: { fontSize: 7, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } } }
        : { content: primaryDesc, styles: { fontSize: 7.5 } };

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
        { content: item.code || '' },
        descContent,
        { content: item.quantity === 1 ? '1' : (item.quantity || 0).toString() },
        { content: item.unit_price > 0 ? `${formatCurrency(item.unit_price)} EUR` : '' },
        { content: item.total > 0 ? `${formatCurrency(item.total)} EUR` : '' },
      ]);
    }
  }

  // Reverse charge disclaimer row
  if (invoice.is_reverse_charge) {
    const rcLines = getReverseChargeText(secondaryLang);
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
          ['IBAN', sanitize(settings.iban || '')],
          ['SWIFT', sanitize(settings.swift || '')],
          [placiloLabel, payMethodValue],
          ...invoice.payment_schedules.map((s, i) => [
            i === 0 ? rokPlacilaLabel : '',
            `${formatDateIT(s.due_date)} EUR ${formatCurrency(s.amount)}`,
          ]),
        ]
      : [
          ['IBAN', sanitize(settings.iban || '')],
          ['SWIFT', sanitize(settings.swift || '')],
          [placiloLabel, payMethodValue],
          [rokPlacilaLabel, invoice.due_date ? formatDateIT(invoice.due_date) : ''],
        ];

  doc.setFontSize(7);
  payRows.forEach((row, i) => {
    const rowY = payStartY + (i * rowH);
    if (row[0]) {
      const labelLines = row[0].split('\n');
      labelLines.forEach((line, li) => {
        doc.text(sanitize(line), payX, rowY + 3 + (li * 3.5));
      });
    }
    doc.rect(payX + labelW, rowY, valueW, rowH);
    const valueLines = row[1].split('\n');
    valueLines.forEach((vline, vli) => {
      doc.text(sanitize(vline), payX + labelW + 2, rowY + 3 + (vli * 3.5));
    });
  });

  // ─── FOOTER ──────────────────────────────────────────────────────────────
  const footerY = 268;

  if (varentLogoBase64) {
    doc.addImage(varentLogoBase64, 'JPEG', 77, footerY - 18, 55, 16);
  }

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text('MANUTECNICA D.O.O.', 105, footerY + 6, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text(
    `BREZNIKOVA ULICA, 15 - 1230 DOMZALE - SLOVENIJA - DDV SI 51128551 - OSNOVNI KAPITAL EUR ${sanitize(settings.company_share_capital || '7.500,00')}`,
    105, footerY + 10, { align: 'center' }
  );
  doc.text(
    `e-mail: ${sanitize(settings.company_email || 'manutecnica.doo@gmail.com')}`,
    105, footerY + 14, { align: 'center' }
  );

  return doc.output('blob');
}
