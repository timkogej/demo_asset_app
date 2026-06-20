import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FolderOpen,
  Upload,
  Download,
  Trash2,
  FileText,
  Image,
  File,
  ChevronDown,
  Eye,
  Loader,
  X,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
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
  'invoice',
  'other',
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  green_card: '#2d7a4f',
  insurance: '#4a9668',
  registration: '#3b82f6',
  inspection: '#d4a017',
  contract: '#8b5cf6',
  damage: '#c0392b',
  invoice: '#0891b2',
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
  return <File size={16} strokeWidth={1.8} style={{ color: 'var(--color-text-muted)' }} />;
}

function VehicleSearchSelect({ value, onChange, vehicles, t }: {
  value: string;
  onChange: (id: string) => void;
  vehicles: Vehicle[];
  t: (key: string) => string;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const filtered = vehicles.filter((v) =>
    `${v.registration_number} ${v.vehicle_name ?? ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const selected = vehicles.find((v) => v.id === value);

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: '220px' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          border: '1px solid #a8d4b3',
          borderRadius: '8px',
          cursor: 'pointer',
          background: 'white',
          fontSize: '13px',
        }}
      >
        <span style={{ color: selected ? '#1c2b22' : '#6b8f75' }}>
          {selected
            ? `${selected.registration_number}${selected.vehicle_name ? ` — ${selected.vehicle_name}` : ''}`
            : t('doc.all_vehicles')}
        </span>
        <ChevronDown size={14} strokeWidth={1.5} color="#6b8f75" style={{ marginLeft: 6, flexShrink: 0 }} />
      </div>

      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          zIndex: 9999,
          background: 'white',
          border: '1px solid #a8d4b3',
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          minWidth: '280px',
          maxHeight: '280px',
          overflowY: 'auto',
          marginTop: '4px',
        }}>
          <div style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('doc.search_vehicle')}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid #a8d4b3',
                borderRadius: '6px',
                fontSize: '12px',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div
            onMouseDown={() => { onChange(''); setOpen(false); setSearch(''); }}
            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12px', color: '#6b8f75' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fdf4')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
          >
            {t('doc.all_vehicles')}
          </div>
          {filtered.map((v) => (
            <div
              key={v.id}
              onMouseDown={() => { onChange(v.id); setOpen(false); setSearch(''); }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '12px',
                background: value === v.id ? '#f0fdf4' : 'white',
                borderBottom: '1px solid #f8f8f8',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fdf4')}
              onMouseLeave={(e) => (e.currentTarget.style.background = value === v.id ? '#f0fdf4' : 'white')}
            >
              <span style={{ fontWeight: '700', fontFamily: 'monospace', color: '#1a4731' }}>
                {v.registration_number}
              </span>
              {v.vehicle_name && (
                <span style={{ color: '#6b8f75', marginLeft: '8px' }}>
                  {v.vehicle_name}
                </span>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '12px', color: '#6b8f75', fontSize: '12px', textAlign: 'center' }}>
              {t('doc.no_vehicles_found')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Documents({ t }: DocumentsProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [files, setFiles] = useState<VehicleFile[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter state
  const [filterVehicleId, setFilterVehicleId] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Upload panel state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadVehicleId, setUploadVehicleId] = useState<string | null>(null);
  const [uploadCategory, setUploadCategory] = useState('other');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [catSelectOpen, setCatSelectOpen] = useState(false);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewFile, setPreviewFile] = useState<VehicleFile | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const catSelectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase
      .from('vehicles')
      .select('id, registration_number, vehicle_name')
      .order('registration_number')
      .then(({ data }) => setVehicles((data as Vehicle[]) ?? []));
  }, []);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('vehicle_files')
        .select('*, vehicle:vehicles(id, registration_number, vehicle_name)')
        .order('uploaded_at', { ascending: false });
      if (filterVehicleId) query = query.eq('vehicle_id', filterVehicleId);
      const { data, error } = await query;
      if (error) throw error;
      setFiles((data as VehicleFile[]) ?? []);
    } catch {
      toast.error(t('error.fetch_failed'));
    } finally {
      setLoading(false);
    }
  }, [filterVehicleId, t]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (catSelectRef.current && !catSelectRef.current.contains(e.target as Node)) {
        setCatSelectOpen(false);
      }
    }
    if (catSelectOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [catSelectOpen]);

  const filteredFiles = files.filter((f) => {
    if (filterCategory && f.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !f.file_name.toLowerCase().includes(q) &&
        !(f.description ?? '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const totalSize = filteredFiles.reduce((s, f) => s + f.file_size, 0);

  async function handleUpload() {
    if (!uploadFile) return;
    if (uploadFile.size > 10 * 1024 * 1024) {
      toast.error(t('doc.file_too_large'));
      return;
    }
    setUploading(true);
    try {
      const timestamp = Date.now();
      const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const folder = uploadVehicleId || 'general';
      const filePath = `${folder}/${timestamp}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('vehicle-documents')
        .upload(filePath, uploadFile, { contentType: uploadFile.type, upsert: false });
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from('vehicle_files').insert({
        vehicle_id: uploadVehicleId || null,
        file_name: uploadFile.name,
        file_path: filePath,
        file_url: '',
        file_size: uploadFile.size,
        file_type: uploadFile.type,
        category: uploadCategory,
        description: uploadDescription || null,
      });
      if (dbError) throw dbError;

      toast.success(t('doc.upload_success'));
      setUploadFile(null);
      setUploadDescription('');
      setUploadVehicleId(null);
      setUploadCategory('other');
      setUploadOpen(false);
      fetchFiles();
    } catch (err: unknown) {
      console.error(err);
      toast.error(t('error.generic'));
    } finally {
      setUploading(false);
    }
  }

  async function handlePreview(file: VehicleFile) {
    try {
      const { data, error } = await supabase.storage
        .from('vehicle-documents')
        .createSignedUrl(file.file_path, 3600);
      if (error || !data?.signedUrl) throw error;

      const isPDF = file.file_type === 'application/pdf';
      const isImage = file.file_type?.startsWith('image/');

      if (isPDF || isImage) {
        setPreviewUrl(data.signedUrl);
        setPreviewFile(file);
        setShowPreview(true);
      } else {
        window.open(data.signedUrl, '_blank');
      }
    } catch {
      toast.error(t('error.generic'));
    }
  }

  async function handleDownload(file: VehicleFile) {
    const { data, error } = await supabase.storage
      .from('vehicle-documents')
      .createSignedUrl(file.file_path, 3600);
    if (error || !data?.signedUrl) {
      toast.error(t('error.generic'));
      return;
    }
    window.open(data.signedUrl, '_blank');
  }

  async function handleDeleteFile(file: VehicleFile) {
    if (!window.confirm(t('doc.confirm_delete'))) return;
    try {
      await supabase.storage.from('vehicle-documents').remove([file.file_path]);
      await supabase.from('vehicle_files').delete().eq('id', file.id);
      toast.success(t('doc.delete_success'));
      fetchFiles();
    } catch {
      toast.error(t('error.generic'));
    }
  }

  return (
    <div className="p-6 max-w-full">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="page-title">{t('doc.title')}</h1>
        <button
          className="btn-primary flex items-center gap-2 text-sm py-1.5 px-4"
          onClick={() => {
            setUploadOpen((o) => !o);
            setUploadFile(null);
            setUploadDescription('');
          }}
        >
          <Upload size={15} strokeWidth={1.8} />
          {t('doc.upload_btn')}
        </button>
      </div>

      {/* Upload panel */}
      {uploadOpen && (
        <div className="card mb-4 p-5">
          {/* Drag & drop area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) setUploadFile(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#1a4731' : '#a8d4b3'}`,
              borderRadius: '10px',
              padding: '32px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? '#f0fdf4' : '#f8faf8',
              transition: 'all 0.2s',
            }}
          >
            <Upload size={32} strokeWidth={1.5} color="#6b8f75" />
            <p style={{ margin: '8px 0 4px', fontWeight: '600', color: '#1c2b22' }}>
              {uploadFile ? uploadFile.name : t('doc.drag_or_click')}
            </p>
            <p style={{ margin: 0, fontSize: '12px', color: '#6b8f75' }}>
              PDF, JPG, PNG, DOCX, XLSX — max 10MB
            </p>
            {uploadFile && (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#1a4731', fontWeight: '600' }}>
                {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.docx,.doc,.xlsx"
            style={{ display: 'none' }}
            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
          />

          {/* Form fields */}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {/* Vehicle (optional) */}
            <VehicleSearchSelect
              value={uploadVehicleId || ''}
              onChange={(id) => setUploadVehicleId(id || null)}
              vehicles={vehicles}
              t={t}
            />

            {/* Category styled select */}
            <div ref={catSelectRef} style={{ position: 'relative', minWidth: '180px' }}>
              <div
                onClick={() => setCatSelectOpen((o) => !o)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  border: '1px solid #a8d4b3',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: 'white',
                  fontSize: '13px',
                  color: '#1c2b22',
                }}
              >
                <span>{t(`doc.cat_${uploadCategory}`)}</span>
                <ChevronDown size={14} strokeWidth={1.5} color="#6b8f75" style={{ marginLeft: 6, flexShrink: 0 }} />
              </div>
              {catSelectOpen && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 9999,
                  background: 'white',
                  border: '1px solid #a8d4b3',
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  minWidth: '180px',
                  marginTop: '4px',
                  overflow: 'hidden',
                }}>
                  {CATEGORIES.map((c) => (
                    <div
                      key={c}
                      onMouseDown={() => { setUploadCategory(c); setCatSelectOpen(false); }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        background: uploadCategory === c ? '#f0fdf4' : 'white',
                        color: '#1c2b22',
                        borderBottom: '1px solid #f8f8f8',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0fdf4')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = uploadCategory === c ? '#f0fdf4' : 'white')}
                    >
                      {t(`doc.cat_${c}`)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Description */}
            <input
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder={t('doc.description')}
              className="input-field text-sm py-1"
              style={{ flex: 1, minWidth: '180px' }}
            />

            {/* Upload button */}
            <button
              onClick={handleUpload}
              disabled={uploading || !uploadFile}
              style={{
                background: uploading || !uploadFile ? '#a8d4b3' : '#1a4731',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 24px',
                cursor: uploading || !uploadFile ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: '600',
                fontSize: '13px',
                flexShrink: 0,
              }}
            >
              {uploading
                ? <Loader size={14} strokeWidth={1.5} />
                : <Upload size={14} strokeWidth={1.5} />}
              {uploading ? t('doc.uploading') : t('doc.upload_btn')}
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <VehicleSearchSelect
          value={filterVehicleId}
          onChange={setFilterVehicleId}
          vehicles={vehicles}
          t={t}
        />

        {/* Category pills */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setFilterCategory('')}
            style={{
              fontSize: '12px',
              padding: '4px 12px',
              borderRadius: '999px',
              border: `1px solid ${!filterCategory ? '#1a4731' : '#a8d4b3'}`,
              background: !filterCategory ? '#f0fdf4' : 'white',
              color: !filterCategory ? '#1a4731' : '#6b8f75',
              fontWeight: !filterCategory ? '600' : '400',
              cursor: 'pointer',
            }}
          >
            {t('doc.all_categories')}
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCategory(filterCategory === c ? '' : c)}
              style={{
                fontSize: '12px',
                padding: '4px 12px',
                borderRadius: '999px',
                border: `1px solid ${filterCategory === c ? CATEGORY_COLORS[c] : '#a8d4b3'}`,
                background: filterCategory === c ? `${CATEGORY_COLORS[c]}18` : 'white',
                color: filterCategory === c ? CATEGORY_COLORS[c] : '#6b8f75',
                fontWeight: filterCategory === c ? '600' : '400',
                cursor: 'pointer',
              }}
            >
              {t(`doc.cat_${c}`)}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <Search
            size={13}
            strokeWidth={1.5}
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#6b8f75', pointerEvents: 'none' }}
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('doc.search_files')}
            className="input-field text-sm py-1"
            style={{ paddingLeft: '30px', minWidth: '180px' }}
          />
        </div>
      </div>

      {/* Stats mini-row */}
      <div className="flex items-center gap-6 mb-4">
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="font-semibold text-text-dark">{filteredFiles.length}</span> file
        </span>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="font-semibold text-text-dark">{formatSize(totalSize)}</span> totale
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="spinner" />
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <FolderOpen size={48} strokeWidth={1.4} style={{ color: 'var(--color-accent-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {t('doc.no_files')}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--color-accent-soft)' }}>
                <th className="table-header w-8"></th>
                <th className="table-header text-left">{t('doc.file_name')}</th>
                <th className="table-header text-left">{t('vehicles.plate')}</th>
                <th className="table-header text-left">{t('doc.category_label')}</th>
                <th className="table-header text-left">{t('doc.description')}</th>
                <th className="table-header text-left">{t('doc.file_size')}</th>
                <th className="table-header text-left">{t('doc.uploaded_at')}</th>
                <th className="table-header text-right">{t('vehicles.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredFiles.map((file) => (
                <tr
                  key={file.id}
                  className="table-row border-b"
                  style={{ height: 40, borderColor: 'var(--color-accent-soft)' }}
                >
                  <td className="table-cell w-8 pr-0">
                    <FileIcon mimeType={file.file_type} />
                  </td>

                  <td className="table-cell max-w-[200px]">
                    <span title={file.file_name} className="truncate block" style={{ maxWidth: 220 }}>
                      {file.file_name.length > 28 ? file.file_name.slice(0, 28) + '…' : file.file_name}
                    </span>
                  </td>

                  <td className="table-cell text-xs font-mono">
                    {file.vehicle?.registration_number ?? '—'}
                  </td>

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

                  <td className="table-cell text-xs" style={{ color: 'var(--color-text-muted)', maxWidth: '180px' }}>
                    <span className="truncate block" style={{ maxWidth: 180 }}>
                      {file.description ?? ''}
                    </span>
                  </td>

                  <td className="table-cell text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {formatSize(file.file_size)}
                  </td>

                  <td className="table-cell text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {formatDate(file.uploaded_at)}
                  </td>

                  <td className="table-cell text-right">
                    <span className="flex items-center justify-end gap-1">
                      <button
                        title={t('doc.preview')}
                        className="p-1.5 rounded-10 hover:bg-accent-soft transition-colors"
                        style={{ color: 'var(--color-text-muted)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-primary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                        onClick={() => handlePreview(file)}
                      >
                        <Eye size={15} strokeWidth={1.8} />
                      </button>
                      <button
                        title={t('doc.download')}
                        className="p-1.5 rounded-10 hover:bg-accent-soft transition-colors"
                        style={{ color: 'var(--color-accent)' }}
                        onClick={() => handleDownload(file)}
                      >
                        <Download size={15} strokeWidth={1.8} />
                      </button>
                      <button
                        title={t('doc.delete')}
                        className="p-1.5 rounded-10 hover:bg-accent-soft transition-colors"
                        style={{ color: 'var(--color-text-muted)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-danger)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                        onClick={() => handleDeleteFile(file)}
                      >
                        <Trash2 size={15} strokeWidth={1.8} />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {showPreview && previewFile && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '860px',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid #d4ead9',
            }}>
              <span style={{ fontWeight: '600', color: '#1c2b22', fontSize: '14px' }}>
                {previewFile.file_name}
              </span>
              <button
                onClick={() => setShowPreview(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
              >
                <X size={20} strokeWidth={1.5} color="#6b8f75" />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {previewFile.file_type === 'application/pdf' ? (
                <iframe
                  src={previewUrl}
                  style={{ width: '100%', height: '75vh', border: 'none' }}
                  title={previewFile.file_name}
                />
              ) : previewFile.file_type?.startsWith('image/') ? (
                <img
                  src={previewUrl}
                  alt={previewFile.file_name}
                  style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', display: 'block', margin: '0 auto' }}
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
