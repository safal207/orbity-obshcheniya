// Shared by RU and EN. No cached whole-state writes: every edit reads the latest
// snapshot while holding the same origin-wide Web Lock.
export const PROGRESS_KEY = 'orbity-dialoga-progress-v1';
export const emptyState = () => ({ completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {} });
const fields = Object.keys(emptyState());
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export function createProgressStore({ lessons, missions, storage = () => globalThis.localStorage,
  locks = () => globalThis.navigator?.locks, lockTimeout = 5000 }) {
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const missionById = new Map(missions.map((mission) => [mission.id, mission]));

  function validate(raw, importing = false) {
    if (!record(raw)) fail('INVALID_FILE');
    const allowed = importing ? [...fields, 'version', 'savedAt'] : fields;
    if (Object.keys(raw).some((key) => !allowed.includes(key))) fail('INVALID_FILE');
    if (importing && (raw.version !== 1 ||
      ('savedAt' in raw && (typeof raw.savedAt !== 'string' || !Number.isFinite(Date.parse(raw.savedAt)))))) fail('INVALID_FILE');
    const clean = emptyState();
    for (const field of fields) {
      if (!record(raw[field])) fail('INVALID_FILE');
      for (const [id, value] of Object.entries(raw[field])) {
        const lesson = lessonById.get(id);
        const mission = missionById.get(id);
        if (field === 'missionSteps') {
          if (!mission || !Array.isArray(value) || value.length !== mission.steps.length ||
            Array.from(value).some((step) => typeof step !== 'boolean')) fail('INVALID_FILE');
          clean[field][id] = [...value];
        } else {
          if (!lesson) fail('INVALID_FILE');
          if ((field === 'completed' || field === 'review') &&
            (!Number.isSafeInteger(value) || value <= 0 || value > 8.64e15)) fail('INVALID_FILE');
          if (field === 'answers' && (!Number.isInteger(value) || value < 0 || value >= lesson.quiz.choices.length)) fail('INVALID_FILE');
          if (field === 'notes' && (typeof value !== 'string' || value.length > 2000)) fail('INVALID_FILE');
          clean[field][id] = value;
        }
      }
    }
    return clean;
  }

  function snapshot() {
    let token;
    try { token = storage().getItem(PROGRESS_KEY); }
    catch { fail('STORAGE_FAILED'); }
    if (token === null) return { token, state: emptyState() };
    try { return { token, state: validate(JSON.parse(token)) }; }
    catch { fail('INVALID_STORED'); }
  }

  async function transaction(edit) {
    const manager = locks();
    if (!manager?.request) fail('LOCK_UNAVAILABLE');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), lockTimeout);
    try {
      return await manager.request(PROGRESS_KEY, { mode: 'exclusive', signal: controller.signal }, () => {
        // Synchronous read/modify/write under the lock; no prompts or awaits here.
        const current = snapshot();
        const next = validate(edit(current.state, current.token));
        try { storage().setItem(PROGRESS_KEY, JSON.stringify(next)); }
        catch { fail('STORAGE_FAILED'); }
        return next;
      });
    } catch (error) {
      if (error.code && typeof error.code === 'string') throw error;
      fail(error.name === 'AbortError' ? 'LOCK_TIMEOUT' : 'STORAGE_FAILED');
    } finally { clearTimeout(timer); }
  }

  return {
    snapshot,
    read: () => snapshot().state,
    validateImport: (raw) => validate(raw, true),
    answer(id, choice, mode, now = Date.now()) {
      const lesson = lessonById.get(id);
      if (!lesson || !Number.isInteger(choice) || choice < 0 || choice >= lesson.quiz.choices.length) fail('INVALID_EDIT');
      return transaction((latest) => {
        if (mode !== 'review') latest.answers[id] = choice;
        if (lesson.quiz.correct.includes(choice)) {
          latest.completed[id] ||= now;
          latest.review[id] = now + (mode === 'review' ? 3 : 1) * 86400000;
        }
        return latest;
      });
    },
    saveNote(id, value, expected) {
      if (!lessonById.has(id) || typeof value !== 'string' || value.length > 2000 || typeof expected !== 'string') fail('INVALID_EDIT');
      return transaction((latest) => {
        const saved = latest.notes[id] || '';
        if (saved !== expected && saved !== value) fail('NOTE_CONFLICT');
        latest.notes[id] = value;
        return latest;
      });
    },
    setMissionStep(id, index, checked) {
      const mission = missionById.get(id);
      if (!mission || !Number.isInteger(index) || index < 0 || index >= mission.steps.length ||
        typeof checked !== 'boolean') fail('INVALID_EDIT');
      return transaction((latest) => {
        latest.missionSteps[id] ||= mission.steps.map(() => false);
        latest.missionSteps[id][index] = checked;
        return latest;
      });
    },
    replace(imported, expectedToken) {
      const replacement = validate(imported);
      return transaction((latest, token) => {
        // Do not erase a write committed after the replacement confirmation began.
        if (token !== expectedToken) fail('IMPORT_CONFLICT');
        return replacement;
      });
    },
  };
}
