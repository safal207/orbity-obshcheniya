import { modules, lessons, missions } from './course.en.js';

import { createProgressStore, emptyState, PROGRESS_KEY } from './progress-store.js';
const store = createProgressStore({ lessons, missions });
const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
const missionById = new Map(missions.map((mission) => [mission.id, mission]));
const main = document.querySelector('#main');
const toast = document.querySelector('#toast');
let filter = 'all';
let toastTimer;
let reviewSessionIds = null;
let reviewAttempts = {};

const storageMessages = {
  "INVALID_FILE": "The progress file is malformed or has an unsupported structure.",
  "INVALID_STORED": "Saved data is malformed. Nothing was overwritten.",
  "STORAGE_FAILED": "Could not save or read progress. Your text remains on screen; please retry.",
  "LOCK_UNAVAILABLE": "Safe saving is unavailable. Copy your note and open the HTTPS site in a modern browser.",
  "LOCK_TIMEOUT": "Another tab is busy saving. Nothing was written; please retry.",
  "NOTE_CONFLICT": "Another tab changed this note. Your text remains on screen: copy it, then reopen the lesson.",
  "IMPORT_CONFLICT": "Progress changed in another tab. Import cancelled; check the data and retry.",
  "FILE_TOO_LARGE": "File is too large."
};
let initialLoadError;
let noteBaseline = '';

function storageError(error) {
  showToast(storageMessages[error?.code] || storageMessages.STORAGE_FAILED, 10000);
}

function loadState() {
  try { return store.read(); }
  catch (error) { initialLoadError = error; return emptyState(); }
}

let state = loadState();

async function commit(operation, message = '') {
  try {
    const saved = await operation();
    state = saved;
    if (message) showToast(message);
    return true;
  } catch (error) { storageError(error); return false; }
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function showToast(message, duration = 3500) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

function completedCount() { return lessons.filter((lesson) => state.completed[lesson.id]).length; }
function missionDone(mission) { return mission.steps.every((_, index) => state.missionSteps[mission.id]?.[index]); }
function dueLessons() { return lessons.filter((lesson) => state.completed[lesson.id] && (state.review[lesson.id] || 0) <= Date.now()); }
function nextLesson() { return lessons.find((lesson) => !state.completed[lesson.id]) || lessons[0]; }

function heading(eyebrow, title, description, pill = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${esc(eyebrow)}</p><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${pill ? `<span class="level-pill">${esc(pill)}</span>` : ''}</div>`;
}

function progressBar(count, total) {
  const percent = total ? Math.round(100 * count / total) : 0;
  return `<div class="progress-track" role="progressbar" aria-label="Module progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${count}"><div class="progress-fill" style="width:${percent}%"></div></div>`;
}

function renderToday() {
  const next = nextLesson();
  const number = lessons.indexOf(next) + 1;
  const moduleIndex = modules.findIndex((module) => module.id === next.moduleId);
  const module = modules[moduleIndex];
  const done = completedCount();
  const finished = done === lessons.length;
  return `${heading('CONVERSATION ORBITS · TODAY', finished ? 'You completed the whole path.' : 'A better conversation starts with a question.', finished ? 'Keep practising these skills in real conversations.' : 'One lesson, one situation, and a little more clarity between you.', `${String(moduleIndex + 1).padStart(2, '0')} / 08 · ${module.title}`)}
    <div class="dashboard-grid">
      <section class="feature"><p class="eyebrow">${finished ? 'REVIEW AND APPLY' : 'YOUR NEXT STEP'}</p><h2>${esc(next.title)}</h2><p>${esc(next.summary)}</p><div class="feature-meta"><span class="tag">${esc(module.title)}</span><span class="tag">${next.minutes} minutes</span><span class="tag">Lesson ${number} / ${lessons.length}</span></div><a class="btn peach" href="#lesson/${esc(next.id)}">${finished ? 'Review lesson' : 'Start lesson'} <span aria-hidden="true">→</span></a></section>
      <section class="practice-card"><p class="eyebrow">TRY THIS NOW</p><div class="sample-dialog"><span class="bubble incoming">I had a hard day.</span><span class="bubble outgoing">Would you like me to listen, or shall we think through what to do together?</span></div><h2>Less guessing</h2><p>One short question helps you practise this skill right away.</p><a class="btn outline" href="#practice/listening-3">Try it in one minute →</a></section>
    </div><div class="stats"><div class="stat"><strong>${done} / ${lessons.length}</strong><span>lessons completed</span></div><div class="stat"><strong>${dueLessons().length}</strong><span>lessons due for review</span></div><div class="stat"><strong>${missions.filter(missionDone).length} / ${missions.length}</strong><span>real-life missions</span></div></div>`;
}

function renderPath() {
  const cards = modules.map((module, moduleIndex) => {
    const items = lessons.filter((lesson) => lesson.moduleId === module.id);
    const count = items.filter((lesson) => state.completed[lesson.id]).length;
    return `<section class="card module-card" id="module-${esc(module.id)}"><div class="module-top"><span class="module-number">${String(moduleIndex + 1).padStart(2, '0')}</span><div class="module-copy"><h2>${esc(module.title)}</h2><p>${esc(module.description)}</p></div><span class="module-count">${count} / ${items.length}</span></div>${progressBar(count, items.length)}<div class="lesson-list">${items.map((lesson, index) => `<a class="lesson-link ${state.completed[lesson.id] ? 'done' : ''}" href="#lesson/${esc(lesson.id)}"><span class="lesson-index">${state.completed[lesson.id] ? '✓' : String(index + 1).padStart(2, '0')}</span><span>${esc(lesson.title)}</span><small>${lesson.minutes} min</small></a>`).join('')}</div></section>`;
  }).join('');
  const missionCards = missions.map((mission) => `<section class="card mission-card"><h2>${esc(mission.title)} ${missionDone(mission) ? '<span aria-label="Completed">✓</span>' : ''}</h2><p>${esc(mission.description)}</p><a class="btn outline" href="#mission/${esc(mission.id)}">${missionDone(mission) ? 'Open again' : 'Open mission'} →</a></section>`).join('');
  return `${heading('LEARNING PATH · 8 STAGES', 'A path to clearer conversations.', '32 short lessons. Follow the path or start with a topic you need now.', `${completedCount()} / ${lessons.length} lessons`)}<div class="module-list">${cards}</div><div class="toolbar" style="margin-top:34px"><div><p class="eyebrow">USE IT IN REAL LIFE</p><h2>6 conversation missions</h2></div></div><div class="mission-list">${missionCards}</div>`;
}

function renderQuiz(lesson, mode = 'lesson') {
  const picked = mode === 'review' ? reviewAttempts[lesson.id] : state.answers[lesson.id];
  const correct = lesson.quiz.correct.includes(picked);
  const answered = Number.isInteger(picked);
  return `<div class="quiz" data-quiz-panel="${esc(lesson.id)}"><p class="eyebrow">CHECK YOUR UNDERSTANDING</p><p class="quiz-prompt">${esc(lesson.quiz.prompt)}</p><div class="choices" role="group" aria-label="Answer choices">${lesson.quiz.choices.map((choice, index) => `<button type="button" class="choice ${answered && picked === index ? (correct ? 'correct' : 'wrong') : ''}" data-quiz-id="${esc(lesson.id)}" data-choice="${index}" data-mode="${mode}">${esc(choice)}</button>`).join('')}</div>${answered ? `<div class="feedback ${correct ? '' : 'error'}" role="status"><strong>${correct ? 'That works.' : 'Try again.'}</strong> ${esc(lesson.quiz.explanation)}</div>` : ''}</div>`;
}

function renderLesson(lesson) {
  noteBaseline = state.notes[lesson.id] || '';
  const index = lessons.indexOf(lesson);
  const module = modules.find((item) => item.id === lesson.moduleId);
  const next = lessons[index + 1];
  return `<a class="back-link" href="#path">← Back to learning path</a>${heading(`LESSON ${index + 1} / ${lessons.length} · ${module.title.toUpperCase()}`, lesson.title, lesson.summary, `${lesson.minutes} minutes`)}<div class="lesson-layout"><article class="card reading"><h2>Understand the idea</h2><p class="intro">${esc(lesson.summary)}</p><div class="content-block"><h3>Main idea</h3><p>${esc(lesson.principle)}</p></div><div class="content-block"><h3>What it sounds like</h3><div class="example">${esc(lesson.example)}</div></div><div class="content-block"><h3>Try it in real life</h3><p>${esc(lesson.action)}</p></div>${next ? `<a class="btn outline next-link" href="#lesson/${esc(next.id)}">Next lesson →</a>` : `<a class="btn outline next-link" href="#path">Full learning path →</a>`}</article><aside class="card exercise-panel">${renderQuiz(lesson)}<div class="note-box"><label for="reflection">Your own phrase or observation</label><p>Write down how you might use the skill. Your note stays in this browser and is included if you export your progress.</p><textarea id="reflection" class="note-input" maxlength="2000" placeholder="For example: I will ask whether they want advice first…">${esc(state.notes[lesson.id] || '')}</textarea><button type="button" class="btn dark" data-save-note="${esc(lesson.id)}">Save note</button></div></aside></div>`;
}

function renderPracticeList() {
  const displayed = filter === 'all' ? lessons : lessons.filter((lesson) => lesson.moduleId === filter);
  return `${heading('PRACTICE · 32 QUESTIONS', 'Choose a situation and try responding.', 'Each answer comes with an explanation. You can try again right away.', `${displayed.length} questions`)}<div class="toolbar"><div class="filters" aria-label="Practice topics"><button type="button" class="filter-btn ${filter === 'all' ? 'active' : ''}" data-filter="all">All</button>${modules.map((module) => `<button type="button" class="filter-btn ${filter === module.id ? 'active' : ''}" data-filter="${esc(module.id)}">${esc(module.title)}</button>`).join('')}</div><a class="btn outline" href="#missions">6 real-life missions →</a></div><div class="practice-list">${displayed.map((lesson) => { const module = modules.find((item) => item.id === lesson.moduleId); return `<section class="card practice-item"><p class="eyebrow">${esc(module.title)}</p><h2>${esc(lesson.title)}</h2><p>${esc(lesson.quiz.prompt)}</p><a class="btn outline" href="#practice/${esc(lesson.id)}">Try this situation →</a></section>`; }).join('')}</div>`;
}

function renderPracticeItem(lesson) {
  const index = lessons.indexOf(lesson);
  const next = lessons[(index + 1) % lessons.length];
  const module = modules.find((item) => item.id === lesson.moduleId);
  return `<a class="back-link" href="#practice">← All situations</a>${heading(`PRACTICE · ${module.title.toUpperCase()}`, lesson.title, lesson.summary)}<div class="practice-layout"><section class="card exercise-panel">${renderQuiz(lesson, 'practice')}</section><aside class="card side-panel"><h2>Take it one step further</h2><p>${esc(lesson.action)}</p><div class="phrase-example"><p class="eyebrow">EXAMPLE TO CONSIDER</p><blockquote>${esc(lesson.example)}</blockquote><button type="button" class="btn outline" data-copy-example="${esc(lesson.id)}">Copy example</button></div><div class="actions"><a class="btn outline" href="#lesson/${esc(lesson.id)}">Read lesson →</a><a class="btn outline" href="#practice/${esc(next.id)}">Next situation →</a></div></aside></div>`;
}

function renderMissions() {
  return `<a class="back-link" href="#practice">← Back to practice</a>${heading('REAL-LIFE PRACTICE', 'Six conversations you can try.', 'These are small steps, not a test. Try only what is safe and appropriate for you.', `${missions.filter(missionDone).length} / ${missions.length} completed`)}<div class="mission-list">${missions.map((mission) => `<section class="card mission-card"><p class="eyebrow">${missionDone(mission) ? 'COMPLETED' : 'MISSION'}</p><h2>${esc(mission.title)}</h2><p>${esc(mission.description)}</p><a class="btn outline" href="#mission/${esc(mission.id)}">Open →</a></section>`).join('')}</div>`;
}

function renderMission(mission) {
  const steps = state.missionSteps[mission.id] || [];
  return `<a class="back-link" href="#missions">← Back to missions</a>${heading('REAL-LIFE PRACTICE', mission.title, mission.description)}<section class="card mission-panel"><div class="notice">Try this mission only if you choose to and it feels safe. If you face pressure, threats, or fear, you can stop; focus on your safety and seek support.</div><h2>Three steps</h2><div class="checklist">${mission.steps.map((step, index) => `<label class="check-row"><input type="checkbox" data-mission="${esc(mission.id)}" data-step="${index}" ${steps[index] ? 'checked' : ''}><span>${esc(step)}</span></label>`).join('')}</div><p data-mission-status class="${missionDone(mission) ? 'success-line' : 'subtle'}">${missionDone(mission) ? 'Mission marked complete ✓' : 'Check off steps as you go. Progress is saved on this device.'}</p></section>`;
}

function renderReview() {
  const due = dueLessons();
  const completed = lessons.filter((lesson) => state.completed[lesson.id]);
  if (!reviewSessionIds) reviewSessionIds = (due.length ? due : completed).slice(0, 4).map((lesson) => lesson.id);
  const shown = reviewSessionIds.map((id) => lessonById.get(id)).filter(Boolean);
  if (!shown.length) return `${heading('REVIEW', 'Make the learning stick.', 'Review questions will appear here once you complete your first lesson.')}<div class="card empty-state"><h2>No completed lessons yet</h2><p>Start with a short lesson. After a correct answer, you can come back to review it later.</p><a class="btn peach" href="#lesson/${esc(lessons[0].id)}">Start the first lesson →</a></div>`;
  return `${heading('REVIEW', due.length ? 'Time to revisit these skills.' : 'Nothing due for review right now.', due.length ? 'Try answering without a hint. A correct answer will schedule the question again in a few days.' : 'You can still practise with lessons you have completed.', `${due.length} due for review`)}<div class="review-list">${shown.map((lesson) => `<section class="card review-card"><h2>${esc(lesson.title)}</h2><p>${esc(lesson.summary)}</p>${renderQuiz(lesson, 'review')}</section>`).join('')}</div>`;
}

function renderProgress() {
  const done = completedCount();
  const missionCount = missions.filter(missionDone).length;
  return `${heading('PROGRESS', 'See how far you have come.', 'A lesson counts as complete after a correct answer. Your notes and checkmarks stay in this browser.', `${Math.round(100 * done / lessons.length)}% of path`)}<div class="progress-summary"><div class="card"><strong>${done} / ${lessons.length}</strong><span>lessons</span></div><div class="card"><strong>${modules.filter((module) => lessons.filter((lesson) => lesson.moduleId === module.id).every((lesson) => state.completed[lesson.id])).length} / ${modules.length}</strong><span>stages</span></div><div class="card"><strong>${missionCount} / ${missions.length}</strong><span>real-life missions</span></div></div><div class="module-list">${modules.map((module) => { const items = lessons.filter((lesson) => lesson.moduleId === module.id); const count = items.filter((lesson) => state.completed[lesson.id]).length; return `<section class="card module-card"><div class="module-top"><div class="module-copy"><h2>${esc(module.title)}</h2><p>${count} of ${items.length} lessons</p></div><a class="btn outline" href="#module/${esc(module.id)}">Open →</a></div>${progressBar(count, items.length)}</section>`; }).join('')}</div><section class="card progress-controls" style="margin-top:18px"><h2>Move your progress</h2><p>Download a file with your progress and notes, then upload it on another device. Keep the file private if your notes contain personal details.</p><div class="actions"><button type="button" class="btn dark" data-export>Download progress</button><label class="btn outline import-label">Upload file<input type="file" accept="application/json,.json" data-import aria-label="Upload progress file"></label></div></section>`;
}

function renderAbout() {
  return `${heading('ABOUT THE APPROACH', 'Differences are a reason to ask, not to assume.', 'Conversation practice for women and men who want to understand each other better.')}<article class="card about-copy"><h2>Where the idea comes from</h2><p>The “Mars and Venus” metaphor from John Gray’s books is a reminder that two people can experience stress and ask for support in different ways. Here it is a starting point for questions, not a rule about how women or men should behave.</p><p>This is an independent educational practice tool. Its lessons and exercises were written for this site; they are neither a retelling of the books nor an official course by the author.</p><h2>How to use it</h2><ul><li>Take a short lesson and check your answer.</li><li>Write your own phrase if you want to use a skill in conversation.</li><li>Come back to review and try one mission in real life.</li></ul><div class="notice">If your relationship involves pressure, threats, or fear, practising together may be inappropriate. Put your safety first and seek support from people or services you trust.</div><h2>Sources and influences</h2><ul class="source-list"><li><a href="https://www.marsvenus.com/books" target="_blank" rel="noopener noreferrer">John Gray’s books</a> — inspiration for the metaphor and relationship themes; not evidence of universal gender differences.</li><li><a href="https://www.gottman.com/about/the-gottman-method/" target="_blank" rel="noopener noreferrer">The Gottman Method</a> — attention to connection, conflict, and repair.</li><li><a href="https://www.nonviolentcommunication.com/pdf_files/nvc2-chapter-one.html" target="_blank" rel="noopener noreferrer">Nonviolent Communication</a> — observations, feelings, needs, and requests.</li><li><a href="https://www.purdue.edu/uns/html4ever/2004/040217.MacGeorge.sexroles.html" target="_blank" rel="noopener noreferrer">Purdue University research</a> — similarities in preferences for supportive communication.</li></ul></article>`;
}

function route() {
  const parts = (location.hash.slice(1) || 'today').split('/');
  const [name, id] = parts;
  if (name === 'lesson' && lessonById.has(id)) return { name, id };
  if (name === 'mission' && missionById.has(id)) return { name, id };
  if (name === 'practice' && id && lessonById.has(id)) return { name: 'practice-item', id };
  if (name === 'module' && modules.some((module) => module.id === id)) return { name: 'path', id };
  if (['today', 'path', 'practice', 'missions', 'review', 'progress', 'about'].includes(name)) return { name };
  return { name: 'today' };
}

function render() {
  const current = route();
  document.querySelector('#language-link').href = `index.html${location.hash}`;
  if (current.name !== 'review') { reviewSessionIds = null; reviewAttempts = {}; }
  const labels = { today: 'Today', path: 'Learning path', lesson: 'Lesson', practice: 'Practice', 'practice-item': 'Practice', missions: 'Real-life missions', mission: 'Mission', review: 'Review', progress: 'Progress', about: 'About' };
  document.querySelector('#breadcrumb').textContent = `Conversation Orbits / ${labels[current.name]}`;
  document.querySelectorAll('[data-nav]').forEach((link) => {
    const nav = current.name === 'lesson' ? 'path' : ['practice-item', 'missions', 'mission'].includes(current.name) ? 'practice' : current.name;
    const active = link.dataset.nav === nav;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  const badge = document.querySelector('#review-badge');
  badge.textContent = dueLessons().length;
  badge.hidden = !dueLessons().length;
  const views = { today: renderToday, path: renderPath, practice: renderPracticeList, missions: renderMissions, review: renderReview, progress: renderProgress, about: renderAbout };
  main.innerHTML = current.name === 'lesson' ? renderLesson(lessonById.get(current.id)) : current.name === 'practice-item' ? renderPracticeItem(lessonById.get(current.id)) : current.name === 'mission' ? renderMission(missionById.get(current.id)) : views[current.name]();
  if (current.id && current.name === 'path') document.querySelector(`#module-${current.id}`)?.scrollIntoView();
  else window.scrollTo({ top: 0, behavior: 'auto' });
}

async function chooseAnswer(id, choice, mode) {
  const lesson = lessonById.get(id);
  if (!lesson || !Number.isInteger(choice) || choice < 0 || choice >= lesson.quiz.choices.length) return;
  const message = lesson.quiz.correct.includes(choice) ? 'Correct — lesson saved to progress' : '';
  if (!await commit(() => store.answer(id, choice, mode), message)) return;
  if (mode === 'review') reviewAttempts[id] = choice;
  const panel = [...main.querySelectorAll('[data-quiz-panel]')].find((item) => item.dataset.quizPanel === id);
  if (panel) {
    panel.outerHTML = renderQuiz(lesson, mode);
    [...main.querySelectorAll('[data-quiz-id]')].find((item) => item.dataset.quizId === id && Number(item.dataset.choice) === choice)?.focus({ preventScroll: true });
  }
  const badge = document.querySelector('#review-badge');
  badge.textContent = dueLessons().length;
  badge.hidden = !dueLessons().length;
}

main.addEventListener('click', async (event) => {
  const quizButton = event.target.closest('[data-quiz-id]');
  if (quizButton) { await chooseAnswer(quizButton.dataset.quizId, Number(quizButton.dataset.choice), quizButton.dataset.mode); return; }
  const copyButton = event.target.closest('[data-copy-example]');
  if (copyButton) {
    const example = lessonById.get(copyButton.dataset.copyExample)?.example;
    if (!example) return;
    try { await navigator.clipboard.writeText(example); showToast('Example copied'); }
    catch { showToast('Could not copy the example'); }
    return;
  }
  const filterButton = event.target.closest('[data-filter]');
  if (filterButton) { filter = filterButton.dataset.filter; render(); return; }
  const noteButton = event.target.closest('[data-save-note]');
  if (noteButton) {
    const input = main.querySelector('#reflection');
    if (!input) return;
    const id = noteButton.dataset.saveNote;
    const value = input.value.slice(0, 2000);
    const expected = noteBaseline;
    if (await commit(() => store.saveNote(id, value, expected), 'Note saved on this device')) {
      // Do not overwrite text typed while the save was waiting for its lock.
      if (main.querySelector('#reflection') === input) noteBaseline = value;
    }
    return;
  }
  if (event.target.closest('[data-export]')) {
    let saved;
    try { saved = store.read(); } catch (error) { storageError(error); return; }
    const blob = new Blob([JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ...saved }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'orbity-obshcheniya-progress.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    showToast('Progress file downloaded');
  }
});

main.addEventListener('change', async (event) => {
  const checkbox = event.target.closest('[data-mission]');
  if (checkbox) {
    const mission = missionById.get(checkbox.dataset.mission);
    const index = Number(checkbox.dataset.step);
    if (!mission || !Number.isInteger(index) || index < 0 || index >= mission.steps.length) return;
    const checked = checkbox.checked;
    if (!await commit(() => store.setMissionStep(mission.id, index, checked))) {
      checkbox.checked = state.missionSteps[mission.id]?.[index] === true;
      return;
    }
    if (route().name !== 'mission' || route().id !== mission.id) return;
    const status = main.querySelector('[data-mission-status]');
    if (!status) return;
    const done = missionDone(mission);
    status.className = done ? 'success-line' : 'subtle';
    status.textContent = done ? 'Mission marked complete ✓' : 'Check off steps as you go. Progress is saved on this device.';
    if (done) showToast('Mission completed');
    return;
  }
  const input = event.target.closest('[data-import]');
  if (!input?.files?.length) return;
  try {
    const file = input.files[0];
    if (file.size > 2_000_000) throw Object.assign(new Error(), { code: 'FILE_TOO_LARGE' });
    let parsed;
    try { parsed = JSON.parse(await file.text()); }
    catch { throw Object.assign(new Error(), { code: 'INVALID_FILE' }); }
    const imported = store.validateImport(parsed);
    const { token } = store.snapshot();
    if (!confirm('Replace current progress with the file’s data?')) return;
    if (await commit(() => store.replace(imported, token), 'Progress imported')) render();
  } catch (error) { storageError(error); }
  finally { input.value = ''; }
});

// Refresh saved progress without re-rendering over an unsaved note.
function refreshProgress() {
  const input = main.querySelector('#reflection');
  const dirty = input && input.value !== noteBaseline;
  try { state = store.read(); } catch (error) { storageError(error); return; }
  if (!dirty) render();
  else {
    const badge = document.querySelector('#review-badge');
    badge.textContent = dueLessons().length;
    badge.hidden = !dueLessons().length;
  }
}
window.addEventListener('storage', (event) => {
  if (event.key === PROGRESS_KEY || event.key === null) refreshProgress();
});
window.addEventListener('focus', refreshProgress);
window.addEventListener('hashchange', render);
render();
if (initialLoadError) storageError(initialLoadError);
