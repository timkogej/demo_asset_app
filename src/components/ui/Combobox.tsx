import { useState, useEffect, useRef } from 'react';

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  addNewLabel?: string;
}

export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  addNewLabel = 'Aggiungi nuovo...',
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(inputValue.toLowerCase())
  );
  const showAddNew =
    inputValue.trim() !== '' &&
    !options.some((o) => o.toLowerCase() === inputValue.toLowerCase());

  return (
    <div ref={ref} className="relative">
      <input
        className="input-field"
        value={inputValue}
        placeholder={placeholder}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (filtered.length > 0 || showAddNew) && (
        <div className="absolute z-50 w-full mt-1 bg-surface border border-accent-muted rounded-10 shadow-lg max-h-48 overflow-y-auto">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent-soft text-text-dark"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(option);
                setInputValue(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
          {showAddNew && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-primary font-medium hover:bg-accent-soft border-t border-accent-soft"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(inputValue);
                setOpen(false);
              }}
            >
              + {addNewLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
