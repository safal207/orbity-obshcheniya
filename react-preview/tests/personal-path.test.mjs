import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersonalStore, PERSONAL_KEY, dailyStatus, personalDay } from '../personal-path.mjs';

const COURSE_KEY = 'orbity-dialoga-progress-v1';
const start = new Date(2026, 9, 10, 12).getTime();
const day = (offset, hour = 12, minute = 0) => new Date(2026, 9, 10 + offset, hour, minute).getTime();
const phrase = 'Please help me with dinner tonight.';
const code = (value) => ({ code: value });
const initial = () => ({ version: 1, revision: 1,
  profile: { address: 'neutral', goal: 'needs', startedAt: start, baseline: null }, sessions: [] });

function serialLocks() {
  let tail = Promise.resolve();
  return { request(name, options, callback) {
    assert.equal(name, PERSONAL_KEY);
    assert.equal(options.mode, 'exclusive');
    const result = tail.then(() => {
      if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return callback({ name });
    });
    tail = result.catch(() => {});
    return result;
  } };
}

function fixture(saved = null) {
  const data = new Map([[COURSE_KEY, '{"completed":{"map-1":1000},"notes":{"map-1":"KEEP"}}']]);
  if (saved !== null) data.set(PERSONAL_KEY, typeof saved === 'string' ? saved : JSON.stringify(saved));
  let clock = start;
  const writes = [];
  const storage = { getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { writes.push(key); data.set(key, value); } };
  const locks = serialLocks();
  const make = (options = {}) => createPersonalStore({ storage, locks, now: () => clock, ...options });
  return { data, writes, storage, locks, make, setNow: (value) => { clock = value; } };
}

test('new profile reads without writing or modifying existing course progress', async () => {
  const f = fixture(); const course = f.data.get(COURSE_KEY); const store = f.make();
  assert.equal(store.read(), null);
  assert.deepEqual(dailyStatus(null, start), { phase: 'new', index: 0, completedCount: 0 });
  assert.equal(f.writes.length, 0);
  const saved = await store.register({ address: 'her', baseline: 2 });
  assert.deepEqual(saved, { ...initial(), profile: { ...initial().profile, address: 'her', baseline: 2 } });
  assert.deepEqual(store.read(), saved);
  assert.equal(f.data.get(COURSE_KEY), course);
  assert.deepEqual(f.writes, [PERSONAL_KEY]);
});

test('registering again or concurrently cannot erase an existing personal path', async () => {
  const f = fixture(); const a = f.make(); const b = f.make();
  const results = await Promise.allSettled([
    a.register({ address: 'her' }), b.register({ address: 'him', baseline: 5 }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'PERSONAL_CONFLICT');
  await a.complete({ index: 0, phrase });
  const before = f.data.get(PERSONAL_KEY);
  await assert.rejects(b.register({ address: 'neutral' }), code('PERSONAL_CONFLICT'));
  assert.equal(f.data.get(PERSONAL_KEY), before);
});

test('completion is persistent, sequential, and limited to one session per local day', async () => {
  const f = fixture(initial()); const store = f.make();
  await assert.rejects(store.complete({ index: 1, phrase }), code('PERSONAL_CONFLICT'));
  const saved = await store.complete({ index: 0, phrase: `  ${phrase}  `, plan: 'After dinner' });
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved.sessions, [{ index: 0, completedAt: start, phrase, plan: 'After dinner', reflection: null }]);
  assert.deepEqual(f.make().read(), saved);
  assert.deepEqual(dailyStatus(saved, start), { phase: 'done-today', index: 0, completedCount: 1 });
  await assert.rejects(store.complete({ index: 0, phrase: 'A replacement that must not be saved.' }), code('PERSONAL_CONFLICT'));
  await assert.rejects(store.complete({ index: 1, phrase }), code('PERSONAL_DONE_TODAY'));
  assert.deepEqual(store.read(), saved);
});

test('calendar midnight unlocks the next session and skipped days do not reset progress', async () => {
  const f = fixture(initial()); const store = f.make();
  f.setNow(day(0, 23, 59)); await store.complete({ index: 0, phrase });
  f.setNow(day(1, 0, 1));
  assert.deepEqual(dailyStatus(store.read(), day(1, 0, 1)), { phase: 'ready', index: 1, completedCount: 1 });
  await store.complete({ index: 1, phrase });
  f.setNow(day(10)); await store.complete({ index: 2, phrase });
  assert.equal(store.read().sessions.length, 3);
  assert.equal(personalDay(day(1, 0, 1)) - personalDay(day(0, 23, 59)), 1);
  assert.equal(personalDay(new Date(2026, 2, 30, 12).getTime()) - personalDay(new Date(2026, 2, 29, 12).getTime()), 1);
});

test('clock rollback cannot unlock an extra session', async () => {
  const f = fixture(initial()); const store = f.make();
  await store.complete({ index: 0, phrase });
  f.setNow(day(-1));
  assert.equal(dailyStatus(store.read(), day(-1)).phase, 'done-today');
  await assert.rejects(store.complete({ index: 1, phrase }), code('PERSONAL_DONE_TODAY'));
  assert.equal(store.read().sessions.length, 1);
});

test('seven sessions finish the week even when there were days off', async () => {
  const f = fixture(initial()); const store = f.make(); const course = f.data.get(COURSE_KEY);
  for (let index = 0; index < 7; index += 1) {
    f.setNow(day(index * 2)); await store.complete({ index, phrase: `${phrase} Session ${index}.` });
  }
  assert.deepEqual(dailyStatus(store.read(), day(12)), { phase: 'week-done', index: 6, completedCount: 7 });
  assert.deepEqual(dailyStatus(store.read(), day(30)), { phase: 'week-done', index: 6, completedCount: 7 });
  assert.equal(f.data.get(COURSE_KEY), course);
  assert.ok(f.writes.every((key) => key === PERSONAL_KEY));
});

test('competing tabs cannot complete the same session twice or skip ahead today', async () => {
  const f = fixture(initial()); const results = await Promise.allSettled([
    f.make().complete({ index: 0, phrase: 'First tab sentence.' }),
    f.make().complete({ index: 0, phrase: 'Second tab sentence.' }),
    f.make().complete({ index: 1, phrase: 'Premature next session.' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.deepEqual(results.filter((r) => r.status === 'rejected').map((r) => r.reason.code),
    ['PERSONAL_CONFLICT', 'PERSONAL_DONE_TODAY']);
  assert.equal(f.make().read().sessions[0].phrase, 'First tab sentence.');
  assert.equal(f.make().read().revision, 2);
});

test('reflection saves without changing the practice, daily gate, or course record', async () => {
  const f = fixture(initial()); const store = f.make(); const course = f.data.get(COURSE_KEY);
  const completed = await store.complete({ index: 0, phrase, plan: 'Talk tomorrow.' });
  const reflected = await store.reflect({ index: 0, outcome: 'no-chance', note: 'A calm opportunity has not come up.',
    expectedRevision: completed.revision });
  assert.equal(reflected.revision, 3);
  assert.deepEqual(reflected.sessions[0], { ...completed.sessions[0],
    reflection: { outcome: 'no-chance', note: 'A calm opportunity has not come up.' } });
  assert.equal(dailyStatus(reflected, start).phase, 'done-today');
  f.setNow(day(1)); const next = await store.complete({ index: 1, phrase });
  assert.deepEqual(next.sessions[0], reflected.sessions[0]);
  assert.equal(f.data.get(COURSE_KEY), course);
});

test('stale reflections cannot overwrite a newer reflection', async () => {
  const f = fixture(initial()); const store = f.make();
  const snapshot = await store.complete({ index: 0, phrase });
  const first = await store.reflect({ index: 0, outcome: 'tried', note: 'It helped.', expectedRevision: snapshot.revision });
  await assert.rejects(f.make().reflect({ index: 0, outcome: 'difficult', note: 'Stale tab edit',
    expectedRevision: snapshot.revision }), code('PERSONAL_CONFLICT'));
  assert.deepEqual(store.read(), first);
  const second = await store.reflect({ index: 0, outcome: 'tried', note: 'Updated with the latest form.',
    expectedRevision: first.revision });
  assert.equal(second.sessions[0].reflection.note, 'Updated with the latest form.');
});

test('profile changes merge existing sessions, and invalidate a stale reflection form safely', async () => {
  const f = fixture(initial()); const a = f.make(); const b = f.make();
  const completed = await a.complete({ index: 0, phrase });
  const latest = await b.updateAddress('him');
  assert.deepEqual(latest.sessions, completed.sessions);
  assert.equal(latest.profile.address, 'him');
  await assert.rejects(a.reflect({ index: 0, outcome: 'tried', expectedRevision: completed.revision }),
    code('PERSONAL_CONFLICT'));
  assert.deepEqual(a.read(), latest);
});

test('Firefox task-checkpoint publication preserves writes queued in a different tab', async () => {
  let published = JSON.stringify(initial());
  const locks = serialLocks(); const checkpoints = [];
  function tab() {
    let localWrite;
    return createPersonalStore({ now: () => start, locks, storage: {
      getItem(key) { assert.equal(key, PERSONAL_KEY); return localWrite ?? published; },
      setItem(key, value) {
        assert.equal(key, PERSONAL_KEY); localWrite = value;
        checkpoints.push(new Promise((resolve) => setTimeout(() => {
          published = value; localWrite = undefined; resolve();
        }, 0)));
      },
    } });
  }
  const a = tab(); const b = tab(); a.read(); b.read();
  await Promise.all([a.complete({ index: 0, phrase }), b.updateAddress('her')]);
  await Promise.all(checkpoints);
  const saved = JSON.parse(published);
  assert.equal(saved.profile.address, 'her'); assert.equal(saved.sessions[0].phrase, phrase);
  assert.equal(saved.revision, 3); assert.deepEqual(a.read(), saved); assert.deepEqual(b.read(), saved);
});

const malformed = [
  ['invalid JSON', '{'], ['JSON null', 'null'], ['array root', []], ['unknown root fields', { ...initial(), password: 'no' }],
  ['wrong version', { ...initial(), version: 2 }], ['fractional revision', { ...initial(), revision: 1.5 }],
  ['zero revision', { ...initial(), revision: 0 }], ['unknown profile fields', { ...initial(), profile: { ...initial().profile, extra: true } }],
  ['invalid address', { ...initial(), profile: { ...initial().profile, address: 'unknown' } }],
  ['invalid goal', { ...initial(), profile: { ...initial().profile, goal: 'other' } }],
  ['invalid baseline', { ...initial(), profile: { ...initial().profile, baseline: 6 } }],
  ['string timestamp', { ...initial(), profile: { ...initial().profile, startedAt: String(start) } }],
  ['invalid timestamp', { ...initial(), profile: { ...initial().profile, startedAt: 9e15 } }],
  ['missing sessions', { version: 1, revision: 1, profile: initial().profile }],
  ['non-array sessions', { ...initial(), sessions: {} }],
  ['oversized JSON', ' '.repeat(256 * 1024 + 1)],
];
const validSession = { index: 0, completedAt: start, phrase, plan: '', reflection: null };
for (const [name, change] of [
  ['out-of-order index', { index: 1 }], ['missing text', { phrase: undefined }], ['short phrase', { phrase: '  hi  ' }],
  ['oversized phrase', { phrase: 'a'.repeat(2001) }], ['invalid plan', { plan: null }],
  ['oversized plan', { plan: 'a'.repeat(501) }], ['pre-registration date', { completedAt: day(-1) }],
  ['invalid session date', { completedAt: -1 }], ['unknown session field', { extra: true }],
  ['invalid reflection type', { reflection: [] }], ['unknown outcome', { reflection: { outcome: 'yes', note: '' } }],
  ['oversized reflection', { reflection: { outcome: 'tried', note: 'a'.repeat(1001) } }],
  ['missing reflection note', { reflection: { outcome: 'tried' } }],
]) malformed.push([name, { ...initial(), sessions: [{ ...validSession, ...change }] }]);
malformed.push(['duplicate session', { ...initial(), sessions: [validSession, validSession] }]);
malformed.push(['non-increasing timestamps', { ...initial(), sessions: [validSession, { ...validSession, index: 1 }] }]);
malformed.push(['too many sessions', { ...initial(), sessions: Array.from({ length: 8 }, (_, index) =>
  ({ ...validSession, index, completedAt: day(index) })) }]);

for (const [name, raw] of malformed) test(`invalid stored ${name} fails closed without erasing bytes`, async () => {
  const f = fixture(raw); const store = f.make(); const before = f.data.get(PERSONAL_KEY);
  assert.throws(() => store.read(), code('PERSONAL_INVALID_STORED'));
  await assert.rejects(store.register({ address: 'her' }), code('PERSONAL_INVALID_STORED'));
  await assert.rejects(store.complete({ index: 0, phrase }), code('PERSONAL_INVALID_STORED'));
  assert.equal(f.data.get(PERSONAL_KEY), before); assert.equal(f.writes.length, 0);
});

test('malformed operation input never writes or silently truncates user text', async () => {
  const f = fixture(initial()); const store = f.make(); const before = f.data.get(PERSONAL_KEY);
  for (const operation of [
    () => store.register(null), () => store.complete(null), () => store.reflect(null),
    () => store.register([]), () => store.complete(0), () => store.reflect('invalid'),
    () => store.register({ address: 'other' }), () => store.register({ address: 'her', baseline: '3' }),
    () => store.complete({ index: 0, phrase: 'short' }), () => store.complete({ index: 0, phrase: ' '.repeat(12) }),
    () => store.complete({ index: 0, phrase: 'x'.repeat(2001) }),
    () => store.complete({ index: 0, phrase, plan: 'x'.repeat(501) }),
    () => store.complete({ index: -1, phrase }), () => store.complete({ index: 7, phrase }),
    () => store.complete({ index: '0', phrase }), () => store.updateAddress('other'),
    () => store.reflect({ index: 0, outcome: 'tried' }),
    () => store.reflect({ index: 0, outcome: 'other', expectedRevision: 1 }),
    () => store.reflect({ index: 0, outcome: 'tried', note: 'x'.repeat(1001), expectedRevision: 1 }),
  ]) await assert.rejects(operation(), code('PERSONAL_INVALID_INPUT'));
  assert.equal(f.data.get(PERSONAL_KEY), before); assert.equal(f.writes.length, 0);
});

test('unregistered operations cannot manufacture a profile', async () => {
  const f = fixture(); const store = f.make();
  await assert.rejects(store.complete({ index: 0, phrase }), code('PERSONAL_NOT_REGISTERED'));
  await assert.rejects(store.reflect({ index: 0, outcome: 'tried', expectedRevision: 1 }), code('PERSONAL_NOT_REGISTERED'));
  await assert.rejects(store.updateAddress('her'), code('PERSONAL_NOT_REGISTERED'));
  assert.equal(store.read(), null); assert.equal(f.writes.length, 0);
});

test('denied storage and unavailable locks expose stable errors without writes', async () => {
  const f = fixture(initial()); const before = f.data.get(PERSONAL_KEY);
  const deniedRead = f.make({ storage: { getItem() { throw new DOMException('Denied', 'SecurityError'); }, setItem() {} } });
  assert.throws(() => deniedRead.read(), code('PERSONAL_STORAGE_FAILED'));
  await assert.rejects(deniedRead.updateAddress('her'), code('PERSONAL_STORAGE_FAILED'));
  const deniedWrite = f.make({ storage: { getItem: f.storage.getItem, setItem() { throw new Error('Quota'); } } });
  await assert.rejects(deniedWrite.complete({ index: 0, phrase }), code('PERSONAL_STORAGE_FAILED'));
  const ignoredWrite = f.make({ storage: { getItem: f.storage.getItem, setItem() {} } });
  await assert.rejects(ignoredWrite.complete({ index: 0, phrase }), code('PERSONAL_STORAGE_FAILED'));
  await assert.rejects(f.make({ locks: null }).complete({ index: 0, phrase }), code('PERSONAL_LOCK_UNAVAILABLE'));
  assert.equal(f.data.get(PERSONAL_KEY), before); assert.equal(f.writes.length, 0);
});

test('a blocked browser storage getter does not crash store construction', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true,
    get() { throw new DOMException('Access denied', 'SecurityError'); } });
  try {
    const store = createPersonalStore({ locks: serialLocks(), now: () => start });
    assert.throws(() => store.read(), code('PERSONAL_STORAGE_FAILED'));
    await assert.rejects(store.register({ address: 'her' }), code('PERSONAL_STORAGE_FAILED'));
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('a blocked lock times out after five seconds and leaves saved state unchanged', async () => {
  const f = fixture(initial()); const before = f.data.get(PERSONAL_KEY);
  const locks = { request(name, { signal }) {
    return new Promise((resolve, reject) => signal.addEventListener('abort', () =>
      reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  } };
  await assert.rejects(f.make({ locks }).complete({ index: 0, phrase }), code('PERSONAL_LOCK_TIMEOUT'));
  assert.equal(f.data.get(PERSONAL_KEY), before); assert.equal(f.writes.length, 0);
});

test('invalid clocks and exhausted revisions do not overwrite saved data', async () => {
  const f = fixture(initial()); const before = f.data.get(PERSONAL_KEY);
  await assert.rejects(f.make({ now: () => NaN }).complete({ index: 0, phrase }), code('PERSONAL_INVALID_INPUT'));
  await assert.rejects(f.make({ now: () => day(-1) }).complete({ index: 0, phrase }), code('PERSONAL_CONFLICT'));
  assert.equal(f.data.get(PERSONAL_KEY), before);
  const exhausted = fixture({ ...initial(), revision: Number.MAX_SAFE_INTEGER });
  await assert.rejects(exhausted.make().updateAddress('her'), code('PERSONAL_CONFLICT'));
  assert.equal(exhausted.writes.length, 0);
});

test('returned snapshots cannot mutate the persisted profile or completed sessions', async () => {
  const f = fixture(initial()); const store = f.make();
  const result = await store.complete({ index: 0, phrase });
  result.profile.address = 'her'; result.sessions[0].phrase = 'Changed only in caller memory.';
  const read = store.read(); read.sessions.length = 0;
  assert.equal(store.read().profile.address, 'neutral'); assert.equal(store.read().sessions[0].phrase, phrase);
});
