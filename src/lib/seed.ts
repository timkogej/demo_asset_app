import { supabase } from './supabase';
import toast from 'react-hot-toast';

export async function seedDatabase(): Promise<void> {
  try {
    // Insert clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .insert([
        {
          name: 'Marco Rossi',
          email: 'marco.rossi@example.it',
          phone: '+39 348 123 4567',
          address: 'Via Roma 12, Milano, MI 20121',
          tax_id: 'RSSMRC80A01F205X',
          language: 'it',
        },
        {
          name: 'Luca Ferrari',
          email: 'luca.ferrari@example.it',
          phone: '+39 333 987 6543',
          address: 'Corso Venezia 5, Torino, TO 10121',
          tax_id: 'FRRLCU75B15L219Y',
          language: 'it',
        },
        {
          name: 'Ana Novak',
          email: 'ana.novak@example.si',
          phone: '+386 41 123 456',
          address: 'Slovenska cesta 14, Ljubljana, 1000',
          tax_id: '12345678',
          language: 'sl',
        },
      ])
      .select();

    if (clientsError) throw clientsError;
    if (!clients || clients.length === 0) throw new Error('No clients returned after insert');

    const [client1, client2, client3] = clients;

    // Insert vehicles
    const today = new Date();
    const leaseStart1 = new Date(today.getFullYear(), today.getMonth() - 8, 1);
    const leaseEnd1 = new Date(today.getFullYear() + 2, today.getMonth() - 8, 1);
    const leaseStart2 = new Date(today.getFullYear(), today.getMonth() - 4, 15);
    const leaseEnd2 = new Date(today.getFullYear() + 3, today.getMonth() - 4, 15);
    const leaseStart3 = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    const leaseEnd3 = new Date(today.getFullYear() + 1, today.getMonth() + 10, 1);

    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .insert([
        {
          plate: 'MI 123 AB',
          make: 'BMW',
          model: '320d',
          year: 2022,
          current_km: 45200,
          status: 'active',
          client_id: client1.id,
          lease_start_date: leaseStart1.toISOString().split('T')[0],
          lease_end_date: leaseEnd1.toISOString().split('T')[0],
          monthly_rate: 650.00,
        },
        {
          plate: 'TO 456 CD',
          make: 'Mercedes',
          model: 'C220d',
          year: 2023,
          current_km: 22100,
          status: 'active',
          client_id: client2.id,
          lease_start_date: leaseStart2.toISOString().split('T')[0],
          lease_end_date: leaseEnd2.toISOString().split('T')[0],
          monthly_rate: 780.00,
        },
        {
          plate: 'LJ 78 EF',
          make: 'Volkswagen',
          model: 'Passat',
          year: 2021,
          current_km: 61800,
          status: 'maintenance',
          client_id: client3.id,
          lease_start_date: leaseStart3.toISOString().split('T')[0],
          lease_end_date: leaseEnd3.toISOString().split('T')[0],
          monthly_rate: 520.00,
        },
      ])
      .select();

    if (vehiclesError) throw vehiclesError;
    if (!vehicles || vehicles.length === 0) throw new Error('No vehicles returned after insert');

    const [vehicle1, vehicle2] = vehicles;

    // Insert penalties
    const penaltyDate1 = new Date(today.getFullYear(), today.getMonth() - 1, 10);
    const penaltyDate2 = new Date(today.getFullYear(), today.getMonth(), 5);

    const { error: penaltiesError } = await supabase.from('penalties').insert([
      {
        vehicle_id: vehicle1.id,
        client_id: client1.id,
        amount: 150.00,
        reason: 'Eccesso di chilometraggio mensile',
        penalty_date: penaltyDate1.toISOString().split('T')[0],
      },
      {
        vehicle_id: vehicle2.id,
        client_id: client2.id,
        amount: 75.50,
        reason: 'Danni minori al paraurti anteriore',
        penalty_date: penaltyDate2.toISOString().split('T')[0],
      },
    ]);

    if (penaltiesError) throw penaltiesError;

    // Insert invoices for current month
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const invoiceBase = `FI-${currentYear}${String(currentMonth).padStart(2, '0')}`;

    const { error: invoicesError } = await supabase.from('invoices').insert([
      {
        client_id: client1.id,
        vehicle_id: vehicle1.id,
        invoice_number: `${invoiceBase}-001`,
        base_amount: 650.00,
        penalties_total: 150.00,
        total_amount: 800.00,
        billing_month: currentMonth,
        billing_year: currentYear,
        status: 'sent',
        sent_at: new Date().toISOString(),
      },
      {
        client_id: client2.id,
        vehicle_id: vehicle2.id,
        invoice_number: `${invoiceBase}-002`,
        base_amount: 780.00,
        penalties_total: 0,
        total_amount: 780.00,
        billing_month: currentMonth,
        billing_year: currentYear,
        status: 'paid',
        sent_at: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        paid_at: new Date().toISOString(),
      },
      {
        client_id: client3.id,
        vehicle_id: vehicles[2].id,
        invoice_number: `${invoiceBase}-003`,
        base_amount: 520.00,
        penalties_total: 0,
        total_amount: 520.00,
        billing_month: currentMonth,
        billing_year: currentYear,
        status: 'draft',
      },
    ]);

    if (invoicesError) throw invoicesError;

    toast.success('Database popolato con dati di esempio');
  } catch (error) {
    console.error('Seed error:', error);
    toast.error('Errore nel popolamento del database');
  }
}
