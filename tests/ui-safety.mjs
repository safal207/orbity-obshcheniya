import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { lessons, missions } from '../dist/course.js';
const KEY = 'orbity-dialoga-progress-v1';
const lesson = lessons.find((item) => item.id === 'listening-3');
const seed = () => ({ completed: { [lesson.id]: 1790600000000 }, answers: { [lesson.id]: 1 },
  notes: { [lesson.id]: 'original note' }, review: { [lesson.id]: 1790600000000 }, missionSteps: {} });
let sequence = 0;
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (...args) => { const timer = realTimeout(...args); timer.unref?.(); return timer; };

async function boot(lang, { initial = seed(), hash = '#lesson/listening-3', writeFailure = false, readFailure = false } = {}) {
  let raw = JSON.stringify(initial); let writes = 0; let confirmations = 0; let confirmResult = true;
  const listeners = {};
  const input = { value: initial.notes?.[lesson.id] || '' };
  const status = { className: '', textContent: '' };
  const classList = { add() {}, remove() {}, toggle() {} };
  const toast = { textContent: '', classList };
  let renders = 0; let html = '';
  const main = {
    handlers: {},
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; renders++; },
    addEventListener(type, handler) { this.handlers[type] = handler; },
    querySelectorAll() { return []; },
    querySelector(selector) { return selector === '#reflection' && location.hash.startsWith('#lesson/') ? input : selector === '[data-mission-status]' ? status : null; },
  };
  const elements = { '#main': main, '#toast': toast, '#breadcrumb': {}, '#language-link': {}, '#review-badge': {} };
  globalThis.document = { querySelector: (selector) => elements[selector] || null, querySelectorAll: () => [] };
  globalThis.localStorage = {
    getItem() { if (readFailure) throw new Error('SecurityError'); return raw; },
    setItem(key, value) { if (writeFailure) throw new Error('QuotaExceededError'); writes++; raw = value; },
  };
  let tail = Promise.resolve();
  const locks = { request(name, options, callback) {
    const result = tail.then(() => callback({ name })); tail = result.catch(() => {}); return result;
  } };
  Object.defineProperty(globalThis, 'navigator', { value: { locks, clipboard: { async writeText() {} } }, configurable: true });
  globalThis.window = { addEventListener(type, handler) { listeners[type] = handler; }, scrollTo() {} };
  globalThis.location = { hash };
  globalThis.confirm = () => { confirmations++; return confirmResult; };
  const name = lang === 'ru' ? 'app.js' : 'app.en.js';
  const url = process.env.ORBITY_APP_DIR ? pathToFileURL(resolve(process.env.ORBITY_APP_DIR, name)) : new URL(`../dist/${name}`, import.meta.url);
  url.search = `case=${sequence++}`;
  await import(url.href);
  const event = (selector, target) => ({ target: { closest: (candidate) => candidate === selector ? target : null } });
  return {
    main, input, status, toast, listeners,
    get raw() { return raw; }, get writes() { return writes; }, get confirmations() { return confirmations; }, get renders() { return renders; },
    external(value) { raw = typeof value === 'string' ? value : JSON.stringify(value); },
    cancel() { confirmResult = false; },
    failWrites(value) { writeFailure = value; },
    async click(selector, target = {}) { return main.handlers.click(event(selector, target)); },
    async upload(value) {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      const fileInput = { value: 'selected.json', files: [{ size: text.length, async text() { return text; } }] };
      await main.handlers.change(event('[data-import]', fileInput));
      return fileInput;
    },
    async step(checkbox) { return main.handlers.change(event('[data-mission]', checkbox)); },
  };
}
const validFile = () => ({ version: 1, ...seed() });
const successNote = { ru: 'Заметка сохранена на этом устройстве', en: 'Note saved on this device' };
const successImport = { ru: 'Прогресс загружен', en: 'Progress imported' };

for (const lang of ['ru', 'en']) {
  for (const [name, data] of Object.entries({
    'array completed': { ...validFile(), completed: [] },
    'malformed JSON': '{invalid',
    'array notes': { ...validFile(), notes: [] },
    'invalid answer': { ...validFile(), answers: { [lesson.id]: 999 } },
    'invalid mission': { ...validFile(), missionSteps: { [missions[0].id]: [1, 0, 1] } },
    'unknown lesson': { ...validFile(), notes: { unknown: 'private' } },
    'missing fields': { version: 1, completed: {} },
  })) test(`${lang}: invalid import (${name}) rejected before confirmation`, async () => {
    const f = await boot(lang); const before = f.raw;
    await f.upload(data);
    assert.equal(f.confirmations, 0); assert.equal(f.writes, 0); assert.equal(f.raw, before);
    assert.notEqual(f.toast.textContent, successImport[lang]);
  });

  test(`${lang}: cancelled and valid imports have distinct outcomes`, async () => {
    const f = await boot(lang); const before = f.raw; f.cancel();
    await f.upload(validFile()); assert.equal(f.raw, before); assert.equal(f.writes, 0);
    const g = await boot(lang);
    const next = validFile(); next.notes[lesson.id] = 'imported note';
    await g.upload(next);
    assert.equal(JSON.parse(g.raw).notes[lesson.id], 'imported note');
    assert.equal(g.toast.textContent, successImport[lang]);
  });

  test(`${lang}: failed note save keeps draft and never reports success; retry works`, async () => {
    const f = await boot(lang, { writeFailure: true }); const before = f.raw;
    f.input.value = 'unsaved draft';
    await f.click('[data-save-note]', { dataset: { saveNote: lesson.id } });
    assert.equal(f.raw, before); assert.equal(f.input.value, 'unsaved draft');
    assert.notEqual(f.toast.textContent, successNote[lang]); assert.equal(f.writes, 0);
    f.failWrites(false);
    await f.click('[data-save-note]', { dataset: { saveNote: lesson.id } });
    assert.equal(JSON.parse(f.raw).notes[lesson.id], 'unsaved draft');
    assert.equal(f.toast.textContent, successNote[lang]);
  });

  test(`${lang}: failed import does not mutate in-memory progress or report success`, async () => {
    const f = await boot(lang, { writeFailure: true, hash: '#progress' }); const before = f.raw;
    const next = validFile(); next.completed = {}; next.notes = {};
    await f.upload(next);
    assert.equal(f.raw, before); assert.notEqual(f.toast.textContent, successImport[lang]);
    f.listeners.hashchange();
    assert.match(f.main.innerHTML, /1 \/ 32/u);
  });

  test(`${lang}: import rechecks snapshot after confirmation`, async () => {
    const f = await boot(lang); const other = seed(); other.notes[lesson.id] = 'from another tab';
    globalThis.confirm = () => { f.external(other); return true; };
    await f.upload(validFile());
    assert.equal(JSON.parse(f.raw).notes[lesson.id], 'from another tab');
    assert.equal(f.writes, 0); assert.notEqual(f.toast.textContent, successImport[lang]);
  });

  test(`${lang}: saving from a stale tab preserves an unrelated lesson`, async () => {
    const f = await boot(lang); const remote = seed(); remote.completed[lessons[0].id] = 1790600000000;
    f.external(remote);
    await f.click('[data-quiz-id]', { dataset: { quizId: lesson.id, choice: '1', mode: 'practice' } });
    assert.ok(JSON.parse(f.raw).completed[lessons[0].id]);
  });

  test(`${lang}: conflicting note stays visible and does not overwrite remote text`, async () => {
    const f = await boot(lang); f.input.value = 'local draft';
    const remote = seed(); remote.notes[lesson.id] = 'remote note'; f.external(remote);
    const renders = f.renders;
    f.listeners.storage?.({ key: KEY });
    assert.equal(f.input.value, 'local draft'); assert.equal(f.renders, renders);
    await f.click('[data-save-note]', { dataset: { saveNote: lesson.id } });
    assert.equal(JSON.parse(f.raw).notes[lesson.id], 'remote note');
    assert.equal(f.input.value, 'local draft'); assert.equal(f.writes, 0);
    assert.notEqual(f.toast.textContent, successNote[lang]);
  });

  test(`${lang}: failed mission write rolls back checkbox and never marks completion`, async () => {
    const initial = seed(); const mission = missions[0]; initial.missionSteps[mission.id] = [true, true, false];
    const f = await boot(lang, { initial, writeFailure: true, hash: `#mission/${mission.id}` }); const before = f.raw;
    const checkbox = { dataset: { mission: mission.id, step: '2' }, checked: true };
    await f.step(checkbox);
    assert.equal(f.raw, before); assert.equal(checkbox.checked, false);
    assert.doesNotMatch(f.status.textContent, /complete|выполнено/iu);
  });

  test(`${lang}: denied reads cannot overwrite existing progress with an empty state`, async () => {
    const f = await boot(lang, { readFailure: true }); const before = f.raw;
    await f.click('[data-quiz-id]', { dataset: { quizId: lesson.id, choice: '1', mode: 'practice' } });
    assert.equal(f.raw, before); assert.equal(f.writes, 0);
  });

  test(`${lang}: failed quiz write never updates completed count`, async () => {
    const initial = seed(); initial.completed = {}; initial.answers = {}; initial.review = {};
    const f = await boot(lang, { initial, writeFailure: true });
    await f.click('[data-quiz-id]', { dataset: { quizId: lesson.id, choice: '1', mode: 'practice' } });
    globalThis.location.hash = '#progress'; f.listeners.hashchange();
    assert.match(f.main.innerHTML, /0 \/ 32/u);
    assert.equal(f.writes, 0);
  });
}
