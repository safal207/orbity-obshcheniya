/**
 * Optional, non-blocking feedback after a successfully saved learning action.
 * Call only from a user-initiated success path, never while saving or on errors.
 */
export function vibrateOnSavedProgress(kind = 'step', root = globalThis) {
  try {
    // Respect accessibility settings and avoid vibrations from background tabs.
    if (root.document?.hidden || root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
    const device = root.navigator;
    if (!device || device.userActivation?.hasBeenActive === false || typeof device.vibrate !== 'function') return false;
    // A light tap for a step, a gentle double tap for a completed milestone.
    return device.vibrate(kind === 'milestone' ? [28, 40, 36] : 18) === true;
  } catch {
    // Vibration is an optional enhancement and cannot affect saved progress.
    return false;
  }
}
