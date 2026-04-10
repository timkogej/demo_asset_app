import type { InvoiceItem } from '../types';

export function calculateInvoiceTotals(
  items: InvoiceItem[],
  vatRate: number,
  isReverseCharge: boolean
): { subtotal: number; vatAmount: number; total: number } {
  const subtotal = items
    .filter((i) => i.line_type === 'item')
    .reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

  const vatAmount = isReverseCharge ? 0 : Math.round(subtotal * vatRate) / 100;
  const total = subtotal + vatAmount;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function calculateDueDate(invoiceDate: string, dueDays: number): string {
  const d = new Date(invoiceDate);
  d.setDate(d.getDate() + dueDays);
  return d.toISOString().split('T')[0];
}

export function getItalianMonth(monthIndex: number, year: number): string {
  const months = [
    'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
  ];
  return `${months[monthIndex]} ${year}`;
}
