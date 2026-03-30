import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { Invoice } from '../types';

const MONTHS_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

const MONTHS_SL = [
  'Januar', 'Februar', 'Marec', 'April', 'Maj', 'Junij',
  'Julij', 'Avgust', 'September', 'Oktober', 'November', 'December',
];

function formatCurrency(amount: number): string {
  return `€${amount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function generateInvoicePDF(invoice: Invoice): void {
  const lang = invoice.client?.language || 'it';
  const isIT = lang === 'it';

  const labels = {
    title: isIT ? 'FATTURA' : 'RAČUN',
    invoiceNo: isIT ? 'Numero fattura' : 'Številka računa',
    date: isIT ? 'Data' : 'Datum',
    billingPeriod: isIT ? 'Periodo di fatturazione' : 'Obdobje fakturiranja',
    clientDetails: isIT ? 'Dati cliente' : 'Podatki stranke',
    vehicleDetails: isIT ? 'Dati veicolo' : 'Podatki vozila',
    plate: isIT ? 'Targa' : 'Registrska',
    makeModel: isIT ? 'Marca/Modello' : 'Znamka/Model',
    description: isIT ? 'Descrizione' : 'Opis',
    amount: isIT ? 'Importo' : 'Znesek',
    baseLease: isIT ? 'Canone mensile leasing' : 'Mesečna najemnina',
    penalty: isIT ? 'Sanzione' : 'Kazen',
    subtotal: isIT ? 'Subtotale' : 'Vmesna vsota',
    penaltiesTotal: isIT ? 'Totale sanzioni' : 'Skupaj kazni',
    total: isIT ? 'TOTALE' : 'SKUPAJ',
    footer: isIT ? 'Generato da FleetInvoice' : 'Generirano z FleetInvoice',
    taxId: isIT ? 'Cod. fiscale' : 'Davčna št.',
    phone: isIT ? 'Tel.' : 'Tel.',
    address: isIT ? 'Indirizzo' : 'Naslov',
  };

  const months = isIT ? MONTHS_IT : MONTHS_SL;
  const monthName = months[(invoice.billing_month - 1) % 12];
  const billingPeriodStr = `${monthName} ${invoice.billing_year}`;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const primaryColor: [number, number, number] = [26, 71, 49];
  const accentColor: [number, number, number] = [74, 150, 104];
  const lightGreen: [number, number, number] = [212, 234, 217];
  const textDark: [number, number, number] = [28, 43, 34];
  const textMuted: [number, number, number] = [107, 143, 117];

  // Header background strip
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageW, 38, 'F');

  // Brand name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('FleetInvoice', 14, 18);

  // Tagline
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(212, 234, 217);
  doc.text(isIT ? 'Gestione flotte e leasing' : 'Upravljanje flote in najema', 14, 24);

  // Invoice title + number (right side)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(labels.title, pageW - 14, 16, { align: 'right' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${labels.invoiceNo}: ${invoice.invoice_number}`, pageW - 14, 23, { align: 'right' });
  doc.setFontSize(9);
  doc.text(`${labels.date}: ${format(new Date(), 'dd/MM/yyyy')}`, pageW - 14, 29, { align: 'right' });
  doc.text(`${labels.billingPeriod}: ${billingPeriodStr}`, pageW - 14, 35, { align: 'right' });

  let yPos = 50;

  // Client details block
  doc.setFillColor(...lightGreen);
  doc.roundedRect(14, yPos - 5, (pageW - 28) / 2 - 4, 42, 3, 3, 'F');

  doc.setTextColor(...primaryColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(labels.clientDetails, 18, yPos);

  doc.setTextColor(...textDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(invoice.client?.name || '-', 18, yPos + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...textMuted);

  let clientY = yPos + 13;
  if (invoice.client?.email) {
    doc.text(invoice.client.email, 18, clientY);
    clientY += 5;
  }
  if (invoice.client?.phone) {
    doc.text(`${labels.phone} ${invoice.client.phone}`, 18, clientY);
    clientY += 5;
  }
  if (invoice.client?.address) {
    doc.text(`${labels.address}: ${invoice.client.address}`, 18, clientY);
    clientY += 5;
  }
  if (invoice.client?.tax_id) {
    doc.text(`${labels.taxId}: ${invoice.client.tax_id}`, 18, clientY);
  }

  // Vehicle details block
  const colX = 14 + (pageW - 28) / 2 + 4;
  const colW = (pageW - 28) / 2 - 4;

  doc.setFillColor(...lightGreen);
  doc.roundedRect(colX, yPos - 5, colW, 42, 3, 3, 'F');

  doc.setTextColor(...primaryColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(labels.vehicleDetails, colX + 4, yPos);

  doc.setTextColor(...textDark);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const vehicleTitle = invoice.vehicle
    ? `${invoice.vehicle.make} ${invoice.vehicle.model}`
    : '-';
  doc.text(vehicleTitle, colX + 4, yPos + 7);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...textMuted);

  let vehicleY = yPos + 13;
  if (invoice.vehicle?.plate) {
    doc.text(`${labels.plate}: ${invoice.vehicle.plate}`, colX + 4, vehicleY);
    vehicleY += 5;
  }
  if (invoice.vehicle?.year) {
    doc.text(`${isIT ? 'Anno' : 'Leto'}: ${invoice.vehicle.year}`, colX + 4, vehicleY);
    vehicleY += 5;
  }
  if (invoice.vehicle?.current_km !== undefined) {
    doc.text(`KM: ${invoice.vehicle.current_km.toLocaleString('it-IT')}`, colX + 4, vehicleY);
  }

  yPos += 50;

  // Line items table
  const tableRows: (string | number)[][] = [];

  tableRows.push([labels.baseLease, formatCurrency(invoice.base_amount)]);

  if (invoice.penalties_total > 0) {
    tableRows.push([
      `${labels.penalty} (${isIT ? 'totale' : 'skupaj'})`,
      formatCurrency(invoice.penalties_total),
    ]);
  }

  autoTable(doc, {
    startY: yPos,
    head: [[labels.description, labels.amount]],
    body: tableRows,
    foot: [[labels.total, formatCurrency(invoice.total_amount)]],
    theme: 'grid',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
    },
    bodyStyles: {
      fontSize: 9,
      textColor: textDark,
    },
    footStyles: {
      fillColor: accentColor,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 40 },
    },
    margin: { left: 14, right: 14 },
    alternateRowStyles: {
      fillColor: [248, 250, 248],
    },
    tableLineColor: lightGreen,
    tableLineWidth: 0.3,
  });

  // Notes block
  if (invoice.notes) {
    const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...primaryColor);
    doc.text(isIT ? 'Note:' : 'Opombe:', 14, finalY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...textDark);
    doc.text(invoice.notes, 14, finalY + 5);
  }

  // Footer
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...primaryColor);
  doc.rect(0, pageH - 18, pageW, 18, 'F');
  doc.setTextColor(212, 234, 217);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(labels.footer, pageW / 2, pageH - 9, { align: 'center' });
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  doc.text(
    `${isIT ? 'Generato il' : 'Ustvarjeno dne'}: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
    pageW / 2,
    pageH - 4,
    { align: 'center' }
  );

  doc.save(`FI-${invoice.invoice_number}.pdf`);
}
