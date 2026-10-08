import test from 'node:test';
import assert from 'node:assert/strict';
import { HAPTICS_KEY, readHaptics, setHapticsEnabled, syncHaptics, testHaptics, vibrateOnSavedProgress } from '../haptics.mjs';

function mockRoot(reduced = false) {
  const data = new Map();
  const pulses = [], writes = [];
  const root = {
    document: { hidden: false },
    matchMedia: () => ({ matches: reduced }),
    localStorage: {
      getItem: (key) => data.has(key) ? data.get(key) : null,
      setItem(key, value) { writes.push([key, value]); data.set(key, value); },
    },
    navigator: {
      userActivation: { hasBeenActive: true },
      vibrate(pattern) { pulses.push(pattern); return true; },
    },
  };
  return { root, data, pulses, writes };
}

test('defaults respect motion preference and only explicit saved feedback pulses', () => {
  const { root, pulses, writes } = mockRoot();
  assert.equal(readHaptics(root).mode, 'auto');
  assert.equal(vibrateOnSavedProgress('step', root), true);
  assert.equal(vibrateOnSavedProgress('milestone', root), true);
  assert.deepEqual(pulses, [18, [28, 40, 36]]);
  assert.deepEqual(writes, []);
  const quiet = mockRoot(true);
  assert.equal(vibrateOnSavedProgress('step', quiet.root), false);
  assert.deepEqual(quiet.pulses, []);
});

test('explicit on overrides reduced motion; explicit off remains off', () => {
  const { root, data, pulses } = mockRoot(true);
  assert.equal(setHapticsEnabled(true, root).enabled, true);
  assert.equal(data.get(HAPTICS_KEY), 'on');
  assert.equal(vibrateOnSavedProgress('step', root), true);
  assert.deepEqual(pulses, [18]);
  assert.equal(setHapticsEnabled(false, root).enabled, false);
  assert.equal(data.get(HAPTICS_KEY), 'off');
  root.matchMedia = () => ({ matches: false });
  assert.equal(vibrateOnSavedProgress('step', root), false);
  assert.deepEqual(pulses, [18, 0]); // Turning off also cancels any active pulse.
});

test('test request is bounded and never claims physical vibration was confirmed', () => {
  const { root, pulses, writes } = mockRoot();
  assert.equal(testHaptics(root), 'requested');
  assert.deepEqual(pulses, [120]);
  assert.deepEqual(writes, []);
});

test('diagnostics distinguish off, missing API, rejection and exception', () => {
  const { root, data } = mockRoot();
  data.set(HAPTICS_KEY, 'off');
  assert.equal(testHaptics(root), 'off');
  data.set(HAPTICS_KEY, 'on');
  delete root.navigator.vibrate;
  assert.equal(testHaptics(root), 'unsupported');
  root.navigator.vibrate = () => false;
  assert.equal(testHaptics(root), 'blocked');
  root.navigator.vibrate = () => { throw new Error('blocked by host'); };
  assert.equal(testHaptics(root), 'error');
  assert.equal(vibrateOnSavedProgress('milestone', root), false);
});

test('hidden tabs and missing activation never pulse even with explicit on', () => {
  const { root, data, pulses } = mockRoot();
  data.set(HAPTICS_KEY, 'on');
  root.document.hidden = true;
  assert.equal(testHaptics(root), 'hidden');
  root.document.hidden = false;
  root.navigator.userActivation.hasBeenActive = false;
  assert.equal(testHaptics(root), 'gesture');
  assert.deepEqual(pulses, []);
});

test('progress bytes are untouched by setting, cancellation or test', () => {
  const { root, data, writes } = mockRoot();
  const key = 'orbity-dialoga-progress-v1';
  const bytes = '{"notes":{"map-1":"KEEP · сохранить"},"completed":{"map-1":1000}}';
  data.set(key, bytes);
  setHapticsEnabled(false, root);
  setHapticsEnabled(true, root);
  testHaptics(root);
  assert.equal(data.get(key), bytes);
  assert.deepEqual(writes, [[HAPTICS_KEY, 'off'], [HAPTICS_KEY, 'on']]);
});

test('failed preference writes give a truthful session-only choice', () => {
  const { root, data, pulses } = mockRoot(true);
  data.set(HAPTICS_KEY, 'off');
  const originalSet = root.localStorage.setItem;
  root.localStorage.setItem = () => { throw new Error('quota'); };
  const state = setHapticsEnabled(true, root);
  assert.equal(state.storage, 'session');
  assert.equal(state.enabled, true);
  assert.equal(data.get(HAPTICS_KEY), 'off');
  assert.equal(testHaptics(root), 'requested');
  assert.deepEqual(pulses, [120]);
  root.localStorage.setItem = originalSet;
  assert.equal(setHapticsEnabled(true, root).storage, 'ok');
  assert.equal(data.get(HAPTICS_KEY), 'on');
});

test('read-after-write failure never reports a persisted preference', () => {
  const { root, data } = mockRoot();
  root.localStorage.getItem = () => { throw new Error('read denied'); };
  const result = setHapticsEnabled(true, root);
  assert.equal(result.storage, 'session');
  assert.equal(result.enabled, true);
  assert.equal(data.get(HAPTICS_KEY), 'on'); // Actual commit may still have succeeded.
});

test('unreadable or invalid preference fails closed without deleting anything', () => {
  const { root, data, writes } = mockRoot();
  data.set(HAPTICS_KEY, 'unexpected');
  assert.equal(readHaptics(root).storage, 'invalid');
  assert.equal(testHaptics(root), 'off');
  assert.equal(data.get(HAPTICS_KEY), 'unexpected');
  root.localStorage.getItem = () => { throw new Error('read blocked'); };
  assert.equal(readHaptics(root).storage, 'unavailable');
  assert.equal(vibrateOnSavedProgress('step', root), false);
  assert.deepEqual(writes, []);
});

test('blocked localStorage property still allows an explicit session choice', () => {
  const { root } = mockRoot();
  Object.defineProperty(root, 'localStorage', { get() { throw new Error('SecurityError'); } });
  assert.equal(readHaptics(root).enabled, false);
  assert.equal(setHapticsEnabled(true, root).storage, 'session');
  assert.equal(testHaptics(root), 'requested');
});

test('matching storage events clear fallback and honor another tab without pulses', () => {
  const { root, data, pulses } = mockRoot();
  const originalSet = root.localStorage.setItem;
  root.localStorage.setItem = () => { throw new Error('quota'); };
  setHapticsEnabled(true, root);
  root.localStorage.setItem = originalSet;
  data.set(HAPTICS_KEY, 'off');
  assert.equal(syncHaptics({ key: HAPTICS_KEY, storageArea: root.localStorage }, root), true);
  assert.equal(readHaptics(root).enabled, false);
  assert.deepEqual(pulses, []);
});

test('irrelevant storage events do not discard the current setting', () => {
  const { root, pulses } = mockRoot();
  root.localStorage.setItem = () => { throw new Error('quota'); };
  setHapticsEnabled(true, root);
  assert.equal(syncHaptics({ key: 'orbity-dialoga-progress-v1' }, root), false);
  assert.equal(syncHaptics({ key: HAPTICS_KEY, storageArea: {} }, root), false);
  assert.equal(readHaptics(root).storage, 'session');
  assert.deepEqual(pulses, []);
});

test('unknown motion setting stays quiet automatically but allows explicit on', () => {
  const { root } = mockRoot();
  root.matchMedia = () => { throw new Error('blocked'); };
  assert.equal(readHaptics(root).enabled, false);
  setHapticsEnabled(true, root);
  assert.equal(testHaptics(root), 'requested');
});

test('invalid setter input does not write', () => {
  const { root, writes } = mockRoot();
  assert.throws(() => setHapticsEnabled('true', root), TypeError);
  assert.deepEqual(writes, []);
});
