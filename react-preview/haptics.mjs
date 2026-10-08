/** Optional tactile feedback. Preferences never share the learning-progress key. */
export const HAPTICS_KEY = 'orbity-haptics-v1';
const tabChoices = new WeakMap();

export function readHaptics(root = globalThis) {
  let mode = 'auto';
  let storage = 'ok';
  if (tabChoices.has(root)) {
    mode = tabChoices.get(root);
    storage = 'session';
  } else {
    try {
      const raw = root.localStorage.getItem(HAPTICS_KEY);
      if (raw === 'on' || raw === 'off') mode = raw;
      else if (raw !== null) { mode = 'off'; storage = 'invalid'; }
    } catch { mode = 'off'; storage = 'unavailable'; }
  }
  let reduced = true;
  try { reduced = !!root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; }
  catch { /* An unknown system setting never enables automatic feedback. */ }
  return { mode, storage, reduced, enabled: mode === 'on' || (mode === 'auto' && !reduced) };
}

export function setHapticsEnabled(enabled, root = globalThis) {
  if (typeof enabled !== 'boolean') throw new TypeError('Expected a boolean haptics preference');
  const mode = enabled ? 'on' : 'off';
  // If persistence fails, keep an explicitly labelled, tab-scoped choice.
  tabChoices.set(root, mode);
  try {
    root.localStorage.setItem(HAPTICS_KEY, mode);
    if (root.localStorage.getItem(HAPTICS_KEY) === mode) tabChoices.delete(root);
  } catch { /* A preference error must never block learning or overwrite progress. */ }
  if (!enabled) {
    try { root.navigator?.vibrate?.(0); } catch { /* Optional cancellation. */ }
  }
  return readHaptics(root);
}

/** Scalar settings use last-writer-wins; storage events never trigger feedback. */
export function syncHaptics(event, root = globalThis) {
  if (event.key !== HAPTICS_KEY && event.key !== null) return false;
  try { if (event.storageArea && event.storageArea !== root.localStorage) return false; }
  catch { return false; }
  tabChoices.delete(root);
  return true;
}

function requestPulse(pattern, root) {
  try {
    if (!readHaptics(root).enabled) return 'off';
    if (root.document?.hidden) return 'hidden';
    const device = root.navigator;
    if (typeof device?.vibrate !== 'function') return 'unsupported';
    if (device.userActivation?.hasBeenActive === false) return 'gesture';
    // true only acknowledges the API request; it does not prove a motor moved.
    return device.vibrate(pattern) === true ? 'requested' : 'blocked';
  } catch { return 'error'; }
}

/** Call synchronously from the explicit Test button, not an effect or timer. */
export function testHaptics(root = globalThis) {
  return requestPulse(120, root);
}

/** Call only after the existing save-and-reread success path. */
export function vibrateOnSavedProgress(kind = 'step', root = globalThis) {
  return requestPulse(kind === 'milestone' ? [28, 40, 36] : 18, root) === 'requested';
}
