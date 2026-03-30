import { useState, useEffect, useCallback } from 'react';
import { translations } from './translations';
import type { Language } from '../types';

const STORAGE_KEY = 'fleetinvoice_language';

export function useTranslation() {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem(STORAGE_KEY) as Language) || 'it';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const t = useCallback(
    (key: string): string => {
      const keys = key.split('.');
      let value: unknown = translations[language];
      for (const k of keys) {
        if (value && typeof value === 'object' && k in (value as Record<string, unknown>)) {
          value = (value as Record<string, unknown>)[k];
        } else {
          // fallback to Italian
          let fallback: unknown = translations['it'];
          for (const fk of keys) {
            if (fallback && typeof fallback === 'object' && fk in (fallback as Record<string, unknown>)) {
              fallback = (fallback as Record<string, unknown>)[fk];
            } else {
              return key;
            }
          }
          return typeof fallback === 'string' ? fallback : key;
        }
      }
      return typeof value === 'string' ? value : key;
    },
    [language]
  );

  return { t, language, setLanguage };
}
