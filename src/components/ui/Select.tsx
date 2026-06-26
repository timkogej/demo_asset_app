import { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  /** Primary label, shown bold in the option and in the trigger. */
  label: string;
  /** Optional secondary line, shown smaller and muted below the label. */
  sublabel?: string;
  /** Extra text used for filtering (in addition to label/sublabel). */
  searchText?: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Show a search box at the top of the dropdown. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Text shown when the (filtered) list is empty. */
  emptyLabel?: string;
  disabled?: boolean;
  error?: boolean;
  /** Compact variant (smaller text/padding) — used for the VAT clause select. */
  compact?: boolean;
}

export default function Select({
  value,
  onChange,
  options,
  placeholder = '— izberite —',
  searchable = false,
  searchPlaceholder = 'Išči...',
  emptyLabel = 'Ni zadetkov',
  disabled = false,
  error = false,
  compact = false,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset the search and focus the box whenever the dropdown opens.
  useEffect(() => {
    if (open) {
      setQuery('');
      if (searchable) {
        // Focus after the panel has rendered.
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    }
  }, [open, searchable]);

  const filtered = useMemo(() => {
    if (!searchable || query.trim() === '') return options;
    const q = query.toLowerCase();
    return options.filter((o) =>
      `${o.label} ${o.sublabel ?? ''} ${o.searchText ?? ''}`.toLowerCase().includes(q)
    );
  }, [options, query, searchable]);

  const triggerPadding = compact ? 'px-3 py-1.5 text-xs' : 'px-3 py-2 text-sm';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 ${triggerPadding} text-left border rounded-10 bg-surface text-text-dark transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:opacity-50 disabled:cursor-not-allowed ${
          error ? 'border-danger' : 'border-accent-muted'
        } ${open ? 'ring-2 ring-accent border-accent' : ''}`}
      >
        <span className={`truncate ${selected ? 'text-text-dark' : 'text-text-muted'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-text-muted transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-surface border border-accent-muted rounded-10 shadow-lg overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-accent-soft">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-accent-muted rounded-10 bg-surface text-text-dark placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                />
              </div>
            </div>
          )}

          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-text-muted">{emptyLabel}</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-accent-soft transition-colors ${
                    o.value === value ? 'bg-accent-soft' : ''
                  }`}
                >
                  <div className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-text-dark`}>
                    {o.label}
                  </div>
                  {o.sublabel && (
                    <div className="text-xs text-text-muted mt-0.5">{o.sublabel}</div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
