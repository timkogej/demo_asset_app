import { useRef, useCallback, useState } from 'react';

export function useActionLock() {
  const locked = useRef(false);
  const [isLocked, setIsLocked] = useState(false);

  const withLock = useCallback(async (fn: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setIsLocked(true);
    try {
      await fn();
    } finally {
      locked.current = false;
      setIsLocked(false);
    }
  }, []);

  return { withLock, isLocked };
}
