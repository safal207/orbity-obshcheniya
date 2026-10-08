const fail = (code) => { throw Object.assign(new Error(code), { code }); };

// Keep a session stable while answers reschedule its lessons. Like the legacy
// review screen, overdue lessons take priority; unfinished lessons never enter.
export function reviewQueue(state, lessons, now = Date.now()) {
  if (!state) return null;
  const completed = lessons.filter((lesson) => state.completed[lesson.id]);
  const due = completed.filter((lesson) => state.review[lesson.id] <= now);
  return (due.length ? due : completed).slice(0, 4).map((lesson) => lesson.id);
}

export async function answerReview(store, lesson, choice, now = Date.now()) {
  if (!lesson || !Number.isInteger(choice) || !lesson.quiz.correct.includes(choice)) fail('INVALID_EDIT');
  const { state, token } = store.snapshot();
  if (!state.completed[lesson.id]) fail('FLOW_CONFLICT');
  // The v1 token is checked under the lock. An import or concurrent edit must
  // not turn a queued review into an answer for an unfinished lesson.
  try {
    return await store.replace({ ...state,
      answers: { ...state.answers, [lesson.id]: choice },
      review: { ...state.review, [lesson.id]: now + 3 * 86400000 },
    }, token);
  } catch (error) {
    if (error.code === 'IMPORT_CONFLICT') fail('FLOW_CONFLICT');
    throw error;
  }
}
