import { modules, lessons, missions } from './course.js';

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
  "INVALID_FILE": "Файл прогресса повреждён или имеет неподдерживаемую структуру.",
  "INVALID_STORED": "Сохранённые данные повреждены. Ничего не перезаписано. В разделе «Прогресс» можно загрузить исправную копию.",
  "STORAGE_FAILED": "Не удалось сохранить или прочитать прогресс. Изменения не подтверждены; черновик заметки сохранён в этой вкладке.",
  "LOCK_UNAVAILABLE": "Безопасное сохранение недоступно. Скопируйте заметку и откройте сайт по HTTPS в современном браузере.",
  "LOCK_TIMEOUT": "Другая вкладка занята сохранением. Ничего не записано; попробуйте снова.",
  "NOTE_CONFLICT": "Заметка изменена в другой вкладке. Скопируйте свой черновик, затем перезагрузите страницу для сравнения.",
  "IMPORT_CONFLICT": "Прогресс изменился в другой вкладке. Импорт отменён; проверьте данные и повторите.",
  "FILE_TOO_LARGE": "Файл слишком большой.",
  "FLOW_CONFLICT": "Тема изменена в другой вкладке. Откройте выбор темы снова.",
  "UNSAVED_NOTES": "Сначала сохраните или скопируйте несохранённые заметки. Импорт не выполнен."
};
const drafts = new Map();
let initialLoadError;
let lastRefreshError;
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
  noteStatus(id, "Сохраняем заметку…");
  // Each edit uses the baseline established by the preceding successful save.
  // A rejected save never advances that baseline or replaces a competing note.
  draft.chain = draft.chain.then(async () => {
    const ok = await commit(() => store.saveNote(id, value, draft.base));
    if (ok) draft.base = value;
    draft.pending--;
    if (!draft.pending) noteStatus(id, ok ? "Заметка сохранена на этом устройстве." : toast.textContent);
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
  const track = progress === null ? '' : '<div class="flow-track" role="progressbar" aria-label="Прогресс текущего упражнения" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '"><span class="flow-fill" style="width:' + progress + '%"></span></div>';
  return '<section class="flow-screen">' +
    (back ? '<a class="text-link flow-back" href="' + back + '">← Назад</a>' : '') +
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
    return flow('ВАШ СЛЕДУЮЩИЙ ШАГ', null,
      '<h1 class="flow-title" tabindex="-1">Продолжим с того же места?</h1>' +
      '<p class="flow-intro">' + (step < 3 ? 'Продолжайте с вопроса ' + (step + 1) + ' из 3.' : 'Три вопроса готовы. Посмотрите результат и переходите к урокам.') + '</p>' +
      '<div class="flow-actions">' + primary(step < 3 ? '#guided/' + step : '#guided-done', 'Продолжить') + '</div>' +
      '<a class="text-link" href="#start">Выбрать другую тему</a>');
  }
  if (!next) {
    return flow('МАРШРУТ ЗАВЕРШЁН', null,
      '<h1 class="flow-title" tabindex="-1">Вы прошли все уроки.</h1>' +
      '<p class="flow-intro">Навыки закрепляются в разговоре. Вернитесь к одной ситуации, когда она понадобится.</p>' +
      '<div class="flow-actions">' + primary('#review', 'Повторить навык') + '</div>' +
      '<a class="text-link" href="#path">Вся программа</a>');
  }
  if (done === 0) {
    return flow('ОДНА СИТУАЦИЯ · ПАРА МИНУТ', null,
      '<h1 class="flow-title" tabindex="-1">Начните с одного вопроса.</h1>' +
      '<p class="flow-intro">Выберите ситуацию в отношениях, ответьте на вопрос и получите короткий разбор.</p>' +
      '<div class="flow-actions">' + primary('#start', 'Начать') + '</div>');
  }
  return flow('ВАШ СЛЕДУЮЩИЙ ШАГ', null,
    '<h1 class="flow-title" tabindex="-1">' + esc(next.title) + '</h1>' +
    '<p class="flow-intro">Одна мысль, один вопрос и короткий разбор.</p>' +
    '<div class="flow-actions">' + primary('#lesson/' + esc(next.id), 'Продолжить') + '</div>' +
    '<a class="text-link" href="#start">Выбрать другую тему</a>');
}

function renderTopics() {
  const options = [
    ['listening', 'Меня не слышат'],
    ['conflict', 'Разговор быстро становится спором'],
    ['needs', 'Трудно сказать, что мне нужно'],
  ];
  const body = '<h1 class="flow-title" tabindex="-1" id="topic-question">Что сейчас хочется улучшить?</h1>' +
    '<p class="flow-intro">Выберите то, что ближе. Тему можно сменить позже.</p>' +
    '<div class="topic-list" role="group" aria-labelledby="topic-question">' +
    options.map(([id, label]) => '<button type="button" class="topic-option" data-topic="' + id + '">' + esc(label) + ' <span aria-hidden="true">→</span></button>').join('') +
    '</div>';
  return flow('ШАГ 1 · ВЫБОР ТЕМЫ', 0, body, '#today');
}

function resultDetails(lesson) {
  const draft = draftFor(lesson.id);
  return '<details class="note-disclosure"><summary>Пример и своя заметка</summary>' +
    '<p class="example-text">' + esc(lesson.example) + '</p>' +
    '<button type="button" class="secondary-button" data-copy-example="' + esc(lesson.id) + '">Скопировать пример</button>' +
    '<label for="note-' + esc(lesson.id) + '">Как вы примените это?</label>' +
    '<textarea id="note-' + esc(lesson.id) + '" data-note-id="' + esc(lesson.id) + '" maxlength="2000" rows="3" placeholder="Запишите свою фразу, если хотите">' + esc(draft.value) + '</textarea>' +
    '<p class="fine-print">Заметка сохраняется только в этом браузере.</p>' +
    '<p class="fine-print" data-note-status="' + esc(lesson.id) + '" role="status">' + esc(draft.status) + '</p>' +
    '<button type="button" class="secondary-button" data-save-note="' + esc(lesson.id) + '">Повторить сохранение</button></details>';
}

function questionScreen(lesson, mode, meta, progress, completedProgress, back, continueHtml) {
  const key = mode + ':' + lesson.id;
  const picked = attempts[key];
  if (Number.isInteger(picked)) {
    const correct = lesson.quiz.correct.includes(picked);
    if (!correct) {
      const body = '<p class="eyebrow">КОРОТКИЙ РАЗБОР</p>' +
        '<h1 class="flow-title" tabindex="-1">Попробуйте другой ответ.</h1>' +
        '<p class="flow-intro">' + esc(lesson.principle) + '</p>' +
        '<div class="result bad">Вы выбрали: ' + esc(lesson.quiz.choices[picked]) + '</div>' +
        '<div class="flow-actions"><button type="button" class="primary-button" data-retry="' + esc(lesson.id) + '" data-mode="' + mode + '">Выбрать другой ответ →</button></div>';
      return flow(meta, progress, body, back);
    }
    const body = '<p class="eyebrow">КОРОТКИЙ РАЗБОР</p>' +
      '<h1 class="flow-title" tabindex="-1">Да, так будет понятнее.</h1>' +
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
    ? primary('#guided/' + (index + 1), 'Следующий вопрос')
    : primary('#guided-done', 'Посмотреть результат');
  const back = index && Number.isInteger(attempts['guided:' + ids[index - 1]]) ? '#guided/' + (index - 1) : '#start';
  return questionScreen(lesson, 'guided', 'ВОПРОС ' + (index + 1) + ' ИЗ 3', Math.round((index / 3) * 100), Math.round(((index + 1) / 3) * 100), back, next);
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
  return flow('ТРИ ВОПРОСА ПРОЙДЕНЫ', 100,
    '<h1 class="flow-title" tabindex="-1">Начните с темы «' + esc(module.title) + '».</h1>' +
    '<p class="flow-intro">Вы уже попробовали несколько ситуаций. Дальше — короткий урок и ещё один практический вопрос.</p>' +
    '<div class="flow-actions">' + primary(next ? '#lesson/' + esc(next.id) : '#review', next ? 'Продолжить тему' : 'Повторить навык') + '</div>' +
    '<a class="text-link" href="#path">Все темы и уроки</a>');
}

function renderLesson(lesson) {
  const phase = phases[lesson.id] || 'idea';
  if (phase === 'idea') {
    const body = '<p class="eyebrow">' + esc(moduleOf(lesson).title) + '</p>' +
      '<h1 class="flow-title" tabindex="-1">' + esc(lesson.title) + '</h1>' +
      '<p class="flow-intro">' + esc(lesson.principle) + '</p>' +
      '<div class="flow-actions"><button type="button" class="primary-button" data-open-question="' + esc(lesson.id) + '">К вопросу <span aria-hidden="true">→</span></button></div>';
    return flow('ШАГ 1 ИЗ 2 · ' + lesson.minutes + ' МИН', 0, body, '#path');
  }
  const next = nextAfter(lesson);
  const more = primary(next ? '#lesson/' + esc(next.id) : '#progress', next ? 'Следующий урок' : 'Посмотреть прогресс');
  return questionScreen(lesson, 'lesson', 'ШАГ 2 ИЗ 2', 50, 100, '#path', more);
}

function renderPractice(id) {
  const lesson = (id && byLesson.get(id)) || recommended() || lessons[0];
  const next = lessons[(lessons.indexOf(lesson) + 1) % lessons.length];
  return questionScreen(lesson, 'practice', 'ОДНА СИТУАЦИЯ', null, null, '#today', primary('#practice/' + esc(next.id), 'Следующая ситуация'));
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
    return flow('ПОВТОРЕНИЕ', null,
      '<h1 class="flow-title" tabindex="-1">Сначала пройдите один урок.</h1>' +
      '<p class="flow-intro">После него здесь появится вопрос, к которому можно вернуться.</p>' +
      '<div class="flow-actions">' + primary('#today', 'Начать') + '</div>');
  }
  if (reviewPosition >= reviewQueue.length) {
    return flow('ПОВТОРЕНИЕ ЗАВЕРШЕНО', 100,
      '<h1 class="flow-title" tabindex="-1">Вы освежили навыки.</h1>' +
      '<p class="flow-intro">Вернитесь к ним в следующем разговоре.</p>' +
      '<div class="flow-actions">' + primary('#today', 'К следующему шагу') + '</div>');
  }
  const lesson = byLesson.get(reviewQueue[reviewPosition]);
  const nextButton = '<button type="button" class="primary-button" data-next-review>Следующий вопрос <span aria-hidden="true">→</span></button>';
  return questionScreen(lesson, 'review', 'ВОПРОС ' + (reviewPosition + 1) + ' ИЗ ' + reviewQueue.length,
    Math.round((reviewPosition / reviewQueue.length) * 100), Math.round(((reviewPosition + 1) / reviewQueue.length) * 100), '#today', nextButton);
}

function renderPath(selectedId) {
  const next = recommended();
  const intro = '<div class="section-page"><p class="eyebrow">ПРОГРАММА</p><h1 tabindex="-1">Выберите тему.</h1>' +
    '<p class="flow-intro">Можно идти по порядку или открыть то, что нужно сейчас.</p>' +
    (next ? '<div class="flow-actions">' + primary('#lesson/' + esc(next.id), 'Продолжить с текущего шага') + '</div>' : '');
  const list = modules.map((module) => {
    const items = lessons.filter((item) => item.moduleId === module.id);
    const count = items.filter((item) => state.completed[item.id]).length;
    return '<details class="accordion"' + (module.id === selectedId ? ' open' : '') + '><summary><span>' + esc(module.title) + '</span><small>' + count + ' из ' + items.length + '</small></summary>' +
      '<p>' + esc(module.description) + '</p><div class="lesson-list">' +
      items.map((lesson) => '<a href="#lesson/' + esc(lesson.id) + '">' + esc(lesson.title) + (state.completed[lesson.id] ? ' <span aria-label="Пройдено">✓</span>' : '') + '</a>').join('') +
      '</div></details>';
  }).join('');
  return intro + '<div class="accordion-list">' + list + '</div><a class="text-link" href="#missions">6 заданий для жизни</a></div>';
}

function renderMissions() {
  const first = missions.find((item) => !missionDone(item)) || missions[0];
  const others = missions.filter((item) => item.id !== first.id);
  return '<div class="section-page"><p class="eyebrow">ПРАКТИКА В ЖИЗНИ</p><h1 tabindex="-1">Попробуйте один шаг.</h1>' +
    '<p class="fine-print">Выбирайте только безопасную и добровольную ситуацию.</p>' +
    '<div class="flow-card"><h2>' + esc(first.title) + '</h2><p class="flow-intro">' + esc(first.description) + '</p>' +
    '<div class="flow-actions">' + primary('#mission/' + esc(first.id), missionDone(first) ? 'Открыть снова' : 'Начать задание') + '</div></div>' +
    '<details class="accordion"><summary>Другие задания</summary><div class="lesson-list">' +
    others.map((item) => '<a href="#mission/' + esc(item.id) + '">' + esc(item.title) + '</a>').join('') +
    '</div></details></div>';
}

function renderMission(mission) {
  const steps = state.missionSteps[mission.id] || [];
  const index = mission.steps.findIndex((_, step) => !steps[step]);
  if (index < 0) {
    return flow('ЗАДАНИЕ ВЫПОЛНЕНО', 100,
      '<h1 class="flow-title" tabindex="-1">' + esc(mission.title) + '</h1>' +
      '<p class="flow-intro">Вы отметили все три шага. Если захотите, вернитесь к этому разговору позже.</p>' +
      '<div class="flow-actions">' + primary('#missions', 'К другим заданиям') + '</div>');
  }
  const body = '<p class="eyebrow">' + esc(mission.title) + '</p>' +
    '<h1 class="flow-title" tabindex="-1">' + esc(mission.steps[index]) + '</h1>' +
    '<div class="flow-actions"><button type="button" class="primary-button" data-mission-complete="' + esc(mission.id) + '" data-step="' + index + '">Отметить выполненным <span aria-hidden="true">→</span></button></div>' +
    '<p class="fine-print safety-note">При давлении, угрозах или страхе можно остановиться. Сначала позаботьтесь о безопасности и обратитесь за поддержкой.</p>' +
    (index > 0 ? '<button type="button" class="text-link as-button" data-mission-undo="' + esc(mission.id) + '" data-step="' + (index - 1) + '">Вернуться к предыдущему шагу</button>' : '');
  return flow('ШАГ ' + (index + 1) + ' ИЗ ' + mission.steps.length, Math.round((index / mission.steps.length) * 100), body, '#missions');
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
  return '<div class="section-page"><p class="eyebrow">ВАШ ПРОГРЕСС</p><h1 tabindex="-1">' + done + ' из ' + lessons.length + ' уроков.</h1>' +
    '<div class="flow-track" role="progressbar" aria-label="Пройденные уроки" aria-valuemin="0" aria-valuemax="' + lessons.length + '" aria-valuenow="' + done + '"><span class="flow-fill" style="width:' + percent + '%"></span></div>' +
    '<p class="flow-intro">Здесь отмечены пройденные уроки. Повторение поможет закрепить ответы.</p>' +
    '<div class="flow-actions">' + primary(next ? '#lesson/' + esc(next.id) : '#review', next ? 'Продолжить' : 'Повторить') + '</div>' +
    '<details class="accordion"><summary>Прогресс по темам</summary>' + detail + '</details>' +
    '<details class="accordion"><summary>Перенести прогресс</summary><p>Файл содержит ваши отметки и личные заметки. Храните его у себя.</p>' +
    '<div class="transfer-actions"><button type="button" class="secondary-button" data-export>Скачать файл</button>' +
    '<label class="secondary-button import-label">Загрузить файл<input type="file" accept="application/json,.json" data-import aria-label="Загрузить файл прогресса"></label></div></details></div>';
}

function renderAbout() {
  return '<div class="section-page"><p class="eyebrow">О ПОДХОДЕ</p><h1 tabindex="-1">Меньше догадок. Больше вопросов.</h1>' +
    '<p class="flow-intro">Метафора «Марса и Венеры» напоминает, что люди могут по-разному просить поддержку. Навык — уточнять потребность конкретного человека, не делать вывод по его полу.</p>' +
    '<p class="flow-intro">Это независимый образовательный тренажёр с оригинальными упражнениями, а не пересказ книг или официальный курс.</p>' +
    '<details class="accordion"><summary>Источники подхода</summary><ul class="source-list">' +
    '<li><a href="https://www.marsvenus.com/books" target="_blank" rel="noopener noreferrer">Книги Джона Грэя</a> — источник метафоры и тем.</li>' +
    '<li><a href="https://www.gottman.com/about/the-gottman-method/" target="_blank" rel="noopener noreferrer">Метод Готтмана</a> — разговор, конфликт и восстановление.</li>' +
    '<li><a href="https://www.nonviolentcommunication.com/pdf_files/nvc2-chapter-one.html" target="_blank" rel="noopener noreferrer">Nonviolent Communication</a> — наблюдение, чувство, потребность и просьба.</li>' +
    '<li><a href="https://www.purdue.edu/uns/html4ever/2004/040217.MacGeorge.sexroles.html" target="_blank" rel="noopener noreferrer">Исследование Университета Пердью</a> — сходство предпочтений в поддержке.</li></ul></details>' +
    '<p class="fine-print">Если в отношениях есть давление, угрозы или страх, парное упражнение может быть неуместно. Важнее безопасность и поддержка людей или служб, которым вы доверяете.</p></div>';
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
  const languageLink = document.querySelector('#language-link');
  if (languageLink) languageLink.href = 'en.html' + location.hash;
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
  if (progress) progress.textContent = doneCount() ? 'Пройдено: ' + doneCount() : 'Вы на старте';
  const badge = document.querySelector('#review-badge');
  if (badge) {
    const due = dueLessons().length;
    badge.textContent = String(due);
    badge.hidden = !due;
  }
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
    try { await navigator.clipboard.writeText(example); announce('Пример скопирован'); }
    catch { announce('Не удалось скопировать пример'); }
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
    announce('Файл прогресса скачан');
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
    const { token } = store.snapshot({ allowInvalid: true });
    if (!confirm('Заменить текущий прогресс данными из файла?')) return;
    if (await commit(() => store.replace(imported, token), 'Прогресс загружен')) {
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
  let latest;
  try { latest = store.read(); lastRefreshError = null; }
  catch (error) {
    const code = error?.code || 'STORAGE_FAILED';
    if (code !== lastRefreshError) storageError(error);
    lastRefreshError = code;
    return;
  }
  if (JSON.stringify(latest) === JSON.stringify(state)) return;
  state = latest;
  for (const [id, draft] of drafts) {
    if (!draft.pending && draft.value === draft.base) drafts.delete(id);
  }
  // Never replace an editor containing pending or failed text with remote state.
  if (hasUnsavedNotes()) return;
  const x = window.scrollX || 0;
  const y = window.scrollY || 0;
  const open = [...main.querySelectorAll('details')].map((item) => item.open);
  const active = document.activeElement;
  const focusedId = active?.id;
  const selection = typeof active?.selectionStart === 'number'
    ? [active.selectionStart, active.selectionEnd] : null;
  render();
  main.querySelectorAll('details').forEach((item, index) => { item.open = open[index] === true; });
  if (focusedId) {
    const replacement = document.getElementById?.(focusedId);
    replacement?.focus({ preventScroll: true });
    if (selection) replacement?.setSelectionRange?.(...selection);
  }
  window.scrollTo({ left: x, top: y, behavior: 'auto' });
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
if (initialLoadError) { storageError(initialLoadError); lastRefreshError = initialLoadError.code; }
