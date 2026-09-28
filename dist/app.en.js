import { modules, lessons, missions } from './course.en.js';

import { createProgressStore, emptyState, PROGRESS_KEY } from './progress-store.js';
const byLesson = new Map(lessons.map((item) => [item.id, item]));
const byMission = new Map(missions.map((item) => [item.id, item]));
const guided = {
  listening: ['listening-3', 'listening-1', 'listening-2'],
  conflict: ['conflict-1', 'conflict-2', 'conflict-3'],
  needs: ['needs-1', 'needs-2', 'needs-3'],
};
const main = document.querySelector('#main');
const menu = document.querySelector('#site-menu');
const toast = document.querySelector('#toast');
const phases = {};
const attempts = {};
let reviewQueue = null;
let reviewPosition = 0;
let lastRoute = '';
let toastTimer;

const store = createProgressStore({ lessons, missions, guided });
const storageMessages = {
  "INVALID_FILE": "The progress file is malformed or has an unsupported structure.",
  "INVALID_STORED": "Saved data is malformed. Nothing was overwritten.",
  "STORAGE_FAILED": "Could not save or read progress. Changes are not confirmed; your note draft remains in this tab.",
  "LOCK_UNAVAILABLE": "Safe saving is unavailable. Copy your note and open the HTTPS site in a modern browser.",
  "LOCK_TIMEOUT": "Another tab is busy saving. Nothing was written; please retry.",
  "NOTE_CONFLICT": "Another tab changed this note. Copy your draft, then reload the page to compare.",
  "IMPORT_CONFLICT": "Progress changed in another tab. Import cancelled; check the data and retry.",
  "FILE_TOO_LARGE": "File is too large.",
  "FLOW_CONFLICT": "Another tab changed the topic. Open the topic chooser again.",
  "UNSAVED_NOTES": "Save or copy your unsaved notes first. Import was not performed."
};
const drafts = new Map();
let initialLoadError;
function storageError(error) {
  announce(storageMessages[error?.code] || storageMessages.STORAGE_FAILED, 10000);
}
function loadState() {
  try { return store.read(); }
  catch (error) { initialLoadError = error; return emptyState(); }
}
let state = loadState();
async function commit(operation, message = '') {
  try {
    state = await operation();
    if (message) announce(message);
    return true;
  } catch (error) { storageError(error); return false; }
}
function draftFor(id) {
  if (!drafts.has(id)) {
    const value = state.notes[id] || '';
    drafts.set(id, { value, base: value, pending: 0, chain: Promise.resolve(), status: '' });
  }
  return drafts.get(id);
}
function hasUnsavedNotes() {
  return [...drafts.values()].some((draft) => draft.pending || draft.value !== draft.base);
}
function noteStatus(id, text) {
  const draft = draftFor(id);
  draft.status = text;
  const status = main.querySelector('[data-note-status="' + id + '"]');
  if (status) status.textContent = text;
}
function saveNote(id, value) {
  const draft = draftFor(id);
  draft.value = value;
  draft.pending++;
  noteStatus(id, "Saving note…");
  // Each edit uses the baseline established by the preceding successful save.
  // A rejected save never advances that baseline or replaces a competing note.
  draft.chain = draft.chain.then(async () => {
    const ok = await commit(() => store.saveNote(id, value, draft.base));
    if (ok) draft.base = value;
    draft.pending--;
    if (!draft.pending) noteStatus(id, ok ? "Note saved on this device." : toast.textContent);
    return ok;
  });
  return draft.chain;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function announce(message, duration = 3000) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

function doneCount() { return lessons.filter((item) => state.completed[item.id]).length; }
function missionDone(mission) { return mission.steps.every((_, index) => state.missionSteps[mission.id]?.[index]); }
function dueLessons() { return lessons.filter((item) => state.completed[item.id] && (state.review[item.id] || 0) <= Date.now()); }
function moduleOf(lesson) { return modules.find((item) => item.id === lesson.moduleId); }

function recommended() {
  if (state.currentLessonId && byLesson.has(state.currentLessonId) && !state.completed[state.currentLessonId]) return byLesson.get(state.currentLessonId);
  if (state.currentLessonId && byLesson.has(state.currentLessonId)) {
    const next = nextAfter(byLesson.get(state.currentLessonId));
    if (next) return next;
  }
  if (state.focusModule) {
    const inTopic = lessons.find((item) => item.moduleId === state.focusModule && !state.completed[item.id]);
    if (inTopic) return inTopic;
  }
  return lessons.find((item) => !state.completed[item.id]) || null;
}

function nextAfter(lesson) {
  const topic = lessons.filter((item) => item.moduleId === lesson.moduleId);
  const position = topic.findIndex((item) => item.id === lesson.id);
  return topic.slice(position + 1).find((item) => !state.completed[item.id])
    || topic.find((item) => !state.completed[item.id])
    || lessons.find((item) => !state.completed[item.id])
    || null;
}

function flow(meta, progress, body, back = '') {
  const track = progress === null ? '' : '<div class="flow-track" role="progressbar" aria-label="Progress in this exercise" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '"><span class="flow-fill" style="width:' + progress + '%"></span></div>';
  return '<section class="flow-screen">' +
    (back ? '<a class="text-link flow-back" href="' + back + '">← Back</a>' : '') +
    '<div class="flow-meta">' + esc(meta) + '</div>' + track +
    '<div class="flow-card">' + body + '</div></section>';
}

function primary(href, text) {
  return '<a class="primary-button" href="' + href + '">' + esc(text) + ' <span aria-hidden="true">→</span></a>';
}

function renderHome() {
  const done = doneCount();
  const next = recommended();
  if (state.guidedFlow) {
    const step = state.guidedFlow.step;
    return flow('YOUR NEXT STEP', null,
      '<h1 class="flow-title" tabindex="-1">Pick up where you left off?</h1>' +
      '<p class="flow-intro">' + (step < 3 ? 'Continue with question ' + (step + 1) + ' of 3.' : 'Your three questions are done. See your result and move on to the lessons.') + '</p>' +
      '<div class="flow-actions">' + primary(step < 3 ? '#guided/' + step : '#guided-done', 'Continue') + '</div>' +
      '<a class="text-link" href="#start">Choose another topic</a>');
  }
  if (!next) {
    return flow('PATH COMPLETE', null,
      '<h1 class="flow-title" tabindex="-1">You have completed every lesson.</h1>' +
      '<p class="flow-intro">These skills grow through conversation. Come back to a situation whenever you need it.</p>' +
      '<div class="flow-actions">' + primary('#review', 'Review a skill') + '</div>' +
      '<a class="text-link" href="#path">Full learning path</a>');
  }
  if (done === 0) {
    return flow('ONE SITUATION · A FEW MINUTES', null,
      '<h1 class="flow-title" tabindex="-1">Start with one question.</h1>' +
      '<p class="flow-intro">Choose a relationship situation, answer a question, and get a short explanation.</p>' +
      '<div class="flow-actions">' + primary('#start', 'Start') + '</div>');
  }
  return flow('YOUR NEXT STEP', null,
    '<h1 class="flow-title" tabindex="-1">' + esc(next.title) + '</h1>' +
    '<p class="flow-intro">One idea, one question, and a short explanation.</p>' +
    '<div class="flow-actions">' + primary('#lesson/' + esc(next.id), 'Continue') + '</div>' +
    '<a class="text-link" href="#start">Choose another topic</a>');
}

function renderTopics() {
  const options = [
    ['listening', 'I do not feel heard'],
    ['conflict', 'Conversations turn into arguments'],
    ['needs', 'I struggle to say what I need'],
  ];
  const body = '<h1 class="flow-title" tabindex="-1" id="topic-question">What would you like to improve?</h1>' +
    '<p class="flow-intro">Choose what feels closest. You can change topics later.</p>' +
    '<div class="topic-list" role="group" aria-labelledby="topic-question">' +
    options.map(([id, label]) => '<button type="button" class="topic-option" data-topic="' + id + '">' + esc(label) + ' <span aria-hidden="true">→</span></button>').join('') +
    '</div>';
  return flow('STEP 1 · CHOOSE A TOPIC', 0, body, '#today');
}

function resultDetails(lesson) {
  const draft = draftFor(lesson.id);
  return '<details class="note-disclosure"><summary>Example and your note</summary>' +
    '<p class="example-text">' + esc(lesson.example) + '</p>' +
    '<button type="button" class="secondary-button" data-copy-example="' + esc(lesson.id) + '">Copy example</button>' +
    '<label for="note-' + esc(lesson.id) + '">How might you use this?</label>' +
    '<textarea id="note-' + esc(lesson.id) + '" data-note-id="' + esc(lesson.id) + '" maxlength="2000" rows="3" placeholder="Write your own phrase if you like">' + esc(draft.value) + '</textarea>' +
    '<p class="fine-print">Your note is saved only in this browser.</p>' +
    '<p class="fine-print" data-note-status="' + esc(lesson.id) + '" role="status">' + esc(draft.status) + '</p>' +
    '<button type="button" class="secondary-button" data-save-note="' + esc(lesson.id) + '">Retry saving</button></details>';
}

function questionScreen(lesson, mode, meta, progress, completedProgress, back, continueHtml) {
  const key = mode + ':' + lesson.id;
  const picked = attempts[key];
  if (Number.isInteger(picked)) {
    const correct = lesson.quiz.correct.includes(picked);
    if (!correct) {
      const body = '<p class="eyebrow">A QUICK EXPLANATION</p>' +
        '<h1 class="flow-title" tabindex="-1">Try another answer.</h1>' +
        '<p class="flow-intro">' + esc(lesson.principle) + '</p>' +
        '<div class="result bad">You chose: ' + esc(lesson.quiz.choices[picked]) + '</div>' +
        '<div class="flow-actions"><button type="button" class="primary-button" data-retry="' + esc(lesson.id) + '" data-mode="' + mode + '">Choose another answer →</button></div>';
      return flow(meta, progress, body, back);
    }
    const body = '<p class="eyebrow">A QUICK EXPLANATION</p>' +
      '<h1 class="flow-title" tabindex="-1">Yes, that is clearer.</h1>' +
      '<div class="result good"><strong>' + esc(lesson.quiz.choices[picked]) + '</strong><p>' + esc(lesson.quiz.explanation) + '</p></div>' +
      resultDetails(lesson) +
      '<div class="flow-actions">' + continueHtml + '</div>';
    return flow(meta, completedProgress, body, back);
  }
  const body = '<p class="eyebrow">' + esc(lesson.title) + '</p>' +
    '<h1 class="flow-title" tabindex="-1" id="question-' + esc(lesson.id) + '">' + esc(lesson.quiz.prompt) + '</h1>' +
    '<div class="answer-list" role="group" aria-labelledby="question-' + esc(lesson.id) + '">' +
    lesson.quiz.choices.map((choice, index) => '<button type="button" class="answer-option" data-answer-id="' + esc(lesson.id) + '" data-choice="' + index + '" data-mode="' + mode + '">' + esc(choice) + '</button>').join('') +
    '</div>';
  return flow(meta, progress, body, back);
}

function renderGuided(index) {
  const active = state.guidedFlow;
  const ids = guided[active?.topic];
  if (!ids) return renderTopics();
  if (index > active.step) {
    location.hash = '#guided/' + active.step;
    return renderGuided(active.step);
  }
  if (index < active.step && !Number.isInteger(attempts['guided:' + ids[index]])) {
    location.hash = active.step === 3 ? '#guided-done' : '#guided/' + active.step;
    return active.step === 3 ? renderGuidedDone() : renderGuided(active.step);
  }
  const lesson = byLesson.get(ids[index]);
  const next = index < ids.length - 1
    ? primary('#guided/' + (index + 1), 'Next question')
    : primary('#guided-done', 'See your result');
  const back = index && Number.isInteger(attempts['guided:' + ids[index - 1]]) ? '#guided/' + (index - 1) : '#start';
  return questionScreen(lesson, 'guided', 'QUESTION ' + (index + 1) + ' OF 3', Math.round((index / 3) * 100), Math.round(((index + 1) / 3) * 100), back, next);
}

function renderGuidedDone() {
  if (!state.guidedFlow) return renderTopics();
  if (state.guidedFlow.step < 3) {
    location.hash = '#guided/' + state.guidedFlow.step;
    return renderGuided(state.guidedFlow.step);
  }
  const module = modules.find((item) => item.id === state.guidedFlow.topic);
  if (!module) return renderTopics();
  const next = lessons.find((item) => item.moduleId === module.id && !state.completed[item.id]) || recommended();
  return flow('THREE QUESTIONS COMPLETE', 100,
    '<h1 class="flow-title" tabindex="-1">Continue with “' + esc(module.title) + '”.</h1>' +
    '<p class="flow-intro">You have tried a few situations. Next comes a short lesson and one more question.</p>' +
    '<div class="flow-actions">' + primary(next ? '#lesson/' + esc(next.id) : '#review', next ? 'Continue this topic' : 'Review a skill') + '</div>' +
    '<a class="text-link" href="#path">All topics and lessons</a>');
}

function renderLesson(lesson) {
  const phase = phases[lesson.id] || 'idea';
  if (phase === 'idea') {
    const body = '<p class="eyebrow">' + esc(moduleOf(lesson).title) + '</p>' +
      '<h1 class="flow-title" tabindex="-1">' + esc(lesson.title) + '</h1>' +
      '<p class="flow-intro">' + esc(lesson.principle) + '</p>' +
      '<div class="flow-actions"><button type="button" class="primary-button" data-open-question="' + esc(lesson.id) + '">Go to question <span aria-hidden="true">→</span></button></div>';
    return flow('STEP 1 OF 2 · ' + lesson.minutes + ' MIN', 0, body, '#path');
  }
  const next = nextAfter(lesson);
  const more = primary(next ? '#lesson/' + esc(next.id) : '#progress', next ? 'Next lesson' : 'View progress');
  return questionScreen(lesson, 'lesson', 'STEP 2 OF 2', 50, 100, '#path', more);
}

function renderPractice(id) {
  const lesson = (id && byLesson.get(id)) || recommended() || lessons[0];
  const next = lessons[(lessons.indexOf(lesson) + 1) % lessons.length];
  return questionScreen(lesson, 'practice', 'ONE SITUATION', null, null, '#today', primary('#practice/' + esc(next.id), 'Next situation'));
}

function renderReview() {
  if (!reviewQueue) {
    for (const key of Object.keys(attempts)) if (key.startsWith('review:')) delete attempts[key];
    const due = dueLessons();
    const completed = lessons.filter((item) => state.completed[item.id]);
    reviewQueue = (due.length ? due : completed).slice(0, 4).map((item) => item.id);
    reviewPosition = 0;
  }
  if (!reviewQueue.length) {
    return flow('REVIEW', null,
      '<h1 class="flow-title" tabindex="-1">Complete a lesson first.</h1>' +
      '<p class="flow-intro">Then you will have a question to come back to here.</p>' +
      '<div class="flow-actions">' + primary('#today', 'Get started') + '</div>');
  }
  if (reviewPosition >= reviewQueue.length) {
    return flow('REVIEW COMPLETE', 100,
      '<h1 class="flow-title" tabindex="-1">You have refreshed these skills.</h1>' +
      '<p class="flow-intro">Try using one in your next conversation.</p>' +
      '<div class="flow-actions">' + primary('#today', 'Go to the next step') + '</div>');
  }
  const lesson = byLesson.get(reviewQueue[reviewPosition]);
  const nextButton = '<button type="button" class="primary-button" data-next-review>Next question <span aria-hidden="true">→</span></button>';
  return questionScreen(lesson, 'review', 'QUESTION ' + (reviewPosition + 1) + ' OF ' + reviewQueue.length,
    Math.round((reviewPosition / reviewQueue.length) * 100), Math.round(((reviewPosition + 1) / reviewQueue.length) * 100), '#today', nextButton);
}

function renderPath(selectedId) {
  const next = recommended();
  const intro = '<div class="section-page"><p class="eyebrow">LEARNING PATH</p><h1 tabindex="-1">Choose a topic.</h1>' +
    '<p class="flow-intro">Go in order or open what you need today.</p>' +
    (next ? '<div class="flow-actions">' + primary('#lesson/' + esc(next.id), 'Continue your current step') + '</div>' : '');
  const list = modules.map((module) => {
    const items = lessons.filter((item) => item.moduleId === module.id);
    const count = items.filter((item) => state.completed[item.id]).length;
    return '<details class="accordion"' + (module.id === selectedId ? ' open' : '') + '><summary><span>' + esc(module.title) + '</span><small>' + count + ' of ' + items.length + '</small></summary>' +
      '<p>' + esc(module.description) + '</p><div class="lesson-list">' +
      items.map((lesson) => '<a href="#lesson/' + esc(lesson.id) + '">' + esc(lesson.title) + (state.completed[lesson.id] ? ' <span aria-label="Completed">✓</span>' : '') + '</a>').join('') +
      '</div></details>';
  }).join('');
  return intro + '<div class="accordion-list">' + list + '</div><a class="text-link" href="#missions">6 real-life missions</a></div>';
}

function renderMissions() {
  const first = missions.find((item) => !missionDone(item)) || missions[0];
  const others = missions.filter((item) => item.id !== first.id);
  return '<div class="section-page"><p class="eyebrow">REAL-LIFE PRACTICE</p><h1 tabindex="-1">Try one small step.</h1>' +
    '<div class="flow-card"><h2>' + esc(first.title) + '</h2><p class="flow-intro">' + esc(first.description) + '</p>' +
    '<div class="flow-actions">' + primary('#mission/' + esc(first.id), missionDone(first) ? 'Open again' : 'Start mission') + '</div></div>' +
    '<details class="accordion"><summary>Other missions</summary><div class="lesson-list">' +
    others.map((item) => '<a href="#mission/' + esc(item.id) + '">' + esc(item.title) + '</a>').join('') +
    '</div></details></div>';
}

function renderMission(mission) {
  const steps = state.missionSteps[mission.id] || [];
  const index = mission.steps.findIndex((_, step) => !steps[step]);
  if (index < 0) {
    return flow('MISSION COMPLETE', 100,
      '<h1 class="flow-title" tabindex="-1">' + esc(mission.title) + '</h1>' +
      '<p class="flow-intro">You have marked all three steps. Return to this conversation whenever you need to.</p>' +
      '<div class="flow-actions">' + primary('#missions', 'More missions') + '</div>');
  }
  const body = '<p class="eyebrow">' + esc(mission.title) + '</p>' +
    '<h1 class="flow-title" tabindex="-1">' + esc(mission.steps[index]) + '</h1>' +
    '<p class="fine-print">Try this only if it feels safe and appropriate. If you face pressure, threats, or fear, stop and seek support you trust.</p>' +
    '<div class="flow-actions"><button type="button" class="primary-button" data-mission-complete="' + esc(mission.id) + '" data-step="' + index + '">Mark this step done <span aria-hidden="true">→</span></button></div>' +
    (index > 0 ? '<button type="button" class="text-link as-button" data-mission-undo="' + esc(mission.id) + '" data-step="' + (index - 1) + '">Go back one step</button>' : '');
  return flow('STEP ' + (index + 1) + ' OF ' + mission.steps.length, Math.round((index / mission.steps.length) * 100), body, '#missions');
}

function renderProgress() {
  const done = doneCount();
  const percent = Math.round((done / lessons.length) * 100);
  const next = recommended();
  const detail = modules.map((module) => {
    const items = lessons.filter((item) => item.moduleId === module.id);
    const count = items.filter((item) => state.completed[item.id]).length;
    return '<div class="progress-row"><span>' + esc(module.title) + '</span><strong>' + count + ' / ' + items.length + '</strong></div>';
  }).join('');
  return '<div class="section-page"><p class="eyebrow">YOUR PROGRESS</p><h1 tabindex="-1">' + done + ' of ' + lessons.length + ' lessons.</h1>' +
    '<div class="flow-track" role="progressbar" aria-label="Completed lessons" aria-valuemin="0" aria-valuemax="' + lessons.length + '" aria-valuenow="' + done + '"><span class="flow-fill" style="width:' + percent + '%"></span></div>' +
    '<p class="flow-intro">Completed lessons are shown here. Reviewing helps you remember the answers.</p>' +
    '<div class="flow-actions">' + primary(next ? '#lesson/' + esc(next.id) : '#review', next ? 'Continue' : 'Review') + '</div>' +
    '<details class="accordion"><summary>Progress by topic</summary>' + detail + '</details>' +
    '<details class="accordion"><summary>Move your progress</summary><p>This file contains your progress and personal notes. Keep it private.</p>' +
    '<div class="transfer-actions"><button type="button" class="secondary-button" data-export>Download file</button>' +
    '<label class="secondary-button import-label">Upload file<input type="file" accept="application/json,.json" data-import aria-label="Upload progress file"></label></div></details></div>';
}

function renderAbout() {
  return '<div class="section-page"><p class="eyebrow">ABOUT THE APPROACH</p><h1 tabindex="-1">Less guessing. More questions.</h1>' +
    '<p class="flow-intro">The “Mars and Venus” metaphor reminds us that people may ask for support in different ways. The useful skill is to ask this person what they need, without drawing conclusions from their gender.</p>' +
    '<p class="flow-intro">This is an independent educational practice tool with original exercises, not a retelling of the books or an official course.</p>' +
    '<details class="accordion"><summary>Sources and influences</summary><ul class="source-list">' +
    '<li><a href="https://www.marsvenus.com/books" target="_blank" rel="noopener noreferrer">John Gray’s books</a> — inspiration for the metaphor and themes.</li>' +
    '<li><a href="https://www.gottman.com/about/the-gottman-method/" target="_blank" rel="noopener noreferrer">The Gottman Method</a> — connection, conflict and repair.</li>' +
    '<li><a href="https://www.nonviolentcommunication.com/pdf_files/nvc2-chapter-one.html" target="_blank" rel="noopener noreferrer">Nonviolent Communication</a> — observation, feelings, needs and requests.</li>' +
    '<li><a href="https://www.purdue.edu/uns/html4ever/2004/040217.MacGeorge.sexroles.html" target="_blank" rel="noopener noreferrer">Purdue University research</a> — similarities in preferences for supportive communication.</li></ul></details>' +
    '<p class="fine-print">If your relationship involves pressure, threats or fear, practising together may be inappropriate. Put your safety first and seek support from people or services you trust.</p></div>';
}

function route() {
  const [name, id] = (location.hash.slice(1) || 'today').split('/');
  if (name === 'lesson' && byLesson.has(id)) return { name, id };
  if (name === 'mission' && byMission.has(id)) return { name, id };
  if (name === 'guided' && ['0', '1', '2'].includes(id)) return { name, index: Number(id) };
  if (name === 'practice' && id && byLesson.has(id)) return { name, id };
  if (name === 'module' && modules.some((item) => item.id === id)) return { name: 'path', id };
  if (['today', 'start', 'guided-done', 'path', 'practice', 'review', 'missions', 'progress', 'about'].includes(name)) return { name };
  return { name: 'today' };
}

function render(focusHeading = false) {
  const current = route();
  const routeKey = location.hash || '#today';
  if (current.name === 'practice' && routeKey !== lastRoute) {
    const id = current.id || recommended()?.id || lessons[0].id;
    delete attempts['practice:' + id];
  }
  lastRoute = routeKey;
  if (current.name !== 'review') { reviewQueue = null; reviewPosition = 0; }
  const nav = ['start', 'guided', 'guided-done', 'lesson'].includes(current.name) ? 'today' : current.name === 'mission' ? 'missions' : current.name;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    if (link.dataset.nav === nav) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const progress = document.querySelector('#header-progress');
  if (progress) progress.textContent = doneCount() ? 'Completed: ' + doneCount() : 'Ready to begin';
  const badge = document.querySelector('#review-badge');
  if (badge) {
    badge.textContent = dueLessons().length;
    badge.hidden = dueLessons().length === 0;
  }
  const languageLink = document.querySelector('#language-link');
  if (languageLink) languageLink.href = 'index.html' + (location.hash || '');
  if (menu) menu.open = false;
  let html;
  switch (current.name) {
    case 'today': html = renderHome(); break;
    case 'start': html = renderTopics(); break;
    case 'guided': html = renderGuided(current.index); break;
    case 'guided-done': html = renderGuidedDone(); break;
    case 'lesson': html = renderLesson(byLesson.get(current.id)); break;
    case 'practice': html = renderPractice(current.id); break;
    case 'review': html = renderReview(); break;
    case 'path': html = renderPath(current.id); break;
    case 'missions': html = renderMissions(); break;
    case 'mission': html = renderMission(byMission.get(current.id)); break;
    case 'progress': html = renderProgress(); break;
    case 'about': html = renderAbout(); break;
    default: html = renderHome();
  }
  main.innerHTML = html;
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (focusHeading) main.querySelector('h1')?.focus({ preventScroll: true });
}

async function navigate(focusHeading = true) {
  const hash = location.hash;
  const current = route();
  if (current.name === 'lesson' && (state.currentLessonId !== current.id ||
    state.focusModule !== byLesson.get(current.id).moduleId || state.guidedFlow)) {
    await commit(() => store.selectLesson(current.id));
  }
  if (location.hash === hash) render(focusHeading);
}

async function chooseAnswer(id, choice, mode) {
  const lesson = byLesson.get(id);
  if (!lesson || !['guided', 'lesson', 'practice', 'review'].includes(mode) ||
      !Number.isInteger(choice) || choice < 0 || choice >= lesson.quiz.choices.length) return;
  const hash = location.hash;
  if (lesson.quiz.correct.includes(choice) && !await commit(() => store.answer(id, choice, mode))) return;
  attempts[mode + ':' + id] = choice;
  if (location.hash === hash) render(true);
}

main.addEventListener('click', async (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.saveNote && byLesson.has(target.dataset.saveNote)) {
    await saveNote(target.dataset.saveNote, draftFor(target.dataset.saveNote).value);
    return;
  }
  if (target.dataset.copyExample) {
    const example = byLesson.get(target.dataset.copyExample)?.example;
    if (!example) return;
    navigator.clipboard.writeText(example)
      .then(() => announce('Example copied'))
      .catch(() => announce('Could not copy the example'));
    return;
  }
  if (target.dataset.topic && guided[target.dataset.topic]) {
    if (!await commit(() => store.startGuided(target.dataset.topic))) return;
    for (const key of Object.keys(attempts)) if (key.startsWith('guided:')) delete attempts[key];
    location.hash = state.guidedFlow.step === 3 ? '#guided-done' : '#guided/' + state.guidedFlow.step;
    return;
  }
  if (target.dataset.openQuestion) {
    phases[target.dataset.openQuestion] = 'question';
    render(true);
    return;
  }
  if (target.dataset.answerId) {
    await chooseAnswer(target.dataset.answerId, Number(target.dataset.choice), target.dataset.mode);
    return;
  }
  if (target.dataset.retry) {
    delete attempts[target.dataset.mode + ':' + target.dataset.retry];
    render(true);
    return;
  }
  if (target.hasAttribute('data-next-review')) {
    reviewPosition += 1;
    render(true);
    return;
  }
  if (target.dataset.missionComplete) {
    const mission = byMission.get(target.dataset.missionComplete);
    const index = Number(target.dataset.step);
    if (!mission || !Number.isInteger(index) || index < 0 || index >= mission.steps.length) return;
    if (!await commit(() => store.setMissionStep(mission.id, index, true))) return;
    render(true);
    return;
  }
  if (target.dataset.missionUndo) {
    const mission = byMission.get(target.dataset.missionUndo);
    const index = Number(target.dataset.step);
    if (!mission || !Number.isInteger(index) || index < 0 || index >= mission.steps.length) return;
    if (!await commit(() => store.setMissionStep(mission.id, index, false))) return;
    render(true);
    return;
  }
  if (target.hasAttribute('data-export')) {
    let saved;
    try { saved = store.read(); } catch (error) { storageError(error); return; }
    const blob = new Blob([JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ...saved }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'orbity-obshcheniya-progress.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    announce('Progress file downloaded');
  }
});

main.addEventListener('input', (event) => {
  const id = event.target.dataset.noteId;
  if (!byLesson.has(id)) return;
  return saveNote(id, event.target.value.slice(0, 2000));
});

main.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-import]');
  if (!input?.files?.length) return;
  try {
    const file = input.files[0];
    if (file.size > 2_000_000) throw Object.assign(new Error(), { code: 'FILE_TOO_LARGE' });
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch { throw Object.assign(new Error(), { code: 'INVALID_FILE' }); }
    const imported = store.validateImport(parsed);
    if (hasUnsavedNotes()) throw Object.assign(new Error(), { code: 'UNSAVED_NOTES' });
    const { token } = store.snapshot();
    if (!confirm('Replace current progress with the file’s data?')) return;
    if (await commit(() => store.replace(imported, token), 'Progress imported')) {
      drafts.clear();
      for (const key of Object.keys(attempts)) delete attempts[key];
      reviewQueue = null;
      render(true);
    }
  } catch (error) { storageError(error); }
  finally { input.value = ''; }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu?.open) menu.open = false;
});
document.querySelector('.skip-link')?.addEventListener('click', (event) => {
  event.preventDefault();
  main.focus();
});
function refreshProgress() {
  try { state = store.read(); } catch (error) { storageError(error); return; }
  for (const [id, draft] of drafts) {
    if (!draft.pending && draft.value === draft.base) drafts.delete(id);
  }
  // Never replace an editor containing pending or failed text with remote state.
  if (!hasUnsavedNotes()) render();
}
window.addEventListener('storage', (event) => {
  if (event.key === PROGRESS_KEY || event.key === null) refreshProgress();
});
window.addEventListener('focus', refreshProgress);
window.addEventListener('beforeunload', (event) => {
  if (hasUnsavedNotes()) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('hashchange', () => navigate(true));
await navigate(false);
if (initialLoadError) storageError(initialLoadError);
