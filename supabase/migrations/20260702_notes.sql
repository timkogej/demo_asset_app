-- Beležka (shared notes) — run this in the Supabase SQL editor

CREATE TABLE IF NOT EXISTS notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  updated_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  notify_others BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  saved_by TEXT NOT NULL,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  notify_others BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS notes_seen (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_seen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage notes" ON notes
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage notes_history" ON notes_history
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can manage notes_seen" ON notes_seen
  FOR ALL USING (auth.role() = 'authenticated');
