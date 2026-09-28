import assert from 'node:assert/strict';

const storage = new Map();
const listeners = {};
let copiedExample = '';
const classList = { add() {}, remove() {}, toggle() {} };
const main = {
  innerHTML: '',
  handlers: {},
  addEventListener(type, handler) { this.handlers[type] = handler; },
  querySelectorAll() { return []; },
  querySelector() { return null; },
};
const breadcrumb = { textContent: '' };
const languageLink = { href: '' };
const badge = { textContent: '', hidden: true };
const toast = { textContent: '', classList };
const elements = { '#main': main, '#breadcrumb': breadcrumb, '#language-link': languageLink,
  '#review-badge': badge, '#toast': toast };

globalThis.document = {
  querySelector(selector) { return elements[selector] || null; },
  querySelectorAll() { return []; },
};
globalThis.localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, value) { storage.set(key, value); },
};
Object.defineProperty(globalThis, 'navigator', {
  value: { locks: { async request(name, options, callback) { return callback(); } }, clipboard: { async writeText(value) { copiedExample = value; } } },
  configurable: true,
});
globalThis.location = { hash: '#practice/listening-3' };
globalThis.window = {
  addEventListener(type, handler) { listeners[type] = handler; },
  scrollTo() {},
};

await import('../dist/app.js');
assert.match(main.innerHTML, /Что лучше сделать перед советом/u);
assert.equal(languageLink.href, 'en.html#practice/listening-3');
await main.handlers.click({ target: { closest(selector) {
  return selector === '[data-quiz-id]' ? { dataset: { quizId: 'listening-3', choice: '0', mode: 'practice' } } : null;
} } });
assert.equal(JSON.parse(storage.get('orbity-dialoga-progress-v1')).completed['listening-3'], undefined,
  'wrong answer does not complete the lesson');
await main.handlers.click({ target: { closest(selector) {
  return selector === '[data-quiz-id]' ? { dataset: { quizId: 'listening-3', choice: '1', mode: 'practice' } } : null;
} } });
const saved = JSON.parse(storage.get('orbity-dialoga-progress-v1'));
assert.ok(saved.completed['listening-3'], 'correct RU practice answer persists');

await import('../dist/app.en.js');
assert.match(main.innerHTML, /What is useful to do before giving advice\?/u);
assert.equal(languageLink.href, 'index.html#practice/listening-3');
assert.match(breadcrumb.textContent, /Conversation Orbits/u);
await main.handlers.click({ target: { closest(selector) {
  return selector === '[data-copy-example]' ? { dataset: { copyExample: 'listening-3' } } : null;
} } });
assert.match(copiedExample, /Would you like me to listen/u);
location.hash = '#progress';
listeners.hashchange();
assert.match(main.innerHTML, /1 \/ 32/u, 'EN sees progress recorded in RU');
location.hash = '#mission/pause-return';
listeners.hashchange();
assert.match(main.innerHTML, /If you face pressure, threats, or fear/u);
console.log('RU/EN routes, safety note, and shared progress render successfully.');
