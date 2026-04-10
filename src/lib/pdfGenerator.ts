import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InvoiceRecord, Settings } from '../types';
import { clientDisplayName } from './clientHelpers';
import { formatCurrency, formatDate } from './invoiceCalculations';
import { supabase } from './supabase';

export async function generateInvoicePDF(invoice: InvoiceRecord, settings: Settings): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const client = invoice.client!;

  const marginL = 20;
  const marginR = 190;
  let y = 15;

  // --- LOGO ---
  if (settings.company_logo_url) {
    try {
      // company_logo_url stores a storage path — generate a signed URL to fetch it
      const logoPath = settings.company_logo_url;
      let logoFetchUrl: string;

      if (logoPath.startsWith('http')) {
        // Legacy: already a full URL (public bucket era)
        logoFetchUrl = logoPath;
      } else {
        const { data, error } = await supabase.storage
          .from('invoice-pdfs')
          .createSignedUrl(logoPath, 60);
        if (error || !data) throw new Error('Logo signed URL failed');
        logoFetchUrl = data.signedUrl;
      }

      const logoResp = await fetch(logoFetchUrl);
      const logoBlob = await logoResp.blob();
      const logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(logoBlob);
      });
      doc.addImage(logoBase64, 'PNG', 75, y, 60, 20);
      y += 25;
    } catch {
      // skip logo on error — PDF still generates without it
    }
  }

  // --- INVOICE NUMBER BOX (left) ---
  doc.setDrawColor(0);
  doc.rect(marginL, y, 60, 20);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('RAČUN ŠT.:', marginL + 2, y + 6);
  doc.text('FATTURA N.:', marginL + 2, y + 11);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.invoice_number, marginL + 35, y + 9);
  doc.setFont('helvetica', 'normal');

  // --- CLIENT BOX (right) ---
  doc.rect(115, y, 75, 20);
  doc.setFontSize(8);
  const clientName = clientDisplayName(client);
  doc.text(clientName, 117, y + 4);
  doc.text(client.address || '', 117, y + 8);
  doc.text(
    `${client.postal_code || ''} - ${client.city || ''} - ${client.country || ''}`,
    117, y + 12
  );
  if (client.registration_number) doc.text(`C.F. ${client.registration_number}`, 117, y + 16);
  if (client.tax_number) doc.text(`P.IVA ${client.tax_number}`, 117, y + 20);

  y += 25;

  // --- DATE ROW ---
  doc.rect(marginL, y, 60, 12);
  doc.setFontSize(8);
  doc.text('Datum računa', marginL + 2, y + 4);
  doc.text('Data fattura', marginL + 2, y + 8);
  doc.setFontSize(10);
  doc.text(formatDate(invoice.invoice_date), marginL + 35, y + 7);

  if (invoice.service_period) {
    doc.setFontSize(8);
    doc.text('Datum opr. Storitev: / Data prest. Servizi:', 90, y + 4);
    doc.setFontSize(10);
    doc.text(invoice.service_period, 165, y + 4);
  }

  y += 18;

  // --- ITEMS TABLE ---
  const tableBody = (invoice.items || []).map((item) => {
    if (item.line_type === 'text') {
      return [{ content: item.description, colSpan: 5 }];
    }
    if (item.line_type === 'space') {
      return ['', '', '', '', ''];
    }
    return [
      item.code || '',
      item.description,
      item.quantity === 1 ? '1' : item.quantity.toString(),
      item.unit_price > 0 ? `${formatCurrency(item.unit_price)} €` : '',
      item.total > 0 ? `${formatCurrency(item.total)} €` : '',
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['cod', 'descrizione', 'q.tà', 'prezzo u. €', 'totale €']],
    body: tableBody,
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 100 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
    },
    headStyles: { fontStyle: 'bold', lineWidth: 0.3 },
    margin: { left: marginL, right: 10 },
  });

  y = (doc as any).lastAutoTable.finalY + 5;

  // --- TOTALS (right side) ---
  const totalsX = 140;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('netto', totalsX, y);
  doc.text(`${formatCurrency(invoice.subtotal)} €`, marginR, y, { align: 'right' });
  y += 5;
  doc.text(`IVA ${invoice.vat_rate}%`, totalsX, y);
  doc.text(
    invoice.is_reverse_charge ? '' : `${formatCurrency(invoice.vat_amount)} €`,
    marginR, y, { align: 'right' }
  );
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('TOTALE', totalsX, y);
  doc.text(`${formatCurrency(invoice.total)} €`, marginR, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');

  // --- PAYMENT INFO (left side) ---
  const payY = (doc as any).lastAutoTable.finalY + 5;
  const payX = marginL;

  if (invoice.payment_schedules && invoice.payment_schedules.length > 0) {
    doc.setFontSize(8);
    doc.text('IBAN', payX, payY);
    doc.rect(payX + 20, payY - 4, 70, 6);
    doc.text(settings.iban || '', payX + 22, payY);
    doc.text('SWIFT', payX, payY + 7);
    doc.rect(payX + 20, payY + 3, 70, 6);
    doc.text(settings.swift || '', payX + 22, payY + 7);
    doc.text('PAGAMENTO', payX, payY + 14);
    doc.rect(payX + 20, payY + 10, 70, 6);
    doc.text(settings.payment_method || '', payX + 22, payY + 14);
    doc.text('ROK PLAČILA/SCADENZA', payX, payY + 21);
    invoice.payment_schedules.forEach((sched, i) => {
      doc.rect(payX + 20, payY + 17 + i * 7, 70, 6);
      doc.text(
        `${formatDate(sched.due_date)} EURO ${formatCurrency(sched.amount)}`,
        payX + 22, payY + 21 + i * 7
      );
    });
  } else {
    doc.setFontSize(8);
    const rows = [
      ['IBAN', settings.iban || ''],
      ['SWIFT', settings.swift || ''],
      ['PAGAMENTO', settings.payment_method || ''],
      ['ROK PLACILA', invoice.due_date ? formatDate(invoice.due_date) : ''],
      ['SCADENZA', invoice.due_date ? formatDate(invoice.due_date) : ''],
    ];
    rows.forEach((row, i) => {
      doc.text(row[0], payX, payY + i * 7);
      doc.rect(payX + 20, payY - 4 + i * 7, 70, 6);
      doc.text(row[1], payX + 22, payY + i * 7);
    });
  }

  // --- FOOTER ---
  const footerY = 280;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.company_name || 'MANUTECNICA D.O.O.', 105, footerY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(
    `${settings.company_address || ''} - ${settings.company_postal || ''} ${settings.company_city || ''} - ${settings.company_country || ''} - DDV SI ${settings.company_tax_number || ''} - OSNOVNI KAPITAL € ${settings.company_share_capital || ''}`,
    105, footerY + 4, { align: 'center' }
  );
  doc.text(`e-mail: ${settings.company_email || ''}`, 105, footerY + 8, { align: 'center' });

  return doc.output('blob');
}
