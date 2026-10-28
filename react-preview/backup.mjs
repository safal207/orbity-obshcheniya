import { PROGRESS_KEY } from '../dist/progress-store.js';
import { PERSONAL_KEY, validatePersonalImport } from './personal-path.mjs';
import { backupJSON, MAX_BACKUP_BYTES } from './model.mjs';

export const MAX_FULL_BACKUP_BYTES = 1024 * 1024;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const turn = () => new Promise(resolve => setTimeout(resolve, 0));
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

// Course and personal edits already own these two locks. Acquire both in this
// order so a full restore cannot interleave with either kind of normal save.
export function createBackupStore({ courseStore, personalStore,
  storage = () => globalThis.localStorage, locks = () => globalThis.navigator?.locks,
  now = () => new Date(), lockTimeout = 5000 } = {}) {
  function tokens() {
    try {
      const target = storage();
      return { course: target.getItem(PROGRESS_KEY), personal: target.getItem(PERSONAL_KEY) };
    } catch { fail('STORAGE_FAILED'); }
  }

  async function locked(action) {
    let manager;
    try { manager = locks(); } catch { fail('LOCK_UNAVAILABLE'); }
    if (!manager?.request) fail('LOCK_UNAVAILABLE');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), lockTimeout);
    try {
      return await manager.request(PROGRESS_KEY, { mode: 'exclusive', signal: controller.signal }, () =>
        manager.request(PERSONAL_KEY, { mode: 'exclusive', signal: controller.signal }, async () => {
          clearTimeout(timer);
          await turn(); // Publish the previous owner's Firefox storage snapshot.
          return action();
        }));
    } catch (error) {
      if (error.code && typeof error.code === 'string') throw error;
      fail(error.name === 'AbortError' ? 'LOCK_TIMEOUT' : 'STORAGE_FAILED');
    } finally { clearTimeout(timer); }
  }

  function fullJSON(course, personal) {
    return JSON.stringify({ version: 2, savedAt: now().toISOString(),
      course: { ...course, version: 1 }, personal }, null, 2);
  }

  return {
    async export() {
      return locked(() => {
        const course = courseStore.read();
        const personal = personalStore.read();
        // A course-only visitor still gets the original interoperable v1 file.
        const json = personal === null ? backupJSON(course, now()) : fullJSON(course, personal);
        if (new TextEncoder().encode(json).length > MAX_FULL_BACKUP_BYTES) fail('INVALID_FILE');
        return { json, filename: personal === null ? 'orbity-progress-v1.json' : 'orbity-backup-v2.json' };
      });
    },

    async prepare(file, hasDrafts = () => false) {
      if (hasDrafts()) fail('UNSAVED');
      if (!file || file.size > MAX_FULL_BACKUP_BYTES) fail('INVALID_FILE');
      let raw;
      try { raw = JSON.parse(await file.text()); } catch { fail('INVALID_FILE'); }
      let imported, personal;
      if (raw?.version === 1) {
        if (file.size > MAX_BACKUP_BYTES) fail('INVALID_FILE');
        imported = courseStore.validateImport(raw);
      } else {
        if (!exactKeys(raw, ['version', 'savedAt', 'course', 'personal']) || raw.version !== 2 ||
          typeof raw.savedAt !== 'string' || !Number.isFinite(Date.parse(raw.savedAt))) fail('INVALID_FILE');
        imported = courseStore.validateImport(raw.course);
        try { personal = validatePersonalImport(raw.personal); } catch { fail('INVALID_FILE'); }
      }
      if (hasDrafts()) fail('UNSAVED');
      // Capture tokens only after the entire file has passed validation. Invalid
      // current storage remains recoverable, but a later edit cancels restore.
      const token = courseStore.snapshot({ allowInvalid: true }).token;
      return raw.version === 1 ? { version: 1, imported, token } :
        { version: 2, imported, personal, token, personalToken: tokens().personal };
    },

    async restore(prepared, hasDrafts = () => false) {
      if (hasDrafts()) fail('UNSAVED');
      if (prepared.version === 1) return courseStore.replace(prepared.imported, prepared.token);
      if (prepared.version !== 2) fail('INVALID_FILE');
      // Validate again at the mutation boundary, independently of the preview.
      const course = courseStore.validateImport({ ...prepared.imported, version: 1 });
      let personal;
      try { personal = validatePersonalImport(prepared.personal); } catch { fail('INVALID_FILE'); }
      return locked(async () => {
        if (hasDrafts()) fail('UNSAVED');
        const before = tokens();
        if (before.course !== prepared.token || before.personal !== prepared.personalToken) fail('IMPORT_CONFLICT');
        if (personal !== null) {
          let currentRevision = 0;
          try { currentRevision = validatePersonalImport(JSON.parse(before.personal))?.revision || 0; } catch { /* repairing invalid data */ }
          const revision = Math.max(personal.revision, currentRevision) + 1;
          if (!Number.isSafeInteger(revision)) fail('IMPORT_CONFLICT');
          personal.revision = revision; // Invalidate any reflection form in another tab.
        }
        const replacements = [[PROGRESS_KEY, JSON.stringify(course), before.course],
          [PERSONAL_KEY, personal === null ? null : JSON.stringify(personal), before.personal]];
        const attempted = [];
        try {
          for (const [key, value, previous] of replacements) {
            if (value === previous) continue;
            attempted.push([key, previous]);
            const target = storage();
            if (value === null) target.removeItem(key); else target.setItem(key, value);
            if (target.getItem(key) !== value) fail('STORAGE_FAILED');
          }
          await turn();
          const committed = tokens();
          if (committed.course !== replacements[0][1] || committed.personal !== replacements[1][1]) fail('STORAGE_FAILED');
          return course;
        } catch (error) {
          let rollbackFailed = false;
          for (const [key, previous] of attempted.reverse()) {
            try {
              const target = storage();
              if (target.getItem(key) === previous) continue;
              if (previous === null) target.removeItem(key); else target.setItem(key, previous);
              if (target.getItem(key) !== previous) rollbackFailed = true;
            } catch { rollbackFailed = true; }
          }
          await turn();
          if (rollbackFailed) {
            // Keep the original bytes available to the UI even if the browser
            // also rejects rollback. Never report a partial restore as success.
            const failure = Object.assign(new Error('RESTORE_PARTIAL'), { code: 'RESTORE_PARTIAL',
              recovery: JSON.stringify({ format: 'orbity-recovery', savedAt: now().toISOString(), ...before }, null, 2) });
            throw failure;
          }
          throw error.code ? error : Object.assign(error, { code: 'STORAGE_FAILED' });
        }
      });
    },
  };
}
