import test from 'node:test';
import assert from 'node:assert/strict';
import { metrics, calendarDay, readRoute, prepareImport, backupJSON, MAX_BACKUP_BYTES } from '../model.mjs';
const lessons = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const empty = () => ({ completed: {}, review: {}, notes: {} });
const now = new Date(2026, 8, 29, 12).getTime();

test('unreadable storage does not masquerade as zero progress', () => assert.equal(metrics(null, lessons, now), null));
test('XP is derived from unique completions, not replayed answers', () => {
  const s = empty(); s.completed.a = now; s.answers = { a: 1 };
  assert.equal(metrics(s, lessons, now).xp, 20);
  s.answers.a = 2; assert.equal(metrics(s, lessons, now).xp, 20);
});
test('unrecognised and future completion timestamps do not earn rewards', () => {
  const s = empty(); s.completed = { a: now, b: now + 10000, fake: now };
  assert.equal(metrics(s, lessons, now).count, 1);
});
test('practice-only answers neither complete lessons nor award XP', () => {
  assert.equal(metrics({ ...empty(), answers: { a: 1 } }, lessons, now).xp, 0);
});
test('a day off does not erase lifetime XP', () => {
  const s = empty(); s.completed.a = new Date(2026, 8, 26).getTime();
  const m = metrics(s, lessons, now); assert.equal(m.streak, 0); assert.equal(m.xp, 20);
});
test('series counts local calendar days, at most once per day', () => {
  const s = empty(); s.completed = { a: now, b: now - 1000, c: new Date(2026, 8, 28, 12).getTime() };
  assert.equal(metrics(s, lessons, now).streak, 2); assert.equal(metrics(s, lessons, now).today, 2);
});
test('DST-adjacent calendar dates are consecutive', () => {
  assert.equal(calendarDay(new Date(2026, 2, 30, 12)) - calendarDay(new Date(2026, 2, 29, 12)), 1);
});
test('only completed and due lessons enter review', () => {
  const s = empty(); s.completed.a = now - 1000; s.review = { a: now, b: now - 5000 };
  assert.deepEqual(metrics(s, lessons, now).due.map((l) => l.id), ['a']);
});
test('invalid hashes fall back without interpreting arbitrary input', () => {
  assert.deepEqual(readRoute('#lesson/<script>', lessons), { view: 'path', id: null });
  assert.deepEqual(readRoute('#practice/a', lessons), { view: 'practice', id: 'a' });
});
test('backup preserves all existing fields and uses v1 envelope', () => {
  const state = { ...empty(), notes: { a: 'draft fixture' }, guidedFlow: { topic: 'needs', step: 1 } };
  const output = JSON.parse(backupJSON(state, new Date(now)));
  assert.equal(output.version, 1); assert.deepEqual(output.guidedFlow, state.guidedFlow);
  assert.equal(output.notes.a, 'draft fixture');
});
test('import validates before snapshot and carries compare token', async () => {
  const calls = [];
  const store = { validateImport: (v) => { calls.push('validate'); return v; }, snapshot: (o) => {
    assert.equal(o.allowInvalid, true); calls.push('snapshot'); return { token: 'raw-corrupt' }; } };
  const prepared = await prepareImport({ size: 2, text: async () => '{}' }, store, () => false);
  assert.deepEqual(calls, ['validate', 'snapshot']); assert.equal(prepared.token, 'raw-corrupt');
});
test('malformed file cannot reach snapshot or confirmation', async () => {
  let called = false;
  await assert.rejects(prepareImport({ size: 1, text: async () => '[' }, { snapshot: () => { called = true; } }, () => false));
  assert.equal(called, false);
});
test('oversized backup is rejected before reading', async () => {
  let read = false;
  await assert.rejects(prepareImport({ size: MAX_BACKUP_BYTES + 1, text: async () => { read = true; return '{}'; } }, {}, () => false));
  assert.equal(read, false);
});
test('draft appearing during file read blocks replacement', async () => {
  let pending = false;
  await assert.rejects(prepareImport({ size: 2, text: async () => { pending = true; return '{}'; } }, {
    validateImport: (v) => v, snapshot: () => { throw new Error('must not snapshot'); },
  }, () => pending), { code: 'UNSAVED' });
});
