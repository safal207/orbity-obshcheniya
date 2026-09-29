import { readRoute } from './model.mjs';

// The existing v1 store owns this sequence. Never treat a URL step as evidence.
export const GUIDED = Object.freeze({
  listening: Object.freeze(['listening-3', 'listening-1', 'listening-2']),
  conflict: Object.freeze(['conflict-1', 'conflict-2', 'conflict-3']),
  needs: Object.freeze(['needs-1', 'needs-2', 'needs-3']),
});
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export function learningRoute(hash, lessons) {
  const parts = hash.replace(/^#/, '').split('/');
  if (parts[0] === 'start') return { view: 'start', id: null };
  if (parts[0] === 'guided' && (parts.length === 1 || Object.hasOwn(GUIDED, parts[1]) || /^[0-2]$/.test(parts[1]))) {
    return { view: 'guided', id: null, topic: Object.hasOwn(GUIDED, parts[1]) ? parts[1] : null };
  }
  if (parts[0] === 'guided-done') return { view: 'guided', id: null, topic: null };
  const route = readRoute(hash, lessons);
  if (route.view === 'lesson') return { ...route, step: /^[0-2]$/.test(parts[2] || '') ? Number(parts[2]) : 0 };
  return route;
}

export function nextLesson(state, lessons, moduleId = state?.focusModule) {
  if (!state) return null;
  const current = lessons.find((l) => l.id === state.currentLessonId);
  if (current && !state.completed[current.id]) return current;
  const topic = current?.moduleId || moduleId;
  const inTopic = lessons.filter((l) => l.moduleId === topic);
  const index = inTopic.findIndex((l) => l.id === current?.id);
  return inTopic.slice(index + 1).find((l) => !state.completed[l.id])
    || inTopic.find((l) => !state.completed[l.id])
    || lessons.find((l) => !state.completed[l.id]) || null;
}

export function resumeTarget(state, lessons) {
  if (!state) return null;
  if (state.guidedFlow && Object.hasOwn(GUIDED, state.guidedFlow.topic)) return `guided/${state.guidedFlow.topic}`;
  const lesson = nextLesson(state, lessons);
  return lesson ? `lesson/${lesson.id}` : 'progress';
}

// Reuse the existing validated token-CAS transaction rather than add a second
// persistence protocol or weaken the shared legacy store. A concurrent note,
// import, topic switch or answer invalidates the snapshot; nothing is erased.
export async function answerGuided(store, lessons, topic, step, choice) {
  if (!Object.hasOwn(GUIDED, topic) || !Number.isInteger(step) || step < 0 || step >= GUIDED[topic].length) fail('INVALID_EDIT');
  const lesson = lessons.find((l) => l.id === GUIDED[topic][step]);
  if (!lesson || !Number.isInteger(choice) || choice < 0 || choice >= lesson.quiz.choices.length) fail('INVALID_EDIT');
  const { state, token } = store.snapshot();
  if (state.guidedFlow?.topic !== topic || state.guidedFlow.step !== step) fail('FLOW_CONFLICT');
  if (!lesson.quiz.correct.includes(choice)) fail('INVALID_EDIT');
  try {
    return await store.replace({ ...state, guidedFlow: { topic, step: step + 1 } }, token);
  } catch (error) {
    if (error.code === 'IMPORT_CONFLICT') fail('FLOW_CONFLICT');
    throw error;
  }
}
