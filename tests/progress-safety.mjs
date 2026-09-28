import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProgressStore, emptyState, PROGRESS_KEY } from '../dist/progress-store.js';
import { lessons, missions } from '../dist/course.js';

function fixture(seed = emptyState()) {
  const data = new Map([[PROGRESS_KEY, JSON.stringify(seed)]]);
  let failRead = false;
  let failWrite = false;
  let writes = 0;
  const storage = {
    getItem(key) { if (failRead) throw new Error('SecurityError'); return data.get(key) ?? null; },
    setItem(key, value) { if (failWrite) throw new Error('QuotaExceededError'); writes++; data.set(key, value); },
  };
  let tail = Promise.resolve();
  const locks = { request(name, options, callback) {
    assert.equal(name, PROGRESS_KEY);
    assert.equal(options.mode, 'exclusive');
    const next = tail.then(() => {
      if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return callback({ name });
    });
    tail = next.catch(() => {});
    return next;
  } };
  const make = (extra = {}) => createProgressStore({ lessons, missions, storage: () => storage, locks: () => locks, ...extra });
  return { make, data, storage, get writes() { return writes; },
    failReads() { failRead = true; }, failWrites() { failWrite = true; } };
}
const first = lessons[0];
const second = lessons[1];
const correct = (lesson) => lesson.quiz.correct[0];
const now = 1790600000000;
const file = (state = emptyState()) => ({ version: 1, savedAt: '2026-09-28T12:00:00Z', ...state });

const badFiles = {
  'null root': null,
  'array root': [],
  'unsupported version': { ...file(), version: 2 },
  'completed array (Qodo regression)': { ...file(), completed: [] },
  'missing fields': { version: 1, completed: {} },
  'unknown lesson': { ...file(), completed: { unknown: now } },
  'invalid timestamp': { ...file(), completed: { [first.id]: 'yesterday' } },
  'zero timestamp': { ...file(), completed: { [first.id]: 0 } },
  'infinite timestamp': { ...file(), completed: { [first.id]: Infinity } },
  'out-of-range answer': { ...file(), answers: { [first.id]: first.quiz.choices.length } },
  'non-string note': { ...file(), notes: { [first.id]: {} } },
  'oversized note': { ...file(), notes: { [first.id]: 'x'.repeat(2001) } },
  'non-boolean mission': { ...file(), missionSteps: { [missions[0].id]: [true, 1, false] } },
  'truncated mission': { ...file(), missionSteps: { [missions[0].id]: [true] } },
  'unknown mission': { ...file(), missionSteps: { unknown: [true, false, true] } },
  'bad savedAt': { ...file(), savedAt: 'not a date' },
  'unknown top-level field': { ...file(), surprise: true },
  'prototype key': JSON.parse(JSON.stringify(file()).replace('"notes":{}', '"notes":{"__proto__":"x"}')),
};
for (const field of ['answers', 'notes', 'review', 'missionSteps']) {
  badFiles[`${field} array`] = { ...file(), [field]: [] };
  badFiles[`${field} null`] = { ...file(), [field]: null };
}
for (const [name, input] of Object.entries(badFiles)) test(`reject import: ${name}`, () => {
  const f = fixture();
  const before = f.data.get(PROGRESS_KEY);
  assert.throws(() => f.make().validateImport(input), { code: 'INVALID_FILE' });
  assert.equal(f.data.get(PROGRESS_KEY), before);
  assert.equal(f.writes, 0);
});

test('valid v1 export round-trips without dropping any saved fields', async () => {
  const f = fixture(); const store = f.make();
  await store.answer(first.id, correct(first), 'lesson', now);
  await store.saveNote(first.id, '<private note> & "text"', '');
  await store.setMissionStep(missions[0].id, 0, true);
  const before = store.read();
  const imported = store.validateImport(file(before));
  const { token } = store.snapshot();
  assert.deepEqual(await store.replace(imported, token), before);
  assert.deepEqual(store.read(), before);
});

test('32 concurrent edits from two stale tabs preserve all completed lessons', async () => {
  const f = fixture(); const a = f.make(); const b = f.make();
  a.read(); b.read();
  await Promise.all(lessons.map((lesson, index) => (index % 2 ? a : b).answer(lesson.id, correct(lesson), 'lesson', now)));
  assert.equal(Object.keys(a.read().completed).length, lessons.length);
  assert.equal(f.writes, lessons.length);
});

test('independent notes and mission steps survive interleaving and unchecking', async () => {
  const f = fixture(); const a = f.make(); const b = f.make(); const id = missions[0].id;
  await Promise.all([a.saveNote(first.id, 'A', ''), b.saveNote(second.id, 'B', ''),
    a.setMissionStep(id, 0, true), b.setMissionStep(id, 1, true)]);
  await a.setMissionStep(id, 0, false);
  assert.deepEqual(a.read().missionSteps[id], [false, true, false]);
  assert.deepEqual(a.read().notes, { [first.id]: 'A', [second.id]: 'B' });
});

test('conflicting note is rejected and both the stored note and caller draft remain intact', async () => {
  const f = fixture(); const a = f.make(); const b = f.make();
  await a.saveNote(first.id, 'remote note', '');
  const draft = 'local draft'; const before = f.data.get(PROGRESS_KEY);
  await assert.rejects(b.saveNote(first.id, draft, ''), { code: 'NOTE_CONFLICT' });
  assert.equal(f.data.get(PROGRESS_KEY), before); assert.equal(draft, 'local draft');
  await b.saveNote(first.id, 'remote note', ''); // An identical retry is harmless.
});

test('import rejects a changed snapshot, including edits made while awaiting its lock', async () => {
  const f = fixture(); const a = f.make(); const b = f.make();
  const { token } = a.snapshot();
  const saved = b.answer(first.id, correct(first), 'lesson', now);
  const replacement = a.replace(emptyState(), token);
  await saved;
  await assert.rejects(replacement, { code: 'IMPORT_CONFLICT' });
  assert.ok(a.read().completed[first.id]);
});

test('old cached progress is not resurrected after replacement or storage removal', async () => {
  const f = fixture(); const a = f.make(); const b = f.make();
  await a.answer(first.id, correct(first), 'lesson', now); b.read();
  await a.replace(emptyState(), a.snapshot().token);
  await b.answer(second.id, correct(second), 'lesson', now);
  assert.equal(a.read().completed[first.id], undefined);
  f.data.delete(PROGRESS_KEY);
  await b.saveNote(second.id, 'new note', '');
  assert.deepEqual(a.read().completed, {});
});

for (const operation of ['answer', 'saveNote', 'setMissionStep', 'replace']) test(`write failure leaves storage unchanged: ${operation}`, async () => {
  const f = fixture(); const store = f.make(); const { token } = store.snapshot();
  f.failWrites();
  const args = { answer: [first.id, correct(first), 'lesson', now], saveNote: [first.id, 'draft', ''],
    setMissionStep: [missions[0].id, 0, true], replace: [emptyState(), token] };
  await assert.rejects(store[operation](...args[operation]), { code: 'STORAGE_FAILED' });
  assert.equal(f.data.get(PROGRESS_KEY), token); assert.equal(f.writes, 0);
});

test('read errors and corrupt storage never become empty-state writes', async () => {
  const f = fixture(); const store = f.make();
  f.data.set(PROGRESS_KEY, '{broken');
  await assert.rejects(store.answer(first.id, correct(first), 'lesson'), { code: 'INVALID_STORED' });
  assert.equal(f.data.get(PROGRESS_KEY), '{broken');
  f.failReads();
  await assert.rejects(store.saveNote(first.id, 'draft', ''), { code: 'STORAGE_FAILED' });
  assert.equal(f.writes, 0);
});

test('no unsafe fallback when Web Locks are missing', async () => {
  const f = fixture(); const store = f.make({ locks: () => undefined });
  await assert.rejects(store.answer(first.id, correct(first), 'lesson'), { code: 'LOCK_UNAVAILABLE' });
  assert.equal(f.writes, 0);
});

test('bounded lock wait aborts without writing', async () => {
  const f = fixture();
  const store = f.make({ lockTimeout: 10, locks: () => ({ request(name, { signal }) {
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  } }) });
  await assert.rejects(store.answer(first.id, correct(first), 'lesson'), { code: 'LOCK_TIMEOUT' });
  assert.equal(f.writes, 0);
});

test('legacy five-map exports and new navigation metadata remain compatible', async () => {
  const f = fixture(); const store = f.make();
  const legacy = file();
  delete legacy.focusModule; delete legacy.currentLessonId; delete legacy.guidedFlow;
  assert.deepEqual(store.validateImport(legacy), emptyState());
  await store.startGuided('listening');
  await store.answer('listening-3', 1, 'guided', now);
  const before = store.read();
  assert.deepEqual(before.guidedFlow, { topic: 'listening', step: 1 });
  assert.deepEqual(store.validateImport(file(before)), before);
  assert.deepEqual(before.completed, {}, 'guided practice does not count as a full lesson');
  await store.answer('listening-1', lessons.find((item) => item.id === 'listening-1').quiz.correct[0], 'practice', now);
  assert.deepEqual(store.read().completed, {}, 'standalone practice does not count as a full lesson');
});

test('navigation writes preserve saved notes and completing a full lesson exits guided flow', async () => {
  const f = fixture(); const a = f.make(); const b = f.make();
  await a.startGuided('needs');
  await b.saveNote(first.id, 'keep', '');
  await a.selectLesson(first.id);
  assert.equal(a.read().notes[first.id], 'keep');
  assert.equal(a.read().guidedFlow, null);
  assert.equal(a.read().currentLessonId, first.id);
  await b.answer(first.id, correct(first), 'lesson', now);
  assert.ok(a.read().completed[first.id]);
});

for (const [field, value] of [
  ['focusModule', 'unknown'], ['currentLessonId', 'unknown'], ['guidedFlow', []],
  ['guidedFlow', { topic: ['listening'], step: 0 }],
  ['guidedFlow', { topic: 'listening', step: 4 }], ['guidedFlow', { topic: '__proto__', step: 0 }],
]) test(`reject invalid navigation field ${field}: ${JSON.stringify(value)}`, () => {
  assert.throws(() => fixture().make().validateImport({ ...file(), [field]: value }), { code: 'INVALID_FILE' });
});

test('stale guided answers cannot change a topic selected in another tab', async () => {
  const f = fixture(); const a = f.make(); const b = f.make();
  await a.startGuided('listening'); await b.startGuided('needs');
  await assert.rejects(a.answer('listening-3', 1, 'guided', now), { code: 'FLOW_CONFLICT' });
  assert.equal(a.read().guidedFlow.topic, 'needs');
});
