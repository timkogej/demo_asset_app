export interface Client {
  id: string;                      // TEXT, 3-12 chars, uppercase letters/numbers e.g. "CLI001"
  company_name: string;
  company_name_additional?: string;
  is_client: boolean;
  email: string;
  phone?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  country?: string;
  iban?: string;
  bic?: string;
  registration_number?: string;
  tax_number?: string;
  is_vat_payer: boolean;
  comment?: string;
  created_at: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number | null;
  current_km: number;
  status: 'active' | 'maintenance' | 'returning';
  client_id: string | null;
  lease_start_date: string | null;
  lease_end_date: string | null;
  monthly_rate: number;
  created_at: string;

  // Ownership
  ownership_status: 'LEASING' | "PROPRIETA'";
  leasing_company: string | null;
  contract_number: string | null;
  lease_installment: number | null;

  // Registration & inspection
  registration_expiry: string | null;
  next_inspection: string | null;

  // Insurance (grouped)
  insurance_company: string | null;
  insurance_expiry: string | null;
  annual_insurance_cost: number | null;

  // Financial
  received_installment: number | null;
  deposit: number | null;
  lease_months: number | null;
  vehicle_country: string | null;

  // Computed (read-only, never sent on insert/update)
  deposit_per_month: number | null;
  monthly_insurance: number | null;
  profit_difference: number | null;

  // Relations (from join)
  client?: {
    id: string;
    company_name: string;
    email: string;
    country: string;
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
    plate: string;
    make: string;
    model: string;
  };
}

export type Language = 'it' | 'sl';
