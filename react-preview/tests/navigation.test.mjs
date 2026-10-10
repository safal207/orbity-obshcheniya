import test from 'node:test';
import assert from 'node:assert/strict';
import { GUIDED, learningRoute, nextLesson, resumeTarget, answerGuided } from '../navigation.mjs';
const lessons = ['map-1', 'map-2', ...Object.values(GUIDED).flat()].map((id) => ({ id, moduleId: id.split('-')[0], quiz: { choices: ['no', 'yes'], correct: [1] } }));
const missions = [{ id: 'check-in' }];
const empty = () => ({ completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {}, focusModule: null, currentLessonId: null, guidedFlow: null });
// This fake models token-CAS only; real Web Locks are tested in Chromium.
function harness(initial) {
  let state = structuredClone(initial), writes = 0;
  const store = {
    snapshot: () => ({ state: structuredClone(state), token: JSON.stringify(state) }),
    async replace(next, token) {
      if (token !== JSON.stringify(state)) throw Object.assign(new Error(), { code: 'IMPORT_CONFLICT' });
      state = structuredClone(next); writes++; return state;
    },
  };
  return { store, get state() { return state; }, get writes() { return writes; }, mutate: (edit) => edit(state) };
}
test('lesson URL preserves only a valid screen; practice remains independent', () => {
  assert.deepEqual(learningRoute('#lesson/map-1/2', lessons), { view: 'lesson', id: 'map-1', step: 2 });
  for (const step of ['-1', '3', '02', 'NaN', '']) assert.equal(learningRoute(`#lesson/map-1/${step}`, lessons).step, 0);
  assert.deepEqual(learningRoute('#practice/map-1', lessons), { view: 'practice', id: 'map-1' });
  assert.deepEqual(learningRoute('#lesson/missing/2', lessons), { view: 'path', id: null });
});
test('legacy section links resolve to equivalent React destinations without progress claims', () => {
  assert.deepEqual(learningRoute('#today', lessons), { view: 'today', id: null });
  assert.deepEqual(learningRoute('#review', lessons), { view: 'review', id: null });
  assert.deepEqual(learningRoute('#practice', lessons), { view: 'review', id: null });
  assert.deepEqual(learningRoute('#about', lessons), { view: 'about', id: null });
  assert.deepEqual(learningRoute('#mission/check-in', lessons, missions), { view: 'mission', id: null, missionId: 'check-in' });
  assert.deepEqual(learningRoute('#mission/missing', lessons, missions), { view: 'missions', id: null });
  assert.deepEqual(learningRoute('#module/needs', lessons), { view: 'path', id: null, moduleId: 'needs' });
  assert.deepEqual(learningRoute('#module/missing', lessons), { view: 'path', id: null });
});

test('legacy guided URLs cannot select an unearned question', () => {
  for (const hash of ['#guided/0', '#guided/1', '#guided/2', '#guided-done']) assert.deepEqual(learningRoute(hash, lessons), { view: 'guided', id: null, topic: null });
  assert.equal(learningRoute('#guided/unknown', lessons).view, 'path');
});
test('saved incomplete lesson wins over the first module', () => {
  const state = { ...empty(), currentLessonId: 'needs-2', focusModule: 'needs' };
  assert.equal(nextLesson(state, lessons).id, 'needs-2');
  assert.equal(resumeTarget(state, lessons), 'lesson/needs-2');
});
test('completed bookmark advances within topic then across the course', () => {
  const state = { ...empty(), currentLessonId: 'map-1', completed: { 'map-1': 1 } };
  assert.equal(nextLesson(state, lessons).id, 'map-2');
  state.completed['map-2'] = 2;
  assert.equal(nextLesson(state, lessons).id, 'listening-3');
});
test('focus-only and old five-map backups choose a real next lesson', () => {
  assert.equal(nextLesson({ ...empty(), focusModule: 'needs' }, lessons).id, 'needs-1');
  const { focusModule, currentLessonId, guidedFlow, ...legacy } = empty();
  assert.equal(resumeTarget(legacy, lessons), 'lesson/map-1');
});
test('unreadable data is not a new account; all-complete has no false next lesson', () => {
  assert.equal(resumeTarget(null, lessons), null);
  const state = { ...empty(), completed: Object.fromEntries(lessons.map((l) => [l.id, 1])) };
  assert.equal(nextLesson(state, lessons), null); assert.equal(resumeTarget(state, lessons), 'progress');
});
test('unfinished and finished guided flow both resume before full lessons', () => {
  for (const step of [0, 1, 2, 3]) assert.equal(resumeTarget({ ...empty(), guidedFlow: { topic: 'needs', step } }, lessons), 'guided/needs');
});
test('guided commit changes only its cursor, not completion, XP inputs or notes', async () => {
  const initial = { ...empty(), completed: { 'map-1': 1 }, notes: { 'map-2': 'KEEP' }, answers: { 'map-1': 1 }, review: { 'map-1': 123 }, missionSteps: { synthetic: [true, false] }, focusModule: 'listening', currentLessonId: 'listening-3', guidedFlow: { topic: 'listening', step: 0 } };
  const h = harness(initial);
  await answerGuided(h.store, lessons, 'listening', 0, 1);
  assert.deepEqual(h.state, { ...initial, guidedFlow: { topic: 'listening', step: 1 } }); assert.equal(h.writes, 1);
});
test('incorrect answer never enters the transaction', async () => {
  const h = harness({ ...empty(), guidedFlow: { topic: 'needs', step: 0 } });
  await assert.rejects(answerGuided(h.store, lessons, 'needs', 0, 0), { code: 'INVALID_EDIT' }); assert.equal(h.writes, 0);
});
test('stale topic and skipped step fail before writing', async () => {
  const h = harness({ ...empty(), guidedFlow: { topic: 'needs', step: 0 } });
  await assert.rejects(answerGuided(h.store, lessons, 'listening', 0, 1), { code: 'FLOW_CONFLICT' });
  await assert.rejects(answerGuided(h.store, lessons, 'needs', 1, 1), { code: 'FLOW_CONFLICT' }); assert.equal(h.writes, 0);
});
test('replaying the same accepted step cannot skip the next question', async () => {
  const h = harness({ ...empty(), guidedFlow: { topic: 'needs', step: 0 } });
  await answerGuided(h.store, lessons, 'needs', 0, 1);
  await assert.rejects(answerGuided(h.store, lessons, 'needs', 0, 1), { code: 'FLOW_CONFLICT' });
  assert.equal(h.state.guidedFlow.step, 1); assert.equal(h.writes, 1);
});
test('a concurrent note invalidates CAS and is never overwritten', async () => {
  const h = harness({ ...empty(), guidedFlow: { topic: 'needs', step: 0 } });
  const replace = h.store.replace;
  h.store.replace = (next, token) => { h.mutate((s) => { s.notes['map-1'] = 'OTHER TAB'; }); return replace(next, token); };
  await assert.rejects(answerGuided(h.store, lessons, 'needs', 0, 1), { code: 'FLOW_CONFLICT' });
  assert.equal(h.state.notes['map-1'], 'OTHER TAB'); assert.equal(h.state.guidedFlow.step, 0); assert.equal(h.writes, 0);
});
test('storage failure does not advance guided cursor', async () => {
  const h = harness({ ...empty(), guidedFlow: { topic: 'needs', step: 0 } });
  h.store.replace = async () => { throw Object.assign(new Error(), { code: 'STORAGE_FAILED' }); };
  await assert.rejects(answerGuided(h.store, lessons, 'needs', 0, 1), { code: 'STORAGE_FAILED' });
  assert.equal(h.state.guidedFlow.step, 0); assert.equal(h.writes, 0);
});
test('malformed topic, step and choice fail closed', async () => {
  for (const [topic, step, choice] of [['__proto__', 0, 1], ['needs', -1, 1], ['needs', 3, 1], ['needs', 0, 4]]) {
    await assert.rejects(answerGuided({}, lessons, topic, step, choice), { code: 'INVALID_EDIT' });
  }
});
