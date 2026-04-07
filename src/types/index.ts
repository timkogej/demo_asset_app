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
