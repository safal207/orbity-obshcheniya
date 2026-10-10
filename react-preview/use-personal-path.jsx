import { useCallback, useEffect, useRef, useState } from 'react';
import { createPersonalStore, PERSONAL_KEY } from './personal-path.mjs';

export const personalStore = createPersonalStore();

export function usePersonalPath() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const pendingRef = useRef(0);
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty) => { dirtyRef.current = dirty; }, []);
  const refresh = useCallback(() => {
    try {
      const next = personalStore.read();
      setState((old) => JSON.stringify(old) === JSON.stringify(next) ? old : next);
      setError(null);
      return next;
    } catch (failure) {
      setState(null);
      setError(failure.code || 'PERSONAL_STORAGE_FAILED');
      return undefined;
    } finally { setLoaded(true); }
  }, []);
  useEffect(() => {
    refresh();
    const onStorage = (event) => { if (event.key === PERSONAL_KEY || event.key === null) refresh(); };
    const onVisible = () => { if (!document.hidden) refresh(); };
    const onUnload = (event) => {
      if (dirtyRef.current || pendingRef.current > 0) { event.preventDefault(); event.returnValue = ''; }
    };
    addEventListener('storage', onStorage);
    addEventListener('focus', refresh);
    addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      removeEventListener('storage', onStorage);
      removeEventListener('focus', refresh);
      removeEventListener('beforeunload', onUnload);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);
  const run = useCallback(async (action) => {
    pendingRef.current++;
    try {
      // The store returns the validated snapshot it committed under its lock.
      const next = await action();
      setState(next);
      setError(null);
      return next;
    } catch (failure) {
      refresh();
      throw failure;
    } finally { pendingRef.current--; }
  }, [refresh]);
  return { state, loaded, error, refresh, run, onDirtyChange };
}
