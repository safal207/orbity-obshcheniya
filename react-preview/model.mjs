export const XP_PER_LESSON = 20;
export const MAX_BACKUP_BYTES = 512 * 1024;

// Calendar days, not 24-hour elapsed periods: handles DST and local midnight.
export function calendarDay(timestamp) {
  const d = new Date(timestamp);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
}

export function metrics(state, lessons, now = Date.now()) {
  if (!state) return null; // Unreadable storage is not a new, empty account.
  const known = new Set(lessons.map((l) => l.id));
  const timestamps = Object.entries(state.completed)
    .filter(([id, time]) => known.has(id) && Number.isFinite(time) && time > 0 && time <= now)
    .map(([, time]) => time);
  const today = calendarDay(now);
  const days = new Set(timestamps.map(calendarDay));
  let cursor = days.has(today) ? today : today - 1;
  let streak = 0;
  while (days.has(cursor--)) streak += 1;
  return {
    count: timestamps.length,
    total: lessons.length,
    xp: timestamps.length * XP_PER_LESSON,
    streak,
    today: timestamps.filter((t) => calendarDay(t) === today).length,
    due: lessons.filter((l) => state.completed[l.id] && state.review[l.id] <= now),
  };
}

export function readRoute(hash, lessons) {
  const clean = hash.replace(/^#/, '').split('/');
  if (['lesson', 'practice'].includes(clean[0]) && lessons.some((l) => l.id === clean[1])) {
    return { view: clean[0], id: clean[1] };
  }
  return { view: ['missions', 'progress'].includes(clean[0]) ? clean[0] : 'path', id: null };
}

export function backupJSON(state, now = new Date()) {
  return JSON.stringify({ ...state, version: 1, savedAt: now.toISOString() }, null, 2);
}

export async function prepareImport(file, store, hasDrafts) {
  if (hasDrafts()) throw Object.assign(new Error('UNSAVED'), { code: 'UNSAVED' });
  if (!file || file.size > MAX_BACKUP_BYTES) throw Object.assign(new Error('INVALID_FILE'), { code: 'INVALID_FILE' });
  let raw;
  try { raw = JSON.parse(await file.text()); }
  catch { throw Object.assign(new Error('INVALID_FILE'), { code: 'INVALID_FILE' }); }
  // Validate before asking the user to replace anything, including on recovery.
  const imported = store.validateImport(raw);
  if (hasDrafts()) throw Object.assign(new Error('UNSAVED'), { code: 'UNSAVED' });
  return { imported, token: store.snapshot({ allowInvalid: true }).token };
}
