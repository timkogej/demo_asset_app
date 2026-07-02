import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bold,
  Italic,
  List,
  Heading,
  Save,
  Eye,
  Trash2,
  BellOff,
  X,
  NotebookPen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { NOTES_ID, NOTES_SEEN_EVENT } from '../hooks/useNotesNotification';
import type { Note, NoteHistory } from '../types';

interface NotesProps {
  t: (key: string) => string;
  language: string;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${date} ${time}`;
}

function UserAvatar({ name }: { name: string }) {
  return (
    <span
      className="flex items-center justify-center flex-shrink-0 rounded-full text-white text-xs font-semibold"
      style={{ width: 28, height: 28, background: '#2d7a4f' }}
    >
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  );
}

export default function Notes({ t }: NotesProps) {
  const { user, username } = useAuth();

  const [content, setContent] = useState('');
  const [notifyOthers, setNotifyOthers] = useState(true);
  const [note, setNote] = useState<Note | null>(null);
  const [history, setHistory] = useState<NoteHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewEntry, setViewEntry] = useState<NoteHistory | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<NoteHistory | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchHistory = useCallback(async () => {
    const { data } = await supabase
      .from('notes_history')
      .select('*')
      .order('saved_at', { ascending: false });
    setHistory((data as NoteHistory[]) ?? []);
  }, []);

  const markSeen = useCallback(async () => {
    if (!user) return;
    await supabase.from('notes_seen').upsert({
      user_id: user.id,
      last_seen_at: new Date().toISOString(),
    });
    window.dispatchEvent(new Event(NOTES_SEEN_EVENT));
  }, [user]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('notes')
          .select('*')
          .eq('id', NOTES_ID)
          .maybeSingle();
        if (data) {
          setNote(data as Note);
          setContent((data as Note).content);
          setNotifyOthers((data as Note).notify_others);
        }
        await fetchHistory();
        await markSeen();
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fetchHistory, markSeen]);

  // Toolbar: insert markdown syntax around the current selection
  function applyFormat(type: 'bold' | 'italic' | 'list' | 'heading') {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end);
    let replacement = selected;
    let cursorOffset = 0;

    if (type === 'bold') {
      replacement = `**${selected || 'krepko'}**`;
      cursorOffset = selected ? replacement.length : 2;
    } else if (type === 'italic') {
      replacement = `*${selected || 'ležeče'}*`;
      cursorOffset = selected ? replacement.length : 1;
    } else if (type === 'list') {
      const text = selected || '';
      replacement = text
        ? text.split('\n').map((l) => (l.trim() ? `- ${l}` : l)).join('\n')
        : '- ';
      cursorOffset = replacement.length;
    } else if (type === 'heading') {
      const lineStart = content.lastIndexOf('\n', start - 1) + 1;
      const newContent = `${content.slice(0, lineStart)}## ${content.slice(lineStart)}`;
      setContent(newContent);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + 3, end + 3);
      });
      return;
    }

    const newContent = content.slice(0, start) + replacement + content.slice(end);
    setContent(newContent);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + cursorOffset;
      el.setSelectionRange(pos, pos);
    });
  }

  async function handleSave() {
    if (!username) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { error: upsertError } = await supabase.from('notes').upsert({
        id: NOTES_ID,
        content,
        updated_by: username,
        updated_at: now,
        notify_others: notifyOthers,
      });
      if (upsertError) throw upsertError;

      const { error: historyError } = await supabase.from('notes_history').insert({
        content,
        saved_by: username,
        saved_at: now,
        notify_others: notifyOthers,
      });
      if (historyError) throw historyError;

      setNote((prev) => ({
        id: NOTES_ID,
        content,
        updated_by: username,
        updated_at: now,
        notify_others: notifyOthers,
        created_at: prev?.created_at ?? now,
      }));
      toast.success(t('notes.saved'));
      await fetchHistory();
      await markSeen();
    } catch (err) {
      console.error(err);
      toast.error(t('error.generic'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteHistory(entry: NoteHistory) {
    try {
      const { error } = await supabase.from('notes_history').delete().eq('id', entry.id);
      if (error) throw error;
      toast.success(t('notes.history_deleted'));
      setDeleteEntry(null);
      fetchHistory();
    } catch (err) {
      console.error(err);
      toast.error(t('error.generic'));
    }
  }

  const toolbarButtons = [
    { type: 'bold' as const, icon: Bold, title: t('notes.bold') },
    { type: 'italic' as const, icon: Italic, title: t('notes.italic') },
    { type: 'list' as const, icon: List, title: t('notes.list') },
    { type: 'heading' as const, icon: Heading, title: t('notes.heading') },
  ];

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-center gap-2 mb-4">
        <NotebookPen size={22} strokeWidth={1.8} style={{ color: 'var(--color-primary)' }} />
        <h1 className="page-title">{t('notes.title')}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor — 2/3 */}
        <div className="lg:col-span-2">
          <div className="card p-5">
            {/* Toolbar */}
            <div className="flex items-center gap-1 mb-3 pb-3 border-b border-accent-soft">
              {toolbarButtons.map(({ type, icon: Icon, title }) => (
                <button
                  key={type}
                  title={title}
                  onClick={() => applyFormat(type)}
                  className="p-2 rounded-10 text-text-muted hover:bg-accent-soft hover:text-primary transition-colors"
                >
                  <Icon size={16} strokeWidth={1.8} />
                </button>
              ))}
            </div>

            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('notes.placeholder')}
              className="input-field font-mono text-sm leading-relaxed"
              style={{ minHeight: 400, resize: 'vertical' }}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
              <label className="flex items-center gap-2 text-sm text-text-dark cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notifyOthers}
                  onChange={(e) => setNotifyOthers(e.target.checked)}
                  className="w-4 h-4 accent-[#2d7a4f] cursor-pointer"
                />
                {t('notes.notify_others')}
              </label>

              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex items-center gap-2"
              >
                <Save size={15} strokeWidth={1.8} />
                {saving ? t('notes.saving') : t('notes.save')}
              </button>
            </div>

            {note && (
              <p className="text-xs mt-3 text-right" style={{ color: 'var(--color-text-muted)' }}>
                {t('notes.last_change')}: <span className="font-semibold">{note.updated_by}</span>{' '}
                {t('notes.at')} {formatDateTime(note.updated_at)}
              </p>
            )}
          </div>
        </div>

        {/* History — 1/3 */}
        <div>
          <div className="card p-5">
            <h2 className="section-title mb-4">{t('notes.history_title')}</h2>

            {history.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
                {t('notes.no_history')}
              </p>
            ) : (
              <ul className="space-y-1 max-h-[520px] overflow-y-auto pr-1">
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2.5 py-2 px-2 rounded-10 hover:bg-accent-soft/40 transition-colors"
                  >
                    <UserAvatar name={entry.saved_by} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-dark truncate">
                        {entry.saved_by}
                      </p>
                      <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                        {formatDateTime(entry.saved_at)}
                        {!entry.notify_others && (
                          <span title={t('notes.no_notify')} className="inline-flex">
                            <BellOff size={12} strokeWidth={1.8} />
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      title={t('notes.show')}
                      onClick={() => setViewEntry(entry)}
                      className="p-1.5 rounded-10 text-text-muted hover:bg-accent-soft hover:text-primary transition-colors flex-shrink-0"
                    >
                      <Eye size={15} strokeWidth={1.8} />
                    </button>
                    <button
                      title={t('notes.delete')}
                      onClick={() => setDeleteEntry(entry)}
                      className="p-1.5 rounded-10 text-text-muted hover:bg-accent-soft transition-colors flex-shrink-0"
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-danger)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                    >
                      <Trash2 size={15} strokeWidth={1.8} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* View snapshot modal */}
      {viewEntry && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setViewEntry(null)}
        >
          <div
            className="bg-surface rounded-xl w-full flex flex-col overflow-hidden"
            style={{ maxWidth: 720, maxHeight: '85vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-accent-soft">
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar name={viewEntry.saved_by} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-dark truncate">
                    {viewEntry.saved_by}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {formatDateTime(viewEntry.saved_at)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewEntry(null)}
                className="p-1 text-text-muted hover:text-text-dark"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <pre className="font-mono text-sm leading-relaxed text-text-dark whitespace-pre-wrap break-words m-0">
                {viewEntry.content}
              </pre>
            </div>
            <div className="flex justify-end px-5 py-4 border-t border-accent-soft">
              <button onClick={() => setViewEntry(null)} className="btn-secondary">
                {t('notes.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteEntry && (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center p-6"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setDeleteEntry(null)}
        >
          <div
            className="bg-surface rounded-xl w-full p-5"
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-text-dark mb-2">
              {t('notes.delete_title')}
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>
              {t('notes.confirm_delete')}
              <br />
              <span className="font-medium text-text-dark">
                {deleteEntry.saved_by} — {formatDateTime(deleteEntry.saved_at)}
              </span>
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteEntry(null)} className="btn-secondary">
                {t('notes.cancel')}
              </button>
              <button onClick={() => handleDeleteHistory(deleteEntry)} className="btn-danger">
                {t('notes.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
