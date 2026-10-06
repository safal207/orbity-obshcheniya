// Shared by RU and EN. No cached whole-state writes: every edit reads the latest
// snapshot while holding the same origin-wide Web Lock.
export const PROGRESS_KEY = 'orbity-dialoga-progress-v1';
export const emptyState = () => ({ completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {},
  focusModule: null, currentLessonId: null, guidedFlow: null });
const fields = ['completed', 'answers', 'notes', 'review', 'missionSteps'];
const navigationFields = ['focusModule', 'currentLessonId', 'guidedFlow'];
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export function createProgressStore({ lessons, missions, storage = () => globalThis.localStorage,
  locks = () => globalThis.navigator?.locks, lockTimeout = 5000, guided = {
    listening: ['listening-3', 'listening-1', 'listening-2'],
    conflict: ['conflict-1', 'conflict-2', 'conflict-3'],
    needs: ['needs-1', 'needs-2', 'needs-3'],
  } }) {
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const missionById = new Map(missions.map((mission) => [mission.id, mission]));

  function validate(raw, importing = false) {
    if (!record(raw)) fail('INVALID_FILE');
    const allowed = [...fields, ...navigationFields, ...(importing ? ['version', 'savedAt'] : [])];
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
    // Navigation fields were added without changing the v1 export version.
    // Their absence is valid for older exports; their malformed values are not.
    if (raw.focusModule != null) {
      if (!lessons.some((lesson) => lesson.moduleId === raw.focusModule)) fail('INVALID_FILE');
      clean.focusModule = raw.focusModule;
    }
    if (raw.currentLessonId != null) {
      if (!lessonById.has(raw.currentLessonId)) fail('INVALID_FILE');
      clean.currentLessonId = raw.currentLessonId;
    }
    if (raw.guidedFlow != null) {
      const flow = raw.guidedFlow;
      if (!record(flow) || typeof flow.topic !== 'string' || Object.keys(flow).some((key) => !['topic', 'step'].includes(key)) ||
        !Object.hasOwn(guided, flow.topic) || !Number.isInteger(flow.step) ||
        flow.step < 0 || flow.step > guided[flow.topic].length) fail('INVALID_FILE');
      clean.guidedFlow = { topic: flow.topic, step: flow.step };
    }
    return clean;
  }

  function snapshot({ allowInvalid = false } = {}) {
    let token;
    try { token = storage().getItem(PROGRESS_KEY); }
    catch { fail('STORAGE_FAILED'); }
    if (token === null) return { token, state: emptyState() };
    try { return { token, state: validate(JSON.parse(token)) }; }
    catch {
      if (allowInvalid) return { token, state: null, invalid: true };
      fail('INVALID_STORED');
    }
  }

  async function transaction(edit, allowInvalid = false) {
    const manager = locks();
    if (!manager?.request) fail('LOCK_UNAVAILABLE');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), lockTimeout);
    try {
      return await manager.request(PROGRESS_KEY, { mode: 'exclusive', signal: controller.signal }, () => {
        // Synchronous read/modify/write under the lock; no prompts or awaits here.
        const current = snapshot({ allowInvalid });
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
    selectModule(id) {
      if (!lessons.some((lesson) => lesson.moduleId === id)) fail('INVALID_EDIT');
      return transaction((latest) => {
        // Only the displayed orbit changes; keep the lesson/guided bookmark.
        latest.focusModule = id;
        return latest;
      });
    },
    selectLesson(id) {
      const lesson = lessonById.get(id);
      if (!lesson) fail('INVALID_EDIT');
      return transaction((latest) => {
        latest.currentLessonId = id;
        latest.focusModule = lesson.moduleId;
        latest.guidedFlow = null;
        return latest;
      });
    },
    startGuided(topic) {
      if (!Object.hasOwn(guided, topic)) fail('INVALID_EDIT');
      return transaction((latest) => {
        latest.focusModule = topic;
        latest.currentLessonId = guided[topic][0];
        const previous = latest.guidedFlow;
        // Explicit selection restarts completed introductions; unfinished ones resume.
        const step = previous?.topic === topic && previous.step < guided[topic].length ? previous.step : 0;
        latest.guidedFlow = { topic, step };
        return latest;
      });
    },
    answer(id, choice, mode, now = Date.now()) {
      const lesson = lessonById.get(id);
      if (!lesson || !['lesson', 'practice', 'review', 'guided'].includes(mode) ||
        !Number.isInteger(choice) || choice < 0 || choice >= lesson.quiz.choices.length) fail('INVALID_EDIT');
      return transaction((latest) => {
        if (!lesson.quiz.correct.includes(choice)) return latest;
        if (mode === 'guided') {
          const step = guided[lesson.moduleId]?.indexOf(id);
          if (latest.guidedFlow?.topic !== lesson.moduleId || !(step >= 0)) fail('FLOW_CONFLICT');
          latest.guidedFlow.step = Math.max(latest.guidedFlow.step, step + 1);
          return latest;
        }
        // Preserve the new UI contract: only a full lesson marks completion.
        if (mode === 'lesson') {
          latest.completed[id] ||= now;
          latest.currentLessonId = id;
          latest.focusModule = lesson.moduleId;
          latest.guidedFlow = null;
        }
        latest.answers[id] = choice;
        if (latest.completed[id]) latest.review[id] = now + (mode === 'review' ? 3 : 1) * 86400000;
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
      }, true);
    },
  };
}
