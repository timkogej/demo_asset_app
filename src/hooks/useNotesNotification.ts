import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export const NOTES_ID = '00000000-0000-0000-0000-000000000001';

// Dispatched by the Notes page after marking the note as seen so the
// sidebar dot disappears immediately instead of waiting for the next poll.
export const NOTES_SEEN_EVENT = 'fleetinvoice:notes-seen';

export function useNotesNotification() {
  const { user, username } = useAuth();
  const [hasNew, setHasNew] = useState(false);

  const check = useCallback(async () => {
    if (!user) return;
    const { data: note } = await supabase
      .from('notes')
      .select('updated_at, updated_by, notify_others')
      .eq('id', NOTES_ID)
      .maybeSingle();

    if (!note || !note.notify_others || note.updated_by === username) {
      setHasNew(false);
      return;
    }

    const { data: seen } = await supabase
      .from('notes_seen')
      .select('last_seen_at')
      .eq('user_id', user.id)
      .maybeSingle();

    setHasNew(!seen || new Date(note.updated_at) > new Date(seen.last_seen_at));
  }, [user, username]);

  useEffect(() => {
    const initial = setTimeout(check, 0);
    const interval = setInterval(check, 60_000);
    window.addEventListener(NOTES_SEEN_EVENT, check);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener(NOTES_SEEN_EVENT, check);
    };
  }, [check]);

  return user ? hasNew : false;
}
