import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InvoiceRecord, Settings } from '../types';
import { supabase } from './supabase';
import {
  getSecondaryLanguage,
  translateStatic,
  translateServicePeriod,
  translateWithDeepL,
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

// ─── MAIN PDF GENERATOR ──────────────────────────────────────────────────────
export async function generateInvoicePDF(
  invoice: InvoiceRecord,
  settings: Settings
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Determine languages
  const secondaryLang: InvoiceLang = getSecondaryLanguage(invoice.client?.country || null);
  const showSecondary = secondaryLang !== 'IT';

  // Helper: bilingual label — "Italian / Secondary"
  const bi = (itText: string): string => {
    if (!showSecondary) return sanitize(itText);
    const sec = translateStatic(itText, secondaryLang);
    if (sec === itText) return sanitize(itText);
    return sanitize(itText) + ' / ' + sanitize(sec);
  };

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
  doc.text(bi('RACUN ST.:'), marginL + 2, boxY + 6);
  doc.text('FATTURA N.:', marginL + 2, boxY + 11);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(sanitize(invoice.invoice_number), marginL + 35, boxY + 9);
  doc.setFont('helvetica', 'normal');

  // ─── CLIENT BOX (right) ──────────────────────────────────────────────────
  const client = invoice.client;
  const clientLines: string[] = [];
  const clientName = sanitize(client?.company_name_additional || client?.company_name || '');
  const clientNameAdd = sanitize(client?.company_name || '');

  if (clientName) clientLines.push(clientName);
  if (clientNameAdd && clientNameAdd !== clientName) clientLines.push(clientNameAdd);
  if (client?.address) clientLines.push(sanitize(client.address));

  const cityLine = [client?.postal_code, client?.city, client?.country]
    .filter(Boolean)
    .map(sanitize)
    .join(' - ');
  if (cityLine) clientLines.push(cityLine);

  if (client?.registration_number) {
    clientLines.push(`C.F. ${sanitize(client.registration_number)}`);
  }
  if (client?.tax_number) {
    clientLines.push(`P.IVA ${sanitize(client.tax_number)}`);
  }

  // Box height: 5mm per line + 4mm padding, minimum 22mm
  const clientBoxHeight = Math.max(22, clientLines.length * 5 + 6);
  doc.rect(110, boxY, 85, clientBoxHeight);

  clientLines.forEach((line, i) => {
    doc.setFontSize(i === 0 ? 8.5 : 7.5);
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    doc.text(line, 112, boxY + 5 + i * 5);
  });
  doc.setFont('helvetica', 'normal');

  y = boxY + Math.max(22, clientBoxHeight) + 4;

  // ─── DATE ROW ────────────────────────────────────────────────────────────
  doc.setLineWidth(0.3);
  doc.rect(marginL, y, 65, 14);
  doc.setFontSize(7.5);
  doc.text(bi('Datum racuna'), marginL + 2, y + 5);
  doc.text('Data fattura', marginL + 2, y + 10);
  doc.setFontSize(10);
  doc.text(formatDateIT(invoice.invoice_date), marginL + 38, y + 8);

  if (invoice.service_period) {
    const serviceLabel = 'Datum opr. Storitev: / Data prest. Servizi:';
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.text(sanitize(serviceLabel), 85, y + 5);
    // Build bilingual service period: "Aprile/April 2026"
    const translated = translateServicePeriod(invoice.service_period, secondaryLang);
    let bilingualPeriod = invoice.service_period;
    if (translated !== invoice.service_period) {
      const itMonth = invoice.service_period.split(' ')[0];
      const slMonth = translated.split(' ')[0];
      const year = invoice.service_period.split(' ')[1] || '';
      bilingualPeriod = `${itMonth}/${slMonth} ${year}`;
    }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(sanitize(bilingualPeriod), 155, y + 5);
    doc.setFont('helvetica', 'normal');
  }

  y += 20;

  // ─── ITEMS TABLE ─────────────────────────────────────────────────────────
  const items = invoice.items || [];

  // Translate dynamic item descriptions using DeepL if needed
  const translatedDescriptions: Record<string, string> = {};
  if (showSecondary && settings.deepl_webhook_url) {
    for (const item of items) {
      if (item.line_type === 'item' || item.line_type === 'text') {
        const staticTrans = translateStatic(item.description, secondaryLang);
        if (staticTrans !== item.description) {
          translatedDescriptions[item.id] = staticTrans;
        } else {
          // Use DeepL via n8n proxy for custom descriptions
          const deepLTrans = await translateWithDeepL(
            item.description,
            secondaryLang as 'SL' | 'EN',
            settings.deepl_webhook_url
          );
          translatedDescriptions[item.id] = deepLTrans;
        }
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

    const primaryDesc = sanitize(item.description);
    const showTrans = item.show_translation !== false; // default true
    const secondaryDesc =
      showSecondary && showTrans
        ? sanitize(translatedDescriptions[item.id] || '')
        : '';

    const descContent =
      secondaryDesc && secondaryDesc !== primaryDesc
        ? { content: `${primaryDesc}\n${secondaryDesc}`, styles: { fontSize: 7.5, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 } } }
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

  // Column headers — bilingual
  const headers = [
    sanitize(bi('cod')),
    sanitize(bi('descrizione')),
    sanitize(bi('q.ta')),
    sanitize(bi('prezzo u.')),
    sanitize(bi('totale')),
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
  doc.text(sanitize(bi('netto')), totalsX, y);
  doc.text(`${formatCurrency(invoice.subtotal)} EUR`, marginR, y, { align: 'right' });
  y += 5;

  doc.text(`IVA / DDV ${invoice.vat_rate || 22}%`, totalsX, y);
  doc.text(
    invoice.is_reverse_charge ? '' : `${formatCurrency(invoice.vat_amount)} EUR`,
    marginR, y, { align: 'right' }
  );
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(sanitize(bi('TOTALE')), totalsX, y);
  doc.text(`${formatCurrency(invoice.total)} EUR`, marginR, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  // ─── PAYMENT INFO (left, aligned with totals) ─────────────────────────────
  const payStartY = tableEndY + 5;
  const payX = marginL;
  const labelW = 32;
  const valueW = 58;
  const rowH = 6;

  const payRows =
    invoice.payment_schedules && invoice.payment_schedules.length > 0
      ? [
          [bi('IBAN'), sanitize(settings.iban || '')],
          [bi('SWIFT'), sanitize(settings.swift || '')],
          [bi('PAGAMENTO'), sanitize(settings.payment_method || 'BONIFICO BANCARIO')],
          ...invoice.payment_schedules.map((s, i) => [
            i === 0 ? 'SCADENZA /\nROK PLACILA' : '',
            `${formatDateIT(s.due_date)} EUR ${formatCurrency(s.amount)}`,
          ]),
        ]
      : [
          [bi('IBAN'), sanitize(settings.iban || '')],
          [bi('SWIFT'), sanitize(settings.swift || '')],
          [bi('PAGAMENTO'), sanitize(settings.payment_method || 'BONIFICO BANCARIO')],
          ['SCADENZA /\nROK PLACILA', invoice.due_date ? formatDateIT(invoice.due_date) : ''],
        ];

  doc.setFontSize(7.5);
  payRows.forEach((row, i) => {
    const rowY = payStartY + (i * rowH);
    if (row[0]) {
      const lines = row[0].split('\n');
      lines.forEach((line, li) => {
        doc.text(sanitize(line), payX, rowY + 3 + (li * 3.5));
      });
    }
    doc.rect(payX + labelW, rowY, valueW, rowH);
    doc.text(sanitize(row[1]), payX + labelW + 2, rowY + 4);
  });

  // ─── FOOTER ──────────────────────────────────────────────────────────────
  const footerY = 268;

  // Varent logo (centered above footer)
  if (varentLogoBase64) {
    doc.addImage(varentLogoBase64, 'JPEG', 77, footerY - 18, 55, 16);
  }

  // Footer text (center)
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
