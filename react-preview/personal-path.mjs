// Personal practice is independent of the course's v1 progress and XP.
export const PERSONAL_KEY = 'orbity-personal-path-v1';
const MAX_STORED_LENGTH = 256 * 1024;
const ADDRESSES = ['her', 'him', 'neutral'];
const OUTCOMES = ['tried', 'difficult', 'no-chance'];
const fail = (code) => { throw Object.assign(new Error(code), { code }); };
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasShape = (value, keys) => isRecord(value) && Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));
const isTime = (value) => Number.isSafeInteger(value) && value > 0 && value <= 8.64e15;
const isRevision = (value) => Number.isSafeInteger(value) && value >= 1;
const isText = (value, limit, minimum = 0) => typeof value === 'string' &&
  value.length <= limit && value.trim().length >= minimum;

// Local calendar dates, including daylight-saving changes, determine the day.
export function personalDay(timestamp) {
  if (!isTime(timestamp)) fail('PERSONAL_INVALID_INPUT');
  const date = new Date(timestamp);
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
  if (!Number.isFinite(day)) fail('PERSONAL_INVALID_INPUT');
  return day;
}

function validate(state) {
  const invalid = () => fail('PERSONAL_INVALID_STORED');
  if (!hasShape(state, ['version', 'revision', 'profile', 'sessions']) || state.version !== 1 ||
    !isRevision(state.revision) || !hasShape(state.profile, ['address', 'goal', 'startedAt', 'baseline']) ||
    !ADDRESSES.includes(state.profile.address) || state.profile.goal !== 'needs' ||
    !isTime(state.profile.startedAt) || (state.profile.baseline !== null &&
      (!Number.isInteger(state.profile.baseline) || state.profile.baseline < 1 || state.profile.baseline > 5)) ||
    !Array.isArray(state.sessions) || state.sessions.length > 7) invalid();
  let previousTime = state.profile.startedAt;
  for (let index = 0; index < state.sessions.length; index += 1) {
    const session = state.sessions[index];
    if (!hasShape(session, ['index', 'completedAt', 'phrase', 'plan', 'reflection']) ||
      session.index !== index || !isTime(session.completedAt) || session.completedAt < previousTime ||
      (index > 0 && session.completedAt === previousTime) || !isText(session.phrase, 2000, 8) ||
      !isText(session.plan, 500)) invalid();
    if (session.reflection !== null && (!hasShape(session.reflection, ['outcome', 'note']) ||
      !OUTCOMES.includes(session.reflection.outcome) || !isText(session.reflection.note, 1000))) invalid();
    previousTime = session.completedAt;
  }
  // Historical timestamps may fall on the same date after a timezone change.
  // Enforce the one-per-day rule when writing, using the device's current zone.
  return state;
}

export function dailyStatus(state, now = Date.now()) {
  const today = personalDay(now);
  if (state === null) return { phase: 'new', index: 0, completedCount: 0 };
  validate(state);
  const completedCount = state.sessions.length;
  if (completedCount === 7) return { phase: 'week-done', index: 6, completedCount };
  const last = state.sessions.at(-1);
  if (last && personalDay(last.completedAt) >= today) {
    return { phase: 'done-today', index: last.index, completedCount };
  }
  return { phase: 'ready', index: completedCount, completedCount };
}

export function createPersonalStore({ storage, locks, now = () => Date.now() } = {}) {
  // Resolve browser globals inside the guarded access: privacy settings may
  // throw even when merely retrieving window.localStorage.
  function getStorage() {
    try {
      const target = storage === undefined ? globalThis.localStorage : storage;
      if (!target || typeof target.getItem !== 'function' || typeof target.setItem !== 'function') {
        fail('PERSONAL_STORAGE_FAILED');
      }
      return target;
    } catch { fail('PERSONAL_STORAGE_FAILED'); }
  }

  function read() {
    let raw;
    try { raw = getStorage().getItem(PERSONAL_KEY); }
    catch { fail('PERSONAL_STORAGE_FAILED'); }
    if (raw === null) return null;
    if (typeof raw !== 'string' || raw.length > MAX_STORED_LENGTH) fail('PERSONAL_INVALID_STORED');
    try { return validate(JSON.parse(raw)); }
    catch { fail('PERSONAL_INVALID_STORED'); }
  }

  function timestamp() {
    let value;
    try { value = now(); } catch { fail('PERSONAL_INVALID_INPUT'); }
    if (!isTime(value)) fail('PERSONAL_INVALID_INPUT');
    personalDay(value);
    return value;
  }

  async function transaction(edit) {
    let manager;
    try { manager = locks === undefined ? globalThis.navigator?.locks : locks; }
    catch { fail('PERSONAL_LOCK_UNAVAILABLE'); }
    if (!manager || typeof manager.request !== 'function') fail('PERSONAL_LOCK_UNAVAILABLE');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      return await manager.request(PERSONAL_KEY, { mode: 'exclusive', signal: controller.signal }, async () => {
        clearTimeout(timer); // The timeout concerns waiting for ownership.
        // Allow any prior Firefox localStorage snapshot to finish before reading.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const current = read();
        const next = edit(current);
        if (current && current.revision === Number.MAX_SAFE_INTEGER) fail('PERSONAL_CONFLICT');
        next.revision = current ? current.revision + 1 : 1;
        validate(next);
        const raw = JSON.stringify(next);
        if (raw.length > MAX_STORED_LENGTH) fail('PERSONAL_INVALID_INPUT');
        try {
          const target = getStorage();
          target.setItem(PERSONAL_KEY, raw);
          if (target.getItem(PERSONAL_KEY) !== raw) fail('PERSONAL_STORAGE_FAILED');
        } catch { fail('PERSONAL_STORAGE_FAILED'); }
        // Firefox publishes writes at the end of the task. Keep exclusive
        // ownership until another tab can observe this committed snapshot.
        await new Promise((resolve) => setTimeout(resolve, 0));
        return next;
      });
    } catch (error) {
      if (typeof error?.code === 'string' && error.code.startsWith('PERSONAL_')) throw error;
      fail(error?.name === 'AbortError' ? 'PERSONAL_LOCK_TIMEOUT' : 'PERSONAL_STORAGE_FAILED');
    } finally { clearTimeout(timer); }
  }

  function registered(state) {
    if (state === null) fail('PERSONAL_NOT_REGISTERED');
    return state;
  }

  return {
    read,
    async register(input = {}) {
      if (!isRecord(input)) fail('PERSONAL_INVALID_INPUT');
      const { address, baseline = null } = input;
      if (!ADDRESSES.includes(address) || (baseline !== null &&
        (!Number.isInteger(baseline) || baseline < 1 || baseline > 5))) fail('PERSONAL_INVALID_INPUT');
      return transaction((current) => {
        if (current !== null) fail('PERSONAL_CONFLICT');
        return { version: 1, revision: 1,
          profile: { address, goal: 'needs', startedAt: timestamp(), baseline }, sessions: [] };
      });
    },
    async complete(input = {}) {
      if (!isRecord(input)) fail('PERSONAL_INVALID_INPUT');
      const { index, phrase, plan = '' } = input;
      if (!Number.isInteger(index) || index < 0 || index > 6 ||
        !isText(phrase, 2000, 8) || !isText(plan, 500)) fail('PERSONAL_INVALID_INPUT');
      return transaction((current) => {
        registered(current);
        if (index !== current.sessions.length) fail('PERSONAL_CONFLICT');
        const completedAt = timestamp();
        const status = dailyStatus(current, completedAt);
        if (status.phase === 'done-today') fail('PERSONAL_DONE_TODAY');
        if (status.phase !== 'ready' || completedAt < current.profile.startedAt) fail('PERSONAL_CONFLICT');
        current.sessions.push({ index, completedAt, phrase: phrase.trim(), plan: plan.trim(), reflection: null });
        return current;
      });
    },
    // Require the revision displayed by the form. A stale tab must explicitly
    // reload a reflection instead of silently replacing someone else's edit.
    async reflect(input = {}) {
      if (!isRecord(input)) fail('PERSONAL_INVALID_INPUT');
      const { index, outcome, note = '', expectedRevision } = input;
      if (!Number.isInteger(index) || index < 0 || index > 6 || !OUTCOMES.includes(outcome) ||
        !isText(note, 1000) || !isRevision(expectedRevision)) fail('PERSONAL_INVALID_INPUT');
      return transaction((current) => {
        registered(current);
        if (current.revision !== expectedRevision || !current.sessions[index]) fail('PERSONAL_CONFLICT');
        current.sessions[index].reflection = { outcome, note: note.trim() };
        return current;
      });
    },
    async updateAddress(address) {
      if (!ADDRESSES.includes(address)) fail('PERSONAL_INVALID_INPUT');
      return transaction((current) => {
        registered(current);
        current.profile.address = address;
        return current;
      });
    },
  };
}
