import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderOpen,
  Upload,
  Download,
  Trash2,
  FileText,
  Image,
  FileType,
  File,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase, uploadVehicleFile, deleteVehicleFile } from '../lib/supabase';
import type { Vehicle, VehicleFile } from '../types';

interface DocumentsProps {
  t: (key: string) => string;
  language: string;
}

const CATEGORIES = [
  'green_card',
  'insurance',
  'registration',
  'inspection',
  'contract',
  'damage',
  'other',
] as const;

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const CATEGORY_COLORS: Record<string, string> = {
  green_card: '#2d7a4f',
  insurance: '#4a9668',
  registration: '#3b82f6',
  inspection: '#d4a017',
  contract: '#8b5cf6',
  damage: '#c0392b',
  other: '#6b8f75',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === 'application/pdf')
    return <FileText size={16} strokeWidth={1.8} style={{ color: 'var(--color-primary)' }} />;
  if (mimeType.startsWith('image/'))
    return <Image size={16} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />;
  if (mimeType.includes('word'))
    return <FileType size={16} strokeWidth={1.8} style={{ color: '#3b82f6' }} />;
  return <File size={16} strokeWidth={1.8} style={{ color: 'var(--color-text-muted)' }} />;
}

export default function Documents({ t }: DocumentsProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [files, setFiles] = useState<VehicleFile[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Upload area state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('other');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sizeError, setSizeError] = useState('');
  const [dragging, setDragging] = useState(false);

  // Delete confirm state: fileId → true means confirming
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch vehicles once
  useEffect(() => {
    supabase
      .from('vehicles')
      .select('id, registration_number, vehicle_name')
      .order('registration_number')
      .then(({ data }) => setVehicles((data as Vehicle[]) ?? []));
  }, []);

  // Fetch files when vehicle selection changes
  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('vehicle_files')
        .select('*, vehicle:vehicles(registration_number, vehicle_name)')
        .order('uploaded_at', { ascending: false });
      if (selectedVehicleId) query = query.eq('vehicle_id', selectedVehicleId);
      const { data, error } = await query;
      if (error) throw error;
      setFiles((data as VehicleFile[]) ?? []);
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [selectedVehicleId, t]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Derived stats
  const totalSize = files.reduce((s, f) => s + f.file_size, 0);
  const lastUploaded = files[0]?.uploaded_at ?? null;

  // File validation
  function validateFile(file: File): string {
    if (file.size > MAX_SIZE) return `${t('doc.upload')} — max 10 MB`;
    if (!ALLOWED_TYPES.includes(file.type)) return 'Tipo file non supportato';
    return '';
  }

  function handleFilePick(file: File) {
    setSizeError('');
    const err = validateFile(file);
    if (err) {
      setSizeError(err);
      return;
    }
    setPendingFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFilePick(file);
  }

  async function handleUpload() {
    if (!pendingFile || !selectedVehicleId) return;
    setUploading(true);
    setUploadProgress(30);
    try {
      const { path, url } = await uploadVehicleFile(selectedVehicleId, pendingFile, selectedCategory);
      setUploadProgress(70);
      const { error } = await supabase.from('vehicle_files').insert({
        vehicle_id: selectedVehicleId,
        file_name: pendingFile.name,
        file_path: path,
        file_url: url,
        file_size: pendingFile.size,
        file_type: pendingFile.type,
        category: selectedCategory,
      });
      if (error) throw error;
      setUploadProgress(100);
      toast.success(t('doc.upload_success'));
      setPendingFile(null);
      setUploadOpen(false);
      setUploadProgress(0);
      fetchFiles();
    } catch {
      toast.error(t('error.save_failed'));
      setUploadProgress(0);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(file: VehicleFile) {
    try {
      await deleteVehicleFile(file.file_path);
      await supabase.from('vehicle_files').delete().eq('id', file.id);
      setConfirmingDelete(null);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      toast.success(t('doc.delete_success'));
    } catch {
      toast.error(t('error.delete_failed'));
    }
  }

  const showUploadButton = !!selectedVehicleId;

  return (
    <div className="p-6 max-w-full">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="page-title">{t('doc.title')}</h1>
        <div className="flex items-center gap-3 flex-shrink-0">
          <select
            value={selectedVehicleId}
            onChange={(e) => {
              setSelectedVehicleId(e.target.value);
              setUploadOpen(false);
              setPendingFile(null);
            }}
            className="input-field text-sm py-1.5"
            style={{ minWidth: 200 }}
          >
            <option value="">{t('doc.all_vehicles')}</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.registration_number}{v.vehicle_name ? ` — ${v.vehicle_name}` : ''}
              </option>
            ))}
          </select>

          {showUploadButton && (
            <button
              className="btn-primary flex items-center gap-2 text-sm py-1.5 px-4"
              onClick={() => {
                setUploadOpen((o) => !o);
                setPendingFile(null);
                setSizeError('');
              }}
            >
              <Upload size={15} strokeWidth={1.8} />
              {t('doc.upload')}
            </button>
          )}
        </div>
      </div>

      {/* Upload area */}
      {showUploadButton && uploadOpen && (
        <div
          className="mb-4 rounded-10 border border-dashed transition-colors duration-150"
          style={{
            borderColor: dragging ? 'var(--color-accent)' : 'var(--color-accent-muted)',
            backgroundColor: dragging ? 'var(--color-accent-soft)' : 'transparent',
            padding: '12px 16px',
          }}
        >
          {!pendingFile ? (
            <div
              className="flex flex-col items-center justify-center cursor-pointer select-none"
              style={{ minHeight: 72 }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <Upload size={20} strokeWidth={1.8} style={{ color: 'var(--color-accent-muted)' }} />
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {t('doc.drop_here')}
              </p>
              {sizeError && <p className="text-xs mt-1 error-text">{sizeError}</p>}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFilePick(f);
                  e.target.value = '';
                }}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <FileIcon mimeType={pendingFile.type} />
              <span className="text-sm font-medium text-text-dark flex-1 min-w-0 truncate">
                {pendingFile.name}
              </span>
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {formatSize(pendingFile.size)}
              </span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="input-field text-sm py-1"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`doc.category.${c}`)}
                  </option>
                ))}
              </select>
              <button
                className="btn-primary text-sm py-1 px-3"
                onClick={handleUpload}
                disabled={uploading}
              >
                {uploading ? t('doc.uploading') : t('common.confirm')}
              </button>
              <button
                className="btn-secondary text-sm py-1 px-3"
                onClick={() => { setPendingFile(null); setSizeError(''); }}
                disabled={uploading}
              >
                {t('btn.cancel')}
              </button>
            </div>
          )}

          {/* Progress bar */}
          {uploading && uploadProgress > 0 && (
            <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-accent-soft)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%`, background: 'var(--color-accent)' }}
              />
            </div>
          )}
        </div>
      )}

      {/* Stats mini-row */}
      <div className="flex items-center gap-6 mb-4">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="font-semibold text-text-dark">{files.length}</span> file
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="font-semibold text-text-dark">{formatSize(totalSize)}</span> totale
        </span>
        {lastUploaded && (
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Ultimo: <span className="font-semibold text-text-dark">{formatDate(lastUploaded)}</span>
          </span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="spinner" />
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <FolderOpen size={48} strokeWidth={1.4} style={{ color: 'var(--color-accent-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('doc.no_files')}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-accent-soft)' }}>
                <th className="table-header w-8"></th>
                <th className="table-header text-left">{t('doc.file_name')}</th>
                <th className="table-header text-left">{t('doc.category_label')}</th>
                {!selectedVehicleId && (
                  <th className="table-header text-left">{t('vehicles.plate')}</th>
                )}
                <th className="table-header text-left">{t('doc.file_size')}</th>
                <th className="table-header text-left">{t('doc.uploaded_at')}</th>
                <th className="table-header text-right">{t('vehicles.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr
                  key={file.id}
                  className="table-row border-b"
                  style={{ height: 40, borderColor: 'var(--color-accent-soft)' }}
                >
                  {/* Type icon */}
                  <td className="table-cell w-8 pr-0">
                    <FileIcon mimeType={file.file_type} />
                  </td>

                  {/* File name */}
                  <td className="table-cell max-w-[200px]">
                    <span
                      title={file.file_name}
                      className="truncate block"
                      style={{ maxWidth: 220 }}
                    >
                      {file.file_name.length > 28
                        ? file.file_name.slice(0, 28) + '…'
                        : file.file_name}
                    </span>
                  </td>

                  {/* Category badge */}
                  <td className="table-cell">
                    <span
                      className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded"
                      style={{
                        background: 'var(--color-accent-soft)',
                        borderLeft: `2px solid ${CATEGORY_COLORS[file.category] ?? '#6b8f75'}`,
                        color: CATEGORY_COLORS[file.category] ?? 'var(--color-text-muted)',
                      }}
                    >
                      {t(`doc.category.${file.category}`)}
                    </span>
                  </td>

                  {/* Vehicle plate (all-vehicles view) */}
                  {!selectedVehicleId && (
                    <td className="table-cell text-xs font-mono">
                      {file.vehicle?.registration_number ?? '—'}
                    </td>
                  )}

                  {/* Size */}
                  <td className="table-cell text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {formatSize(file.file_size)}
                  </td>

                  {/* Date */}
                  <td className="table-cell text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {formatDate(file.uploaded_at)}
                  </td>

                  {/* Actions */}
                  <td className="table-cell text-right">
                    {confirmingDelete === file.id ? (
                      <span className="flex items-center justify-end gap-2">
                        <button
                          className="text-xs font-medium"
                          style={{ color: 'var(--color-danger)' }}
                          onClick={() => handleDelete(file)}
                        >
                          {t('common.confirm')}
                        </button>
                        <button
                          className="text-xs"
                          style={{ color: 'var(--color-text-muted)' }}
                          onClick={() => setConfirmingDelete(null)}
                        >
                          {t('btn.cancel')}
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-1">
                        <a
                          href={file.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t('doc.download')}
                          className="p-1.5 rounded-10 hover:bg-accent-soft transition-colors"
                          style={{ color: 'var(--color-accent)' }}
                        >
                          <Download size={15} strokeWidth={1.8} />
                        </a>
                        <button
                          title={t('doc.delete')}
                          className="p-1.5 rounded-10 hover:bg-accent-soft transition-colors"
                          style={{ color: 'var(--color-text-muted)' }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.color = 'var(--color-danger)')
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.color = 'var(--color-text-muted)')
                          }
                          onClick={() => setConfirmingDelete(file.id)}
                        >
                          <Trash2 size={15} strokeWidth={1.8} />
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
