import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const load = (path) => import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL(path, import.meta.url), 'utf8')).toString('base64')}`);
const { createProgressStore, emptyState, PROGRESS_KEY } = await load('../../dist/progress-store.js');
const { lessons, missions } = await load('../../dist/course.js');
const now = 1790600000000;
const lesson = lessons.find((item) => item.id === 'needs-1');
const correct = lesson.quiz.correct[0];
function fixture(initial = emptyState(), requireLessonStart = true) {
  let token = JSON.stringify(initial); let writes = 0; let rejectWrite = false;
  const storage = { getItem: () => token, setItem(key, value) {
    assert.equal(key, PROGRESS_KEY);
    if (rejectWrite) throw new Error('Synthetic quota rejection');
    writes++; token = value;
  } };
  let tail = Promise.resolve();
  const locks = { request(name, options, callback) {
    assert.equal(name, PROGRESS_KEY);
    const next = tail.then(() => callback());
    tail = next.catch(() => {}); return next;
  } };
  const make = (extra = {}) => createProgressStore({ lessons, missions, storage: () => storage, locks: () => locks, requireLessonStart, ...extra });
  return { make, get token() { return token; }, get writes() { return writes; }, failWrites() { rejectWrite = true; } };
}
for (const [name, nav] of [
  ['no bookmark', {}],
  ['another lesson', { currentLessonId: 'map-1', focusModule: 'map' }],
  ['same id belongs to guided', { currentLessonId: 'needs-1', focusModule: 'needs', guidedFlow: { topic: 'needs', step: 1 } }],
]) test(`started lesson rejects ${name} before any write`, async () => {
  const f = fixture({ ...emptyState(), notes: { 'map-1': 'KEEP' }, ...nav });
  const before = f.token;
  await assert.rejects(f.make().answer(lesson.id, correct, 'lesson', now), { code: 'LESSON_NOT_STARTED' });
  assert.equal(f.token, before); assert.equal(f.writes, 0);
});

test('explicit start permits a restored full lesson and retains every other map', async () => {
  const initial = { ...emptyState(), completed: { 'map-1': 1000 }, answers: { 'map-1': 1 },
    notes: { 'map-1': 'KEEP' }, review: { 'map-1': 2000 }, missionSteps: { 'listen-ten': [true, false, true] } };
  const f = fixture(initial); await f.make().selectLesson(lesson.id);
  // A newly created store reads the existing v1 bookmark, as after a reload/import.
  const store = f.make(); const bookmark = store.validateImport({ ...store.read(), version: 1 });
  assert.equal(bookmark.currentLessonId, lesson.id);
  await store.answer(lesson.id, correct, 'lesson', now);
  assert.deepEqual(store.read(), { ...initial, currentLessonId: lesson.id, focusModule: 'needs',
    completed: { ...initial.completed, [lesson.id]: now }, answers: { ...initial.answers, [lesson.id]: correct },
    review: { ...initial.review, [lesson.id]: now + 86400000 } });
  await store.answer(lesson.id, correct, 'lesson', now + 10);
  assert.equal(store.read().completed[lesson.id], now, 'replay never replaces the first completion');
});

test('eligibility is rechecked from the latest snapshot after acquiring the lock', async () => {
  const initial = { ...emptyState(), currentLessonId: lesson.id, focusModule: 'needs', notes: { 'map-1': 'KEEP' } };
  const f = fixture(initial); const a = f.make(); const b = f.make(); a.read(); b.read();
  const newerGuided = b.startGuided('needs');
  const answer = a.answer(lesson.id, correct, 'lesson', now);
  await newerGuided;
  await assert.rejects(answer, { code: 'LESSON_NOT_STARTED' });
  assert.deepEqual(a.read(), { ...initial, guidedFlow: { topic: 'needs', step: 0 } });
  assert.equal(f.writes, 1, 'only the newer start wrote data');
});

test('practice remains possible without a full-lesson start and never completes it', async () => {
  const f = fixture(); const store = f.make();
  await store.answer(lesson.id, correct, 'practice', now);
  assert.deepEqual(store.read(), { ...emptyState(), answers: { [lesson.id]: correct } });
});

test('the opt-in gate does not change the legacy default API contract', async () => {
  const f = fixture(emptyState(), false); const store = f.make();
  await store.answer(lesson.id, correct, 'lesson', now);
  assert.equal(store.read().completed[lesson.id], now);
});

for (const error of ['STORAGE_FAILED', 'LOCK_UNAVAILABLE']) test(`started lesson still fails closed on ${error}`, async () => {
  const f = fixture({ ...emptyState(), currentLessonId: lesson.id, focusModule: 'needs' });
  const before = f.token;
  if (error === 'STORAGE_FAILED') f.failWrites();
  const store = f.make(error === 'LOCK_UNAVAILABLE' ? { locks: () => undefined } : {});
  await assert.rejects(store.answer(lesson.id, correct, 'lesson', now), { code: error });
  assert.equal(f.token, before); assert.equal(f.writes, 0);
});
