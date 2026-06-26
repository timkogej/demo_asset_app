// ─── VAT EXCEPTION TEXTS (manual 0% DDV override) ────────────────────────────
// Used when an invoice's DDV is manually overridden to 0% on a non
// reverse-charge invoice. `full` is stored in invoices.vat_exception_text and
// printed on the PDF; `short` is shown in the UI badge.
export interface VatExceptionText {
  id: string;
  short: string;
  full: string;
}

export const VAT_EXCEPTION_TEXTS: VatExceptionText[] = [
  {
    id: 'cl44',
    short: 'čl. 44/3',
    full: 'DDV ni obračunan na podlagi 3. točke 44. člena ZDDV-1',
  },
  {
    id: 'cl102',
    short: 'čl. 102',
    full: 'DDV je obračunan v skladu s 102. členom ZDDV-1',
  },
];

export function findVatExceptionByFull(full: string | null | undefined): VatExceptionText | undefined {
  if (!full) return undefined;
  return VAT_EXCEPTION_TEXTS.find((e) => e.full === full);
}
