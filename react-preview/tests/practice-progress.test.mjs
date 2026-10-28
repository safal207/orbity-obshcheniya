import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceProgress, learningFocus } from '../practice-progress.mjs';

const now = new Date(2026, 9, 28, 12).getTime();
const state = (outcomes, age = 0) => ({ version: 1, revision: 12,
  profile: { address: 'neutral', goal: 'needs', startedAt: now - 10 * 86400000, baseline: null },
  sessions: outcomes.map((outcome, index) => ({ index, completedAt: now - (outcomes.length - index - 1 + age) * 86400000,
    phrase: `Saved personal phrase ${index}`, plan: '', reflection: outcome ? { outcome, note: '' } : null })) });

test('new visitors have a useful first step and no invented achievement', () => {
  const result = practiceProgress(null, now);
  assert.equal(result.action, 'start'); assert.equal(result.last, null);
  assert.deepEqual(result.outcomes, { tried: 0, difficult: 0, 'no-chance': 0, unrecorded: 0 });
});

test('difficult, no chance and missing reflections do not turn into successful attempts', () => {
  const result = practiceProgress(state(['tried', 'difficult', 'no-chance', null]), now);
  assert.deepEqual(result.outcomes, { tried: 1, difficult: 1, 'no-chance': 1, unrecorded: 1 });
  assert.equal(result.action, 'reflect');
});

test('the latest self-reported experience changes the recommended action', () => {
  for (const [outcome, action] of [['difficult', 'rehearse'], ['no-chance', 'prepare'], ['tried', 'apply']]) {
    assert.equal(practiceProgress(state([outcome]), now).action, action);
  }
  assert.equal(practiceProgress(state(['tried'], 2), now).action, 'continue');
});

test('a completed week offers practice without resetting sessions or manufacturing a score', () => {
  const saved = state(Array(7).fill('tried')); const before = JSON.stringify(saved);
  const result = practiceProgress(saved, now);
  assert.equal(result.status.phase, 'week-done'); assert.equal(result.action, 'apply');
  assert.equal(result.first.phrase, saved.sessions[0].phrase);
  assert.equal(result.last.phrase, saved.sessions[6].phrase);
  assert.equal(JSON.stringify(saved), before);
});

test('saved topic is reused while unknown topic and first visits do not invent personalization', () => {
  const modules = [{ id: 'listening', title: 'Listening' }, { id: 'conflict', title: 'Conflict' }];
  assert.equal(learningFocus(null, modules), null);
  assert.equal(learningFocus({ focusModule: '__proto__' }, modules), null);
  assert.equal(learningFocus({ focusModule: 'conflict', guidedFlow: { topic: 'listening' } }, modules, 'en').route, 'module/conflict');
  assert.match(learningFocus({ focusModule: 'conflict' }, modules).reason, /После паузы/);
});
