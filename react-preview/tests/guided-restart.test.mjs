import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Import exact checked-in ESM bytes without changing legacy package boundaries.
const load = async (path) => import(`data:text/javascript;base64,${Buffer.from(readFileSync(new URL(path, import.meta.url), 'utf8')).toString('base64')}`);
const { createProgressStore, emptyState, PROGRESS_KEY } = await load('../../dist/progress-store.js');
const { lessons, missions } = await load('../../dist/course.js');

// Serialized lock double: real cross-tab Web Locks are covered in Chromium and Firefox.
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

// Explicitly selecting a completed introduction restarts it; unfinished work resumes.
for (const [topic, firstId] of [['listening', 'listening-3'], ['conflict', 'conflict-1'], ['needs', 'needs-1']]) {
  test(`guided restart preserves all saved maps and resumes unfinished steps: ${topic}`, async () => {
    for (const step of [0, 1, 2, 3]) {
      const initial = { ...emptyState(), completed: { [first.id]: now }, answers: { [first.id]: correct(first) },
        notes: { [first.id]: 'KEEP' }, review: { [first.id]: now + 86400000 },
        missionSteps: { [missions[0].id]: [true, false, true] }, focusModule: topic,
        currentLessonId: firstId, guidedFlow: { topic, step } };
      const f = fixture(initial); const store = f.make();
      const expected = { ...initial, guidedFlow: { topic, step: step === 3 ? 0 : step } };
      assert.deepEqual(await store.startGuided(topic), expected);
      assert.equal(f.data.get(PROGRESS_KEY), JSON.stringify(expected));
      assert.equal(f.writes, 1);
      assert.deepEqual(store.validateImport(file(store.read())), expected);
    }
  });
}

test('guided restart uses the configured sequence length, not a hard-coded three', async () => {
  const initial = { ...emptyState(), focusModule: 'needs', currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step: 2 } };
  const f = fixture(initial);
  const store = f.make({ guided: { needs: ['needs-1', 'needs-2'] } });
  assert.deepEqual(await store.startGuided('needs'), { ...initial, guidedFlow: { topic: 'needs', step: 0 } });
});

test('queued guided restart preserves the latest independent notes and mission edits', async () => {
  const initial = { ...emptyState(), focusModule: 'needs', currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step: 3 } };
  const f = fixture(initial); const a = f.make(); const b = f.make(); a.read(); b.read();
  await Promise.all([b.saveNote(first.id, 'new note', ''), b.setMissionStep(missions[0].id, 1, true), a.startGuided('needs')]);
  assert.deepEqual(a.read(), { ...initial, notes: { [first.id]: 'new note' },
    missionSteps: { [missions[0].id]: [false, true, false] }, guidedFlow: { topic: 'needs', step: 0 } });
});

test('queued guided restart preserves a note published at the writing tab\'s task checkpoint', async () => {
  const initial = { ...emptyState(), notes: { [first.id]: 'KEEP' }, focusModule: 'needs',
    currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step: 3 } };
  let published = JSON.stringify(initial);
  const checkpoints = [];
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
  function tab() {
    let localWrite;
    const storage = {
      getItem(key) {
        assert.equal(key, PROGRESS_KEY);
        return localWrite ?? published;
      },
      setItem(key, value) {
        assert.equal(key, PROGRESS_KEY);
        // The writer reads its own value immediately. Other tabs see it after
        // the task ends, as with Firefox's localStorage snapshot checkpoint.
        localWrite = value;
        checkpoints.push(new Promise((resolve) => setTimeout(() => {
          published = value;
          localWrite = undefined;
          resolve();
        }, 0)));
      },
    };
    return createProgressStore({ lessons, missions, storage: () => storage, locks: () => locks });
  }
  const a = tab(); const b = tab(); a.read(); b.read();
  await Promise.all([b.saveNote(second.id, 'Queued note from other tab', ''), a.startGuided('needs')]);
  await Promise.all(checkpoints);
  const expected = { ...initial, notes: { ...initial.notes, [second.id]: 'Queued note from other tab' },
    guidedFlow: { topic: 'needs', step: 0 } };
  assert.deepEqual(JSON.parse(published), expected);
  assert.deepEqual(a.read(), expected);
  assert.deepEqual(b.read(), expected);
});

for (const error of ['STORAGE_FAILED', 'LOCK_UNAVAILABLE']) test(`guided restart retains completion on ${error}`, async () => {
  const initial = { ...emptyState(), focusModule: 'needs', currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step: 3 } };
  const f = fixture(initial); const before = f.data.get(PROGRESS_KEY);
  if (error === 'STORAGE_FAILED') f.failWrites();
  const store = f.make(error === 'LOCK_UNAVAILABLE' ? { locks: () => undefined } : {});
  await assert.rejects(store.startGuided('needs'), { code: error });
  assert.equal(f.data.get(PROGRESS_KEY), before); assert.equal(f.writes, 0);
});
