export interface TemplateVariable {
  key: string;
  label_it: string;
  label_sl: string;
  description_it: string;
  description_sl: string;
  category: 'vehicle' | 'client' | 'invoice' | 'financial';
}

export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  // Vehicle
  { key: '{vehicle_name}',          label_it: 'Nome veicolo',       label_sl: 'Ime vozila',           description_it: 'Marca e modello del veicolo',        description_sl: 'Znamka in model vozila',         category: 'vehicle' },
  { key: '{registration_number}',   label_it: 'Targa',              label_sl: 'Registrska',           description_it: 'Numero di targa',                    description_sl: 'Registrska številka',            category: 'vehicle' },
  { key: '{insurance_company}',     label_it: 'Compagnia assic.',   label_sl: 'Zavarovalnica',        description_it: 'Nome della compagnia assicurativa',  description_sl: 'Ime zavarovalnice',              category: 'vehicle' },
  { key: '{annual_insurance_cost}', label_it: 'Costo assic. annuo', label_sl: 'Letno zavarovanje',    description_it: 'Costo annuale assicurazione',        description_sl: 'Letni strošek zavarovanja',      category: 'financial' },
  { key: '{received_installment}',  label_it: 'Rata ricevuta',      label_sl: 'Prejeti obrok',        description_it: 'Importo rata mensile ricevuta',      description_sl: 'Mesečni prejeti obrok',          category: 'financial' },
  { key: '{lease_installment}',     label_it: 'Rata leasing',       label_sl: 'Obrok leasinga',       description_it: 'Importo rata leasing',               description_sl: 'Mesečni obrok leasinga',         category: 'financial' },
  { key: '{deposit}',               label_it: 'Anticipo',           label_sl: 'Polog',                description_it: 'Importo anticipo contrattuale',      description_sl: 'Znesek pologa',                  category: 'financial' },
  // Client
  { key: '{client_name}',           label_it: 'Nome cliente',       label_sl: 'Ime stranke',          description_it: 'Ragione sociale del cliente',        description_sl: 'Naziv stranke',                  category: 'client' },
  { key: '{client_address}',        label_it: 'Indirizzo cliente',  label_sl: 'Naslov stranke',       description_it: 'Indirizzo del cliente',              description_sl: 'Naslov stranke',                 category: 'client' },
  // Invoice
  { key: '{contract_date}',         label_it: 'Data contratto',     label_sl: 'Datum pogodbe',        description_it: 'Data di inizio contratto noleggio',  description_sl: 'Datum začetka pogodbe',          category: 'invoice' },
  { key: '{service_period}',        label_it: 'Periodo',            label_sl: 'Obdobje',              description_it: 'Mese e anno del servizio',           description_sl: 'Mesec in leto storitve',          category: 'invoice' },
  { key: '{invoice_date}',          label_it: 'Data fattura',       label_sl: 'Datum računa',         description_it: 'Data della fattura',                 description_sl: 'Datum računa',                   category: 'invoice' },
  { key: '{damage_article}',        label_it: 'Articolo danno',     label_sl: 'Člen škode',           description_it: 'Numero articolo per danni',          description_sl: 'Številka člena za škodo',        category: 'invoice' },
  { key: '{description}',           label_it: 'Descrizione libera', label_sl: 'Prosto besedilo',      description_it: 'Testo libero personalizzabile',      description_sl: 'Prosto besedilo po meri',        category: 'invoice' },
];

function formatDate(d: string | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

export function resolveVariables(
  content: string,
  data: {
    vehicle?: Record<string, unknown> | null;
    client?: Record<string, unknown> | null;
    invoice?: Record<string, unknown>;
    servicePeriod?: string;
    invoiceDate?: string;
    contractDate?: string;
  }
): string {
  if (!content) return content;
  let result = content;

  const v = (data.vehicle || {}) as Record<string, unknown>;
  const c = (data.client || {}) as Record<string, unknown>;

  const replacements: Record<string, string> = {
    '{vehicle_name}':          String(v.vehicle_name || ''),
    '{registration_number}':   String(v.registration_number || ''),
    '{insurance_company}':     String(v.insurance_company || ''),
    '{annual_insurance_cost}': v.annual_insurance_cost != null ? String(v.annual_insurance_cost) : '',
    '{received_installment}':  v.received_installment != null ? String(v.received_installment) : '',
    '{lease_installment}':     v.lease_installment != null ? String(v.lease_installment) : '',
    '{deposit}':               v.deposit != null ? String(v.deposit) : '',
    '{client_name}':           String(c.company_name_additional || c.company_name || ''),
    '{client_address}':        String(c.address || ''),
    '{contract_date}':         formatDate(data.contractDate || (v.lease_start_date as string | undefined)),
    '{service_period}':        data.servicePeriod || '',
    '{invoice_date}':          formatDate(data.invoiceDate),
    '{damage_article}':        '',
    '{description}':           '',
  };

  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, value);
  }

  return result;
}

export function resolveUnitPrice(
  unitPriceVar: string | null,
  vehicle: Record<string, unknown> | null | undefined
): number {
  if (!unitPriceVar || !vehicle) return 0;
  const map: Record<string, number> = {
    '{received_installment}':  Number(vehicle.received_installment) || 0,
    '{lease_installment}':     Number(vehicle.lease_installment) || 0,
    '{deposit}':               Number(vehicle.deposit) || 0,
    '{annual_insurance_cost}': Number(vehicle.annual_insurance_cost) || 0,
  };
  return map[unitPriceVar] || 0;
}
