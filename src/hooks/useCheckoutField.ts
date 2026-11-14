import { useState, useCallback, type SetStateAction } from 'react';

// Session-only checkout draft: survives reload/auth navigation, expires after one day.
export function useCheckoutField<T>(key: string, initial: T | (() => T)) {
  const storageKey = `ryyco_checkout_${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (Date.now() - draft.savedAt < 86400000) return draft.value as T;
      }
    } catch {}
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  const set = useCallback((next: SetStateAction<T>) => {
    setValue(previous => {
      const updated = typeof next === 'function' ? (next as (value: T) => T)(previous) : next;
      try { sessionStorage.setItem(storageKey, JSON.stringify({ value: updated, savedAt: Date.now() })); } catch {}
      return updated;
    });
  }, [storageKey]);
  return [value, set] as const;
}
