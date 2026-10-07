import assert from 'node:assert/strict';
import { lessons as ruLessons } from '../dist/course.js';
import { lessons as enLessons } from '../dist/course.en.js';

// A small browser stand-in keeps this smoke test runnable in Pages CI without dependencies.
// We check rendered text, public routes, clicks, and saved progress rather than private functions.
const progressKey = 'orbity-dialoga-progress-v1';
const storage = new Map();
const windowListeners = {};
const documentListeners = {};
const classList = { add() {}, remove() {}, toggle() {} };
const main = {
  innerHTML: '', handlers: {},
  addEventListener(type, handler) { this.handlers[type] = handler; },
  querySelector(selector) { return selector === 'h1' ? { focus() {} } : null; },
  querySelectorAll() { return []; },
  focus() {},
};
const languageLink = { href: '' };
const menu = { open: false };
const toast = { textContent: '', classList };
const elements = {
  '#main': main,
  '#language-link': languageLink,
  '#site-menu': menu,
  '#header-progress': { textContent: '' },
  '#toast': toast,
  '.skip-link': { addEventListener() {} },
};

globalThis.document = {
  querySelector(selector) { return elements[selector] || null; },
  querySelectorAll() { return []; },
  addEventListener(type, handler) { documentListeners[type] = handler; },
};
globalThis.localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, value); },
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
  locks: { async request(name, options, callback) { return callback(); } },
} });
globalThis.location = { hash: '#today' };
globalThis.window = {
  addEventListener(type, handler) { windowListeners[type] = handler; },
  scrollTo() {},
};

async function visit(hash) {
  location.hash = hash;
  assert.ok(windowListeners.hashchange, 'the app handles route changes');
  await windowListeners.hashchange();
}

async function click(dataset, attributes = []) {
  assert.ok(main.handlers.click, 'the app handles button clicks');
  await main.handlers.click({ target: { closest(selector) {
    return selector === 'button' ? {
      dataset,
      hasAttribute(name) { return attributes.includes(name); },
    } : null;
  } } });
}

function saved() {
  const raw = storage.get(progressKey);
  assert.ok(raw, 'progress is saved under the legacy browser key');
  return JSON.parse(raw);
}

function firstQuestionId() {
  const match = main.innerHTML.match(/data-answer-id="([^"]+)"/u);
  assert.ok(match, 'one answerable question is visible');
  const ids = [...main.innerHTML.matchAll(/data-answer-id="([^"]+)"/gu)].map((item) => item[1]);
  assert.deepEqual([...new Set(ids)], [match[1]], 'only one question is shown at a time');
  assert.equal((main.innerHTML.match(/<h1\b/gu) || []).length, 1, 'the question has one main heading');
  return match[1];
}

async function answer(id, mode, choice) {
  assert.match(main.innerHTML, new RegExp(`data-answer-id="${id}"`, 'u'));
  await click({ answerId: id, mode, choice: String(choice) });
}

await import('../dist/app.js');
assert.match(main.innerHTML, /class="primary-button" href="#start"/u, 'Russian home presents one clear start action');
assert.doesNotMatch(main.innerHTML, /href="#path"/u, 'Russian first screen has no competing path link');
assert.equal(languageLink.href, 'en.html#today', 'Russian page preserves the route in its language link');

await visit('#start');
assert.match(main.innerHTML, /Что сейчас хочется улучшить/u);
assert.match(main.innerHTML, /data-topic="listening"/u);
await click({ topic: 'listening' });
await visit(location.hash);
const lessonId = firstQuestionId();
const lesson = ruLessons.find((item) => item.id === lessonId);
assert.ok(lesson, 'the guided question comes from the Russian course');
await answer(lessonId, 'guided', lesson.quiz.correct[0]);
assert.equal(saved().completed[lessonId], undefined, 'guided quiz does not mark a lesson complete');

await visit(`#lesson/${lessonId}`);
assert.match(main.innerHTML, new RegExp(lesson.title, 'u'), 'a full lesson starts with one idea');
assert.equal(languageLink.href, `en.html#lesson/${lessonId}`);
await click({ openQuestion: lessonId });
const wrong = lesson.quiz.choices.findIndex((_, index) => !lesson.quiz.correct.includes(index));
await answer(lessonId, 'lesson', wrong);
assert.equal(saved().completed[lessonId], undefined, 'wrong lesson answer does not mark completion');
assert.match(main.innerHTML, /Попробуйте другой ответ/u);
await click({ retry: lessonId, mode: 'lesson' });
await answer(lessonId, 'lesson', lesson.quiz.correct[0]);
assert.ok(saved().completed[lessonId], 'correct full-lesson answer marks completion');
assert.match(main.innerHTML, /КОРОТКИЙ РАЗБОР/u);

await visit('#about');
assert.match(main.innerHTML, /давление, угрозы или страх/u, 'Russian about page retains the safety note');
await visit(`#lesson/${lessonId}`);

await import('../dist/app.en.js');
const englishLesson = enLessons.find((item) => item.id === lessonId);
assert.ok(englishLesson);
assert.match(main.innerHTML, new RegExp(englishLesson.title, 'u'), 'the English lesson renders translated text');
assert.equal(languageLink.href, `index.html#lesson/${lessonId}`, 'English link preserves the lesson route');
await visit('#progress');
assert.match(main.innerHTML, /1 (?:of|\/) 32/u, 'English progress includes the lesson completed in Russian');
await visit('#start');
assert.match(main.innerHTML, /data-topic="needs"/u, 'English route offers a single topic choice');
await click({ topic: 'needs' });
await visit(location.hash);
const englishQuestionId = firstQuestionId();
const nextEnglishLesson = enLessons.find((item) => item.id === englishQuestionId);
assert.ok(nextEnglishLesson, 'the English guided question comes from the translated course');
assert.ok(main.innerHTML.includes(nextEnglishLesson.quiz.prompt), 'the guided question is in English');
await answer(englishQuestionId, 'guided', nextEnglishLesson.quiz.correct[0]);
assert.equal(Object.keys(saved().completed).length, 1, 'English guided quiz does not change lesson progress');
await visit(`#lesson/${englishQuestionId}`);
await click({ openQuestion: englishQuestionId });
await answer(englishQuestionId, 'lesson', nextEnglishLesson.quiz.correct[0]);
assert.ok(saved().completed[englishQuestionId], 'English full lesson uses the same saved progress');
await visit('#progress');
assert.match(main.innerHTML, /2 (?:of|\/) 32/u, 'English progress includes lessons from both languages');
await visit('#about');
assert.match(main.innerHTML, /pressure|threats|fear/iu, 'English about page retains the safety note');
assert.equal(languageLink.href, 'index.html#about');

console.log('RU/EN one-question flow, lesson completion, safety, shared progress, and route links work.');
