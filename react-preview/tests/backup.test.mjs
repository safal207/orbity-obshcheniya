import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgressStore, PROGRESS_KEY, emptyState } from '../../dist/progress-store.js';
import { createPersonalStore, PERSONAL_KEY } from '../personal-path.mjs';
import { createBackupStore, MAX_FULL_BACKUP_BYTES } from '../backup.mjs';

const NOW = Date.parse('2026-10-28T12:00:00Z');
const course = () => ({ ...emptyState(), notes: { a: 'Saved course note' }, focusModule: 'needs' });
const personal = () => ({ version: 1, revision: 2,
  profile: { address: 'neutral', goal: 'needs', startedAt: NOW - 86400000, baseline: 2 },
  sessions: [{ index: 0, completedAt: NOW, phrase: 'Could you help me with dinner?', plan: 'After work',
    reflection: { outcome: 'difficult', note: 'I need a quieter moment.' } }] });
const file = value => { const text = typeof value === 'string' ? value : JSON.stringify(value); return { size: Buffer.byteLength(text), text: async () => text }; };
const full = () => ({ version: 2, savedAt: new Date(NOW).toISOString(), course: { ...course(), version: 1 }, personal: personal() });

function fixture(courseState = course(), personalState = personal()) {
  const data = new Map();
  if (courseState !== null) data.set(PROGRESS_KEY, typeof courseState === 'string' ? courseState : JSON.stringify(courseState));
  if (personalState !== null) data.set(PERSONAL_KEY, typeof personalState === 'string' ? personalState : JSON.stringify(personalState));
  const writes = [], held = new Set(), queue = new Map();
  let fault = null, onLock = null;
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem(key, value) { if (fault?.(key, value) === 'drop') return; writes.push([key, value]); data.set(key, value); },
    removeItem(key) { if (fault?.(key, null) === 'drop') return; writes.push([key, null]); data.delete(key); },
  };
  const locks = { request(name, options, action) {
    const previous = queue.get(name) || Promise.resolve();
    const current = previous.then(async () => {
      if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      held.add(name); onLock?.(name);
      try { return await action(); } finally { held.delete(name); }
    });
    queue.set(name, current.catch(() => {})); return current;
  } };
  const courseStore = createProgressStore({ lessons: [{ id: 'a', moduleId: 'needs', quiz: { choices: ['a', 'b'], correct: [1] } }],
    missions: [], storage: () => storage, locks: () => locks });
  const personalStore = createPersonalStore({ storage, locks, now: () => NOW });
  const backups = createBackupStore({ courseStore, personalStore, storage: () => storage, locks: () => locks, now: () => new Date(NOW) });
  return { backups, data, storage, writes, held, courseStore, personalStore,
    fault(fn) { fault = fn; }, onLock(fn) { onLock = fn; }, before: () => [...data.entries()] };
}

test('full export retains every personal field and reads under both existing locks without writes', async () => {
  const f = fixture(); const before = f.before();
  f.onLock(name => { if (name === PERSONAL_KEY) assert.equal(f.held.has(PROGRESS_KEY), true); });
  const exported = await f.backups.export();
  assert.equal(exported.filename, 'orbity-backup-v2.json');
  assert.deepEqual(JSON.parse(exported.json), full());
  assert.deepEqual(f.before(), before); assert.equal(f.writes.length, 0);
});

test('full restore round-trips course, phrases, plans and reflections, invalidating old personal revisions', async () => {
  const f = fixture(emptyState(), { ...personal(), revision: 12, sessions: [] });
  const prepared = await f.backups.prepare(file(full()));
  f.fault(() => { assert.equal(f.held.has(PROGRESS_KEY) && f.held.has(PERSONAL_KEY), true); });
  await f.backups.restore(prepared);
  assert.deepEqual(f.courseStore.read(), course());
  assert.deepEqual(f.personalStore.read(), { ...personal(), revision: 13 });
});

test('course-only export keeps v1 and old imports preserve every byte of an existing personal path', async () => {
  const emptyPersonal = fixture(course(), null);
  const exported = await emptyPersonal.backups.export();
  assert.equal(exported.filename, 'orbity-progress-v1.json');
  assert.equal(JSON.parse(exported.json).version, 1);
  const f = fixture(emptyState()); const before = f.data.get(PERSONAL_KEY);
  await f.backups.restore(await f.backups.prepare(file(exported.json)));
  assert.deepEqual(f.courseStore.read(), course());
  assert.equal(f.data.get(PERSONAL_KEY), before);
});

for (const mutate of [
  value => { value.personal.profile.unknown = true; },
  value => { value.personal.sessions[0].index = 2; },
  value => { value.personal.sessions[0].reflection.outcome = 'successful-relationship'; },
  value => { value.course.notes.a = 12; },
  value => { value.extra = 'not allowed'; },
  value => { delete value.personal; },
  value => { value.version = 3; },
]) {
  test(`invalid full backup is rejected without writes: ${mutate.toString()}`, async () => {
    const f = fixture(); const before = f.before(); const value = full(); mutate(value);
    await assert.rejects(f.backups.prepare(file(value)), { code: 'INVALID_FILE' });
    assert.deepEqual(f.before(), before); assert.equal(f.writes.length, 0);
  });
}

test('oversized files are rejected before reading and malformed JSON never reaches mutation', async () => {
  const f = fixture(); let read = false;
  await assert.rejects(f.backups.prepare({ size: MAX_FULL_BACKUP_BYTES + 1, text: async () => { read = true; return '{}'; } }), { code: 'INVALID_FILE' });
  await assert.rejects(f.backups.prepare(file('{broken')), { code: 'INVALID_FILE' });
  assert.equal(read, false); assert.equal(f.writes.length, 0);
});

for (const key of [PROGRESS_KEY, PERSONAL_KEY]) {
  test(`a newer ${key} snapshot cancels the entire restore`, async () => {
    const f = fixture(); const prepared = await f.backups.prepare(file(full()));
    f.data.set(key, `${f.data.get(key)} `); const before = f.before();
    await assert.rejects(f.backups.restore(prepared), { code: 'IMPORT_CONFLICT' });
    assert.deepEqual(f.before(), before); assert.equal(f.writes.length, 0);
  });
}

test('a draft appearing while reading or acquiring locks blocks restore', async () => {
  const f = fixture(); let dirty = false;
  await assert.rejects(f.backups.prepare({ size: 2, text: async () => { dirty = true; return JSON.stringify(full()); } }, () => dirty), { code: 'UNSAVED' });
  dirty = false; const prepared = await f.backups.prepare(file(full()));
  f.onLock(name => { if (name === PERSONAL_KEY) dirty = true; });
  await assert.rejects(f.backups.restore(prepared, () => dirty), { code: 'UNSAVED' });
  assert.equal(f.writes.length, 0);
});

for (const fault of ['throw', 'drop']) {
  test(`a ${fault} on the second key rolls back the first key exactly`, async () => {
    const f = fixture(emptyState(), null); const before = f.before();
    const prepared = await f.backups.prepare(file(full()));
    f.fault(key => { if (key === PERSONAL_KEY) { if (fault === 'throw') throw new Error('Synthetic quota failure'); return 'drop'; } });
    await assert.rejects(f.backups.restore(prepared), { code: 'STORAGE_FAILED' });
    assert.deepEqual(f.before(), before);
  });
}

test('failed rollback never reports success and keeps the original bytes available for recovery', async () => {
  const f = fixture(emptyState(), null); const before = f.before();
  const prepared = await f.backups.prepare(file(full())); let courseWrites = 0;
  f.fault(key => {
    if (key === PERSONAL_KEY || (key === PROGRESS_KEY && ++courseWrites > 1)) throw new Error('Synthetic persistent write failure');
  });
  await assert.rejects(f.backups.restore(prepared), failure => {
    assert.equal(failure.code, 'RESTORE_PARTIAL');
    const recovery = JSON.parse(failure.recovery);
    assert.equal(recovery.course, before.find(([key]) => key === PROGRESS_KEY)[1]);
    assert.equal(recovery.personal, null); return true;
  });
});

test('a valid full backup can repair corrupt course and personal records', async () => {
  const f = fixture('{broken course', '{broken personal');
  await f.backups.restore(await f.backups.prepare(file(full())));
  assert.deepEqual(f.courseStore.read(), course());
  assert.deepEqual(f.personalStore.read().sessions, personal().sessions);
});

test('an exhausted revision fails before changing course data', async () => {
  const value = full(); value.personal.revision = Number.MAX_SAFE_INTEGER;
  const f = fixture(); const before = f.before();
  await assert.rejects(f.backups.restore(await f.backups.prepare(file(value))), { code: 'IMPORT_CONFLICT' });
  assert.deepEqual(f.before(), before); assert.equal(f.writes.length, 0);
});

test('unreadable personal storage cannot produce a misleading course-only full export', async () => {
  const f = fixture(course(), '{broken');
  await assert.rejects(f.backups.export(), { code: 'PERSONAL_INVALID_STORED' });
  assert.equal(f.writes.length, 0);
});

test('an explicitly empty personal backup clears only the confirmed personal record', async () => {
  const f = fixture(); const value = full(); value.personal = null;
  await f.backups.restore(await f.backups.prepare(file(value)));
  assert.equal(f.personalStore.read(), null); assert.deepEqual(f.courseStore.read(), course());
});

test('missing or timed-out locks cannot change either record', async () => {
  const f = fixture(); const before = f.before();
  const options = { courseStore: f.courseStore, personalStore: f.personalStore, storage: () => f.storage };
  const unavailable = createBackupStore({ ...options, locks: () => undefined });
  await assert.rejects(unavailable.export(), { code: 'LOCK_UNAVAILABLE' });
  const prepared = await f.backups.prepare(file(full()));
  await assert.rejects(unavailable.restore(prepared), { code: 'LOCK_UNAVAILABLE' });
  const blocked = createBackupStore({ ...options, lockTimeout: 10, locks: () => ({
    request(name, { signal }) { return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }); },
  }) });
  await assert.rejects(blocked.restore(prepared), { code: 'LOCK_TIMEOUT' });
  assert.deepEqual(f.before(), before); assert.equal(f.writes.length, 0);
});

test('changing a prepared payload cannot bypass validation at restore time', async () => {
  const f = fixture(); const before = f.before();
  const prepared = await f.backups.prepare(file(full()));
  prepared.personal.sessions[0].reflection.outcome = 'forged';
  await assert.rejects(f.backups.restore(prepared), { code: 'INVALID_FILE' });
  assert.deepEqual(f.before(), before); assert.equal(f.writes.length, 0);
});
