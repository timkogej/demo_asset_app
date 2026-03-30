export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  language: 'it' | 'sl';
  created_at: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  make: string;
  model: string;
  year?: number;
  current_km: number;
  status: 'active' | 'maintenance' | 'returning';
  client_id?: string;
  client?: Client;
  lease_start_date?: string;
  lease_end_date?: string;
  monthly_rate: number;
  created_at: string;
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
