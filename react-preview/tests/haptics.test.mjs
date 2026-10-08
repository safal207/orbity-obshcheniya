import test from 'node:test';
import assert from 'node:assert/strict';
import { vibrateOnSavedProgress } from '../haptics.mjs';

function mockRoot() {
  const pulses = [];
  const root = {
    document: { hidden: false },
    matchMedia: () => ({ matches: false }),
    navigator: {
      userActivation: { hasBeenActive: true },
      vibrate(pattern) { pulses.push(pattern); return true; },
    },
  };
  return { root, pulses };
}

test('a saved step gives one light pulse; a milestone gives a short double pulse', () => {
  const { root, pulses } = mockRoot();
  assert.equal(vibrateOnSavedProgress('step', root), true);
  assert.equal(vibrateOnSavedProgress('milestone', root), true);
  assert.deepEqual(pulses, [18, [28, 40, 36]]);
});

test('no pulse with reduced motion, a hidden tab or no user activation', () => {
  const { root, pulses } = mockRoot();
  root.matchMedia = () => ({ matches: true });
  assert.equal(vibrateOnSavedProgress('step', root), false);
  root.matchMedia = () => ({ matches: false });
  root.document.hidden = true;
  assert.equal(vibrateOnSavedProgress('milestone', root), false);
  root.document.hidden = false;
  root.navigator.userActivation.hasBeenActive = false;
  assert.equal(vibrateOnSavedProgress('step', root), false);
  assert.deepEqual(pulses, []);
});

test('unsupported or blocked vibration never throws', () => {
  const { root } = mockRoot();
  delete root.navigator.vibrate;
  assert.equal(vibrateOnSavedProgress('step', root), false);
  root.navigator.vibrate = () => { throw new Error('blocked'); };
  assert.equal(vibrateOnSavedProgress('milestone', root), false);
  root.matchMedia = () => { throw new Error('settings unavailable'); };
  assert.equal(vibrateOnSavedProgress('step', root), false);
  assert.equal(vibrateOnSavedProgress('step', {}), false);
});
