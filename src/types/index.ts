export interface Client {
  id: string;                        // custom text ID (e.g. CLI001, NAPO...)
  company_name: string | null;       // kept for compatibility, may be null
  company_name_additional: string | null; // main display name (naziv1)
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;            // ISO country code: SI, IT, HR, DE, RO...
  tax_number: string | null;         // davčna številka
  registration_number: string | null;// matična številka
  iban: string | null;
  bic: string | null;
  is_client: boolean;                // true = stranka, false = druga oseba
  is_vat_payer: boolean;             // davčni zavezanec
  comment: string | null;
  created_at: string;
  updated_at: string | null;

  // Relations
  vehicles?: {
    id: string;
    registration_number: string;
    vehicle_name: string | null;
  }[];
}

export interface Vehicle {
  id: string;
  registration_number: string;
  vehicle_name: string | null;
  year: number | null;
  current_km: number;
  status: string | null;
  client_id: string | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  ownership_status: 'LEASING' | "PROPRIETA'";
  leasing_company: string | null;
  contract_number: string | null;
  lease_installment: number | null;
  registration_expiry: string | null;
  next_inspection: string | null;
  insurance_company: string | null;
  insurance_expiry: string | null;
  annual_insurance_cost: number | null;
  received_installment: number | null;
  deposit: number | null;
  lease_months: number | null;
  vehicle_country: string | null;
  deposit_per_month: number | null;
  monthly_insurance: number | null;
  profit_difference: number | null;
  client?: {
    id: string;
    company_name: string | null;
    company_name_additional: string | null;
    email: string | null;
    country: string | null;
  } | null;
}

export interface Penalty {
  id: string;
  vehicle_id: string;
  client_id: string;
  vehicle?: Vehicle;
  client?: Client;
  amount: number;
  reason?: string;
  penalty_date: string;
  added_to_invoice_id?: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  client_id: string;
  vehicle_id?: string;
  client?: Client;
  vehicle?: Vehicle;
  invoice_number: string;
  base_amount: number;
  penalties_total: number;
  total_amount: number;
  billing_month: number;
  billing_year: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  sent_at?: string;
  paid_at?: string;
  pdf_url?: string;
  notes?: string;
  created_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  client_id: string;
  invoice?: Invoice;
  client?: Client;
  amount: number;
  payment_date: string;
  method?: string;
  confirmed: boolean;
  notes?: string;
  created_at: string;
}

export interface VehicleFile {
  id: string;
  vehicle_id: string;
  file_name: string;
  file_path: string;
  file_url: string;
  file_size: number;
  file_type: string;
  category: string;
  uploaded_at: string;
  vehicle?: {
    registration_number: string;
    vehicle_name: string | null;
  };
}

export type Language = 'it' | 'sl';

export type InvoiceStatus = 'draft' | 'confirmed' | 'sent' | 'paid' | 'cancelled';
export type InvoiceType = 'monthly_rent' | 'deposit' | 'penalties' | 'insurance' | 'damage' | 'other';

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  sort_order: number;
  code: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  line_type: 'item' | 'text' | 'subtotal' | 'space';
  show_translation: boolean;
}

export interface InvoicePaymentSchedule {
  id: string;
  invoice_id: string;
  due_date: string;
  amount: number;
  is_paid: boolean;
  paid_at: string | null;
  notes: string | null;
}

export interface InvoiceRecord {
  id: string;
  invoice_number: string;
  invoice_year: number;
  invoice_sequence: number;
  invoice_type: InvoiceType;
  client_id: string | null;
  vehicle_id: string | null;
  invoice_date: string;
  service_date: string | null;
  service_period: string | null;
  due_date: string | null;
  contract_ref_date: string | null;
  contract_ref_it: string | null;
  contract_ref_sl: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  is_reverse_charge: boolean;
  vat_exempt_reason: string | null;
  status: InvoiceStatus;
  sent_at: string | null;
  sent_to_email: string | null;
  pdf_url: string | null;
  pdf_path: string | null;
  language: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  billing_month: number | null;
  // Relations
  client?: Client | null;
  vehicle?: Vehicle | null;
  items?: InvoiceItem[];
  payment_schedules?: InvoicePaymentSchedule[];
}

export interface Settings {
  id: number;
  company_name: string | null;
  company_address: string | null;
  company_postal: string | null;
  company_city: string | null;
  company_country: string | null;
  company_tax_number: string | null;
  company_reg_number: string | null;
  company_share_capital: string | null;
  company_email: string | null;
  company_logo_url: string | null;
  iban: string | null;
  swift: string | null;
  payment_method: string | null;
  invoice_current_year: number | null;
  invoice_start_number: number | null;
  vat_rate: number | null;
  contract_ref_it: string | null;
  contract_ref_sl: string | null;
  payment_due_days: number | null;
  n8n_webhook_url: string | null;
  vies_webhook_url: string | null;
  cc_email: string | null;
  email_subject_it: string | null;
  email_subject_sl: string | null;
  email_body_it: string | null;
  email_body_sl: string | null;
  deepl_api_key: string | null;
  deepl_webhook_url: string | null;
  logo_manutecnica_url: string | null;
  logo_varent_url: string | null;
}
