import { modules, lessons, missions } from './course.js';

const KEY = 'orbity-dialoga-progress-v1';
const day = 24 * 60 * 60 * 1000;
const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
const missionById = new Map(missions.map((mission) => [mission.id, mission]));
const main = document.querySelector('#main');
const toast = document.querySelector('#toast');
let filter = 'all';
let toastTimer;
let reviewSessionIds = null;
let reviewAttempts = {};

function emptyState() {
  return { completed: {}, answers: {}, notes: {}, review: {}, missionSteps: {} };
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return normalizeState(raw);
  } catch {
    return emptyState();
  }
}

function normalizeState(raw) {
  const clean = emptyState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return clean;
  for (const lesson of lessons) {
    const id = lesson.id;
    if (Number.isFinite(raw.completed?.[id])) clean.completed[id] = raw.completed[id];
    if (Number.isInteger(raw.answers?.[id]) && raw.answers[id] >= 0 && raw.answers[id] < lesson.quiz.choices.length) clean.answers[id] = raw.answers[id];
    if (typeof raw.notes?.[id] === 'string') clean.notes[id] = raw.notes[id].slice(0, 2000);
    if (Number.isFinite(raw.review?.[id])) clean.review[id] = raw.review[id];
  }
  for (const mission of missions) {
    const steps = raw.missionSteps?.[mission.id];
    if (Array.isArray(steps)) clean.missionSteps[mission.id] = mission.steps.map((_, index) => steps[index] === true);
  }
  return clean;
}

let state = loadState();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { showToast('Не удалось сохранить прогресс в этом браузере'); }
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
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
  return `<div class="progress-track" role="progressbar" aria-label="Прогресс модуля" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${count}"><div class="progress-fill" style="width:${percent}%"></div></div>`;
}

function renderToday() {
  const next = nextLesson();
  const number = lessons.indexOf(next) + 1;
  const moduleIndex = modules.findIndex((module) => module.id === next.moduleId);
  const module = modules[moduleIndex];
  const done = completedCount();
  const finished = done === lessons.length;
  return `${heading('ОРБИТЫ ОБЩЕНИЯ · СЕГОДНЯ', finished ? 'Ты прошёл(ла) весь маршрут.' : 'Лучший разговор начинается с вопроса.', finished ? 'Возвращайся к практике и пробуй навыки в реальных разговорах.' : 'Один урок, одна ситуация и немного больше ясности между вами.', `${String(moduleIndex + 1).padStart(2, '0')} / 08 · ${module.title}`)}
    <div class="dashboard-grid">
      <section class="feature"><p class="eyebrow">${finished ? 'ПОВТОРИ И ПРИМЕНИ' : 'ТВОЙ СЛЕДУЮЩИЙ ШАГ'}</p><h2>${esc(next.title)}</h2><p>${esc(next.summary)}</p><div class="feature-meta"><span class="tag">${esc(module.title)}</span><span class="tag">${next.minutes} минут</span><span class="tag">Урок ${number} / ${lessons.length}</span></div><a class="btn peach" href="#lesson/${esc(next.id)}">${finished ? 'Повторить урок' : 'Начать урок'} <span aria-hidden="true">→</span></a></section>
      <section class="practice-card"><p class="eyebrow">ПОПРОБУЙ СЕЙЧАС</p><div class="sample-dialog"><span class="bubble incoming">У меня был тяжёлый день.</span><span class="bubble outgoing">Хочешь, я просто послушаю или вместе подумаем, что делать?</span></div><h2>Меньше угадывать</h2><p>Один короткий вопрос поможет попробовать навык сразу.</p><a class="btn outline" href="#practice/listening-3">Попробовать за 1 минуту →</a></section>
    </div><div class="stats"><div class="stat"><strong>${done} / ${lessons.length}</strong><span>уроков пройдено</span></div><div class="stat"><strong>${dueLessons().length}</strong><span>уроков к повторению</span></div><div class="stat"><strong>${missions.filter(missionDone).length} / ${missions.length}</strong><span>заданий для жизни</span></div></div>`;
}

function renderPath() {
  const cards = modules.map((module, moduleIndex) => {
    const items = lessons.filter((lesson) => lesson.moduleId === module.id);
    const count = items.filter((lesson) => state.completed[lesson.id]).length;
    return `<section class="card module-card" id="module-${esc(module.id)}"><div class="module-top"><span class="module-number">${String(moduleIndex + 1).padStart(2, '0')}</span><div class="module-copy"><h2>${esc(module.title)}</h2><p>${esc(module.description)}</p></div><span class="module-count">${count} / ${items.length}</span></div>${progressBar(count, items.length)}<div class="lesson-list">${items.map((lesson, index) => `<a class="lesson-link ${state.completed[lesson.id] ? 'done' : ''}" href="#lesson/${esc(lesson.id)}"><span class="lesson-index">${state.completed[lesson.id] ? '✓' : String(index + 1).padStart(2, '0')}</span><span>${esc(lesson.title)}</span><small>${lesson.minutes} мин</small></a>`).join('')}</div></section>`;
  }).join('');
  const missionCards = missions.map((mission) => `<section class="card mission-card"><h2>${esc(mission.title)} ${missionDone(mission) ? '<span aria-label="Выполнено">✓</span>' : ''}</h2><p>${esc(mission.description)}</p><a class="btn outline" href="#mission/${esc(mission.id)}">${missionDone(mission) ? 'Открыть снова' : 'Открыть задание'} →</a></section>`).join('');
  return `${heading('ПРОГРАММА · 8 ЭТАПОВ', 'Маршрут к более ясному диалогу.', '32 коротких урока. Проходи по порядку или начни с темы, которая нужна сейчас.', `${completedCount()} / ${lessons.length} уроков`)}<div class="module-list">${cards}</div><div class="toolbar" style="margin-top:34px"><div><p class="eyebrow">ПРИМЕНИ В ЖИЗНИ</p><h2>6 заданий для разговора</h2></div></div><div class="mission-list">${missionCards}</div>`;
}

function renderQuiz(lesson, mode = 'lesson') {
  const picked = mode === 'review' ? reviewAttempts[lesson.id] : state.answers[lesson.id];
  const correct = lesson.quiz.correct.includes(picked);
  const answered = Number.isInteger(picked);
  return `<div class="quiz" data-quiz-panel="${esc(lesson.id)}"><p class="eyebrow">ПРОВЕРЬ СЕБЯ</p><p class="quiz-prompt">${esc(lesson.quiz.prompt)}</p><div class="choices" role="group" aria-label="Варианты ответа">${lesson.quiz.choices.map((choice, index) => `<button type="button" class="choice ${answered && picked === index ? (correct ? 'correct' : 'wrong') : ''}" data-quiz-id="${esc(lesson.id)}" data-choice="${index}" data-mode="${mode}">${esc(choice)}</button>`).join('')}</div>${answered ? `<div class="feedback ${correct ? '' : 'error'}" role="status"><strong>${correct ? 'Верно.' : 'Попробуй ещё.'}</strong> ${esc(lesson.quiz.explanation)}</div>` : ''}</div>`;
}

function renderLesson(lesson) {
  const index = lessons.indexOf(lesson);
  const module = modules.find((item) => item.id === lesson.moduleId);
  const next = lessons[index + 1];
  return `<a class="back-link" href="#path">← К программе</a>${heading(`УРОК ${index + 1} / ${lessons.length} · ${module.title.toUpperCase()}`, lesson.title, lesson.summary, `${lesson.minutes} минут`)}<div class="lesson-layout"><article class="card reading"><h2>Разберёмся</h2><p class="intro">${esc(lesson.summary)}</p><div class="content-block"><h3>Главная мысль</h3><p>${esc(lesson.principle)}</p></div><div class="content-block"><h3>Как это звучит</h3><div class="example">${esc(lesson.example)}</div></div><div class="content-block"><h3>Попробуй в жизни</h3><p>${esc(lesson.action)}</p></div>${next ? `<a class="btn outline next-link" href="#lesson/${esc(next.id)}">Следующий урок →</a>` : `<a class="btn outline next-link" href="#path">Вся программа →</a>`}</article><aside class="card exercise-panel">${renderQuiz(lesson)}<div class="note-box"><label for="reflection">Своя фраза или наблюдение</label><p>Запиши, как применишь навык. Заметка остаётся в этом браузере и попадает в экспорт прогресса.</p><textarea id="reflection" class="note-input" maxlength="2000" placeholder="Например: сначала уточню, нужен ли совет…">${esc(state.notes[lesson.id] || '')}</textarea><button type="button" class="btn dark" data-save-note="${esc(lesson.id)}">Сохранить заметку</button></div></aside></div>`;
}

function renderPracticeList() {
  const displayed = filter === 'all' ? lessons : lessons.filter((lesson) => lesson.moduleId === filter);
  return `${heading('ПРАКТИКА · 32 ПРОВЕРКИ', 'Выбери ситуацию и попробуй ответить.', 'Каждый ответ сопровождается объяснением. Ошибку можно исправить сразу.', `${displayed.length} заданий`)}<div class="toolbar"><div class="filters" aria-label="Темы практики"><button type="button" class="filter-btn ${filter === 'all' ? 'active' : ''}" data-filter="all">Все</button>${modules.map((module) => `<button type="button" class="filter-btn ${filter === module.id ? 'active' : ''}" data-filter="${esc(module.id)}">${esc(module.title)}</button>`).join('')}</div><a class="btn outline" href="#missions">6 заданий для жизни →</a></div><div class="practice-list">${displayed.map((lesson) => { const module = modules.find((item) => item.id === lesson.moduleId); return `<section class="card practice-item"><p class="eyebrow">${esc(module.title)}</p><h2>${esc(lesson.title)}</h2><p>${esc(lesson.quiz.prompt)}</p><a class="btn outline" href="#practice/${esc(lesson.id)}">Разобрать ситуацию →</a></section>`; }).join('')}</div>`;
}

function renderPracticeItem(lesson) {
  const index = lessons.indexOf(lesson);
  const next = lessons[(index + 1) % lessons.length];
  const module = modules.find((item) => item.id === lesson.moduleId);
  return `<a class="back-link" href="#practice">← Все ситуации</a>${heading(`ПРАКТИКА · ${module.title.toUpperCase()}`, lesson.title, lesson.summary)}<div class="practice-layout"><section class="card exercise-panel">${renderQuiz(lesson, 'practice')}</section><aside class="card side-panel"><h2>Сделай шаг дальше</h2><p>${esc(lesson.action)}</p><div class="phrase-example"><p class="eyebrow">ПРИМЕР ДЛЯ РАЗГОВОРА</p><blockquote>${esc(lesson.example)}</blockquote><button type="button" class="btn outline" data-copy-example="${esc(lesson.id)}">Скопировать пример</button></div><div class="actions"><a class="btn outline" href="#lesson/${esc(lesson.id)}">Прочитать урок →</a><a class="btn outline" href="#practice/${esc(next.id)}">Следующая ситуация →</a></div></aside></div>`;
}

function renderMissions() {
  return `<a class="back-link" href="#practice">← К практике</a>${heading('ПРАКТИКА В ЖИЗНИ', 'Шесть разговоров, которые можно провести.', 'Это небольшие шаги, а не экзамен. Делай только то, что безопасно и уместно в твоей ситуации.', `${missions.filter(missionDone).length} / ${missions.length} выполнено`)}<div class="mission-list">${missions.map((mission) => `<section class="card mission-card"><p class="eyebrow">${missionDone(mission) ? 'ВЫПОЛНЕНО' : 'ЗАДАНИЕ'}</p><h2>${esc(mission.title)}</h2><p>${esc(mission.description)}</p><a class="btn outline" href="#mission/${esc(mission.id)}">Открыть →</a></section>`).join('')}</div>`;
}

function renderMission(mission) {
  const steps = state.missionSteps[mission.id] || [];
  return `<a class="back-link" href="#missions">← К заданиям</a>${heading('ПРАКТИКА В ЖИЗНИ', mission.title, mission.description)}<section class="card mission-panel"><div class="notice">Делай это задание только добровольно и когда это безопасно. При давлении, угрозах или страхе можно остановиться; сначала позаботься о безопасности и обратись за поддержкой.</div><h2>Три шага</h2><div class="checklist">${mission.steps.map((step, index) => `<label class="check-row"><input type="checkbox" data-mission="${esc(mission.id)}" data-step="${index}" ${steps[index] ? 'checked' : ''}><span>${esc(step)}</span></label>`).join('')}</div><p data-mission-status class="${missionDone(mission) ? 'success-line' : 'subtle'}">${missionDone(mission) ? 'Задание отмечено как выполненное ✓' : 'Отмечай шаги по мере выполнения. Прогресс хранится на этом устройстве.'}</p></section>`;
}

function renderReview() {
  const due = dueLessons();
  const completed = lessons.filter((lesson) => state.completed[lesson.id]);
  if (!reviewSessionIds) reviewSessionIds = (due.length ? due : completed).slice(0, 4).map((lesson) => lesson.id);
  const shown = reviewSessionIds.map((id) => lessonById.get(id)).filter(Boolean);
  if (!shown.length) return `${heading('ПОВТОРЕНИЕ', 'Закрепим то, что получилось.', 'После первого пройденного урока здесь появятся вопросы для повторения.')}<div class="card empty-state"><h2>Пока нет пройденных уроков</h2><p>Начни с короткого урока. После верного ответа мы предложим вернуться к нему позже.</p><a class="btn peach" href="#lesson/${esc(lessons[0].id)}">Начать первый урок →</a></div>`;
  return `${heading('ПОВТОРЕНИЕ', due.length ? 'Эти навыки пора освежить.' : 'Сейчас повторение не обязательно.', due.length ? 'Попробуй ответить без подсказки. После верного ответа вопрос вернётся через несколько дней.' : 'Можно потренироваться заранее на уже пройденных уроках.', `${due.length} к повторению`)}<div class="review-list">${shown.map((lesson) => `<section class="card review-card"><h2>${esc(lesson.title)}</h2><p>${esc(lesson.summary)}</p>${renderQuiz(lesson, 'review')}</section>`).join('')}</div>`;
}

function renderProgress() {
  const done = completedCount();
  const missionCount = missions.filter(missionDone).length;
  return `${heading('ПРОГРЕСС', 'Сколько уже получилось.', 'Урок считается пройденным после верного ответа. Личные заметки и отметки остаются в браузере.', `${Math.round(100 * done / lessons.length)}% маршрута`)}<div class="progress-summary"><div class="card"><strong>${done} / ${lessons.length}</strong><span>уроков</span></div><div class="card"><strong>${modules.filter((module) => lessons.filter((lesson) => lesson.moduleId === module.id).every((lesson) => state.completed[lesson.id])).length} / ${modules.length}</strong><span>этапов</span></div><div class="card"><strong>${missionCount} / ${missions.length}</strong><span>заданий для жизни</span></div></div><div class="module-list">${modules.map((module) => { const items = lessons.filter((lesson) => lesson.moduleId === module.id); const count = items.filter((lesson) => state.completed[lesson.id]).length; return `<section class="card module-card"><div class="module-top"><div class="module-copy"><h2>${esc(module.title)}</h2><p>${count} из ${items.length} уроков</p></div><a class="btn outline" href="#module/${esc(module.id)}">Открыть →</a></div>${progressBar(count, items.length)}</section>`; }).join('')}</div><section class="card progress-controls" style="margin-top:18px"><h2>Перенести прогресс</h2><p>Скачай файл с отметками и личными заметками, затем загрузи его на другом устройстве. Не передавай файл другим людям, если в заметках есть личное.</p><div class="actions"><button type="button" class="btn dark" data-export>Скачать прогресс</button><label class="btn outline import-label">Загрузить файл<input type="file" accept="application/json,.json" data-import aria-label="Загрузить файл прогресса"></label></div></section>`;
}

function renderAbout() {
  return `${heading('О ПОДХОДЕ', 'Различия — повод спросить, а не угадать.', 'Практика общения для женщин и мужчин, которые хотят лучше понимать друг друга.')}<article class="card about-copy"><h2>Откуда идея</h2><p>Метафора «Марса и Венеры» из книг Джона Грэя напоминает, что два человека могут по-разному переживать стресс и просить о поддержке. Здесь это отправная точка для вопросов, а не правило о том, как должны вести себя женщины или мужчины.</p><p>Это независимый образовательный тренажёр. Уроки и упражнения написаны специально для сайта; это не пересказ книг и не официальный курс автора.</p><h2>Как заниматься</h2><ul><li>Пройди короткий урок и проверь ответ.</li><li>Запиши свою фразу, если хочешь применить навык в разговоре.</li><li>Вернись к повторению и попробуй одно задание в жизни.</li></ul><div class="notice">Если в отношениях есть давление, угрозы или страх, парные упражнения могут быть неуместны. Приоритет — безопасность и поддержка людей или служб, которым ты доверяешь.</div><h2>На чём основаны упражнения</h2><ul class="source-list"><li><a href="https://www.marsvenus.com/books" target="_blank" rel="noopener noreferrer">Книги Джона Грэя</a> — источник метафоры и тем отношений; не доказательство универсальных различий по полу.</li><li><a href="https://www.gottman.com/about/the-gottman-method/" target="_blank" rel="noopener noreferrer">Метод Готтмана</a> — внимание к контакту, конфликту и восстановлению.</li><li><a href="https://www.nonviolentcommunication.com/pdf_files/nvc2-chapter-one.html" target="_blank" rel="noopener noreferrer">Nonviolent Communication</a> — наблюдение, чувство, потребность и просьба.</li><li><a href="https://www.purdue.edu/uns/html4ever/2004/040217.MacGeorge.sexroles.html" target="_blank" rel="noopener noreferrer">Исследование Университета Пердью</a> — сходство предпочтений в поддерживающем общении.</li></ul></article>`;
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
  document.querySelector('#language-link').href = `en.html${location.hash}`;
  if (current.name !== 'review') { reviewSessionIds = null; reviewAttempts = {}; }
  const labels = { today: 'Сегодня', path: 'Программа', lesson: 'Урок', practice: 'Практика', 'practice-item': 'Практика', missions: 'Задания для жизни', mission: 'Задание', review: 'Повторение', progress: 'Прогресс', about: 'О подходе' };
  document.querySelector('#breadcrumb').textContent = `Орбиты общения / ${labels[current.name]}`;
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

function chooseAnswer(id, choice, mode) {
  const lesson = lessonById.get(id);
  if (!lesson || !Number.isInteger(choice) || choice < 0 || choice >= lesson.quiz.choices.length) return;
  if (mode === 'review') reviewAttempts[id] = choice;
  else state.answers[id] = choice;
  if (lesson.quiz.correct.includes(choice)) {
    if (!state.completed[id]) state.completed[id] = Date.now();
    state.review[id] = Date.now() + (mode === 'review' ? 3 : 1) * day;
    showToast('Верно — урок сохранён в прогрессе');
  }
  persist();
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
  if (quizButton) { chooseAnswer(quizButton.dataset.quizId, Number(quizButton.dataset.choice), quizButton.dataset.mode); return; }
  const copyButton = event.target.closest('[data-copy-example]');
  if (copyButton) {
    const example = lessonById.get(copyButton.dataset.copyExample)?.example;
    if (!example) return;
    try { await navigator.clipboard.writeText(example); showToast('Пример скопирован'); }
    catch { showToast('Не удалось скопировать пример'); }
    return;
  }
  const filterButton = event.target.closest('[data-filter]');
  if (filterButton) { filter = filterButton.dataset.filter; render(); return; }
  const noteButton = event.target.closest('[data-save-note]');
  if (noteButton) {
    state.notes[noteButton.dataset.saveNote] = main.querySelector('#reflection')?.value.slice(0, 2000) || '';
    persist(); showToast('Заметка сохранена на этом устройстве'); return;
  }
  if (event.target.closest('[data-export]')) {
    const blob = new Blob([JSON.stringify({ version: 1, savedAt: new Date().toISOString(), ...state }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'orbity-obshcheniya-progress.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
    showToast('Файл прогресса скачан');
  }
});

main.addEventListener('change', async (event) => {
  const checkbox = event.target.closest('[data-mission]');
  if (checkbox) {
    const mission = missionById.get(checkbox.dataset.mission);
    const index = Number(checkbox.dataset.step);
    if (!mission || !Number.isInteger(index) || index < 0 || index >= mission.steps.length) return;
    state.missionSteps[mission.id] ||= mission.steps.map(() => false);
    state.missionSteps[mission.id][index] = checkbox.checked;
    persist();
    const status = main.querySelector('[data-mission-status]');
    const done = missionDone(mission);
    status.className = done ? 'success-line' : 'subtle';
    status.textContent = done ? 'Задание отмечено как выполненное ✓' : 'Отмечай шаги по мере выполнения. Прогресс хранится на этом устройстве.';
    if (done) showToast('Задание выполнено');
    return;
  }
  const input = event.target.closest('[data-import]');
  if (!input?.files?.length) return;
  try {
    const file = input.files[0];
    if (file.size > 2_000_000) throw new Error('Файл слишком большой');
    const parsed = JSON.parse(await file.text());
    if (parsed.version !== 1 || !parsed.completed || typeof parsed.completed !== 'object') throw new Error('Это не файл прогресса Орбит общения');
    if (!confirm('Заменить текущий прогресс данными из файла?')) return;
    state = normalizeState(parsed);
    persist(); render(); showToast('Прогресс загружен');
  } catch (error) { showToast(error.message || 'Не удалось загрузить файл'); }
});

window.addEventListener('hashchange', render);
render();
