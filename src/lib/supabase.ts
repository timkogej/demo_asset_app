import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const STORAGE_BUCKET = 'vehicle-documents';

export async function uploadVehicleFile(vehicleId: string, file: File, category: string) {
  const ext = file.name.split('.').pop();
  const fileName = `${vehicleId}/${Date.now()}_${category}.${ext}`;
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, file, { upsert: false });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
  return { path: data.path, url: urlData.publicUrl };
}

export async function deleteVehicleFile(filePath: string) {
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
  if (error) throw error;
}
