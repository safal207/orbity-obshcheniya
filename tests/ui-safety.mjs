import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { lessons, missions } from '../dist/course.js';
const KEY = 'orbity-dialoga-progress-v1';
const lesson = lessons.find((item) => item.id === 'listening-3');
// Deliberately use a legacy export with no navigation fields.
const seed = () => ({ completed: { [lesson.id]: 1790600000000 }, answers: { [lesson.id]: 1 },
  notes: { [lesson.id]: 'original note' }, review: { [lesson.id]: 1790600000000 }, missionSteps: {} });
let sequence = 0;
const realTimeout = globalThis.setTimeout;
globalThis.setTimeout = (...args) => { const timer = realTimeout(...args); timer.unref?.(); return timer; };
const decode = (text) => text.replace(/&(lt|gt|amp|quot|#39);/g, (_, name) => ({ lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'" })[name]);

async function boot(lang, { initial = seed(), hash = '#progress', writeFailure = false, readFailure = false } = {}) {
  let raw = JSON.stringify(initial); let writes = 0; let confirmations = 0; let confirmResult = true;
  const listeners = {};
  let input = null;
  let status = null;
  const classList = { add() {}, remove() {}, toggle() {} };
  const toast = { textContent: '', classList };
  let renders = 0; let html = '';
  const main = {
    handlers: {},
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value; renders++;
      const note = value.match(/<textarea[^>]*data-note-id="([^"]+)"[^>]*>(.*?)<\/textarea>/s);
      input = note ? { dataset: { noteId: note[1] }, value: decode(note[2]) } : null;
      const text = value.match(/<p[^>]*data-note-status="[^"]+"[^>]*>(.*?)<\/p>/s);
      status = text ? { textContent: decode(text[1]) } : null;
    },
    addEventListener(type, handler) { this.handlers[type] = handler; },
    querySelectorAll() { return []; },
    querySelector(selector) {
      if (selector === 'h1') return { focus() {} };
      if (selector.includes('data-note-status')) return status;
      if (selector.includes('data-note-id')) return input;
      return null;
    },
    focus() {},
  };
  const elements = { '#main': main, '#toast': toast, '#site-menu': { open: false }, '#header-progress': {},
    '#language-link': {}, '#review-badge': {}, '.skip-link': { addEventListener() {} } };
  globalThis.document = { querySelector: (selector) => elements[selector] || null,
    querySelectorAll: () => [], addEventListener() {} };
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
  const api = {
    main, toast, listeners,
    get input() { return input; }, get status() { return status; },
    get raw() { return raw; }, get writes() { return writes; }, get confirmations() { return confirmations; }, get renders() { return renders; },
    external(value) { raw = typeof value === 'string' ? value : JSON.stringify(value); },
    cancel() { confirmResult = false; },
    failWrites(value) { writeFailure = value; },
    resetCounters() { writes = 0; confirmations = 0; },
    async visit(hash) { location.hash = hash; return listeners.hashchange(); },
    async click(dataset = {}, attributes = []) {
      return main.handlers.click(event('button', { dataset, hasAttribute: (name) => attributes.includes(name) }));
    },
    type(value) {
      assert.ok(input, 'a real rendered note textarea must exist before typing');
      input.value = value;
      return main.handlers.input({ target: input });
    },
    async openNote() {
      await api.visit('#practice/' + lesson.id);
      await api.click({ answerId: lesson.id, choice: '1', mode: 'practice' });
      assert.ok(input); api.resetCounters();
    },
    async upload(value) {
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      const fileInput = { value: 'selected.json', files: [{ size: text.length, async text() { return text; } }] };
      await main.handlers.change(event('[data-import]', fileInput));
      return fileInput;
    },
  };
  return api;
}
const validFile = () => ({ version: 1, ...seed() });
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
    'invalid guided metadata': { ...validFile(), guidedFlow: { topic: 'unknown', step: 1 } },
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

  test(`${lang}: failed autosave keeps draft and reports error; retry works`, async () => {
    const f = await boot(lang); await f.openNote(); f.failWrites(true); const before = f.raw;
    await f.type('unsaved draft');
    assert.equal(f.raw, before); assert.equal(f.input.value, 'unsaved draft');
    assert.ok(f.status, 'persistent note status is rendered');
    assert.match(f.status.textContent, lang === 'ru' ? /Не удалось/ : /Could not/);
    assert.equal(f.writes, 0);
    f.failWrites(false);
    await f.click({ saveNote: lesson.id });
    assert.equal(JSON.parse(f.raw).notes[lesson.id], 'unsaved draft');
    assert.match(f.status.textContent, lang === 'ru' ? /Заметка сохранена/ : /Note saved/);
  });

  test(`${lang}: fast typing is ordered and persists the newest text`, async () => {
    const f = await boot(lang); await f.openNote();
    await Promise.all(['a', 'ab', 'abc', 'abcd'].map((text) => f.type(text)));
    assert.equal(JSON.parse(f.raw).notes[lesson.id], 'abcd');
    assert.equal(f.input.value, 'abcd');
    assert.equal(f.writes, 4);
  });

  test(`${lang}: conflicting autosave preserves remote text and local draft through focus`, async () => {
    const f = await boot(lang); await f.openNote();
    const remote = JSON.parse(f.raw); remote.notes[lesson.id] = 'remote note'; f.external(remote);
    await f.type('local draft'); const renders = f.renders;
    f.listeners.storage?.({ key: KEY }); f.listeners.focus?.();
    assert.equal(f.input.value, 'local draft'); assert.equal(f.renders, renders);
    assert.equal(JSON.parse(f.raw).notes[lesson.id], 'remote note'); assert.equal(f.writes, 0);
    assert.match(f.toast.textContent, lang === 'ru' ? /другой вкладке/ : /Another tab/);
    await f.click({ saveNote: lesson.id });
    assert.equal(JSON.parse(f.raw).notes[lesson.id], 'remote note');
  });

  test(`${lang}: unsaved note survives SPA navigation and warns before closing`, async () => {
    const f = await boot(lang); await f.openNote(); f.failWrites(true);
    await f.type('keep this draft');
    let prevented = false;
    const event = { preventDefault() { prevented = true; } };
    f.listeners.beforeunload?.(event);
    assert.equal(prevented, true);
    await f.visit('#about');
    await f.visit('#practice/' + lesson.id); f.failWrites(false);
    await f.click({ answerId: lesson.id, choice: '1', mode: 'practice' });
    assert.equal(f.input.value, 'keep this draft');
  });

  test(`${lang}: pending/failed draft blocks import before confirmation`, async () => {
    const f = await boot(lang); await f.openNote(); f.failWrites(true);
    await f.type('draft'); const before = f.raw;
    await f.upload(validFile());
    assert.equal(f.confirmations, 0); assert.equal(f.raw, before);
  });

  test(`${lang}: failed import does not mutate in-memory progress or report success`, async () => {
    const f = await boot(lang, { writeFailure: true }); const before = f.raw;
    const next = validFile(); next.completed = {}; next.notes = {};
    await f.upload(next);
    assert.equal(f.raw, before); assert.notEqual(f.toast.textContent, successImport[lang]);
    await f.visit('#progress'); assert.match(f.main.innerHTML, /1 (?:из|of|\/) 32/u);
  });

  test(`${lang}: import rechecks snapshot after confirmation`, async () => {
    const f = await boot(lang); const other = seed(); other.notes[lesson.id] = 'from another tab';
    globalThis.confirm = () => { f.external(other); return true; };
    await f.upload(validFile());
    assert.equal(JSON.parse(f.raw).notes[lesson.id], 'from another tab');
    assert.equal(f.writes, 0); assert.notEqual(f.toast.textContent, successImport[lang]);
  });

  test(`${lang}: stale tab lesson and navigation saves preserve unrelated data`, async () => {
    const f = await boot(lang); const remote = seed(); remote.completed[lessons[0].id] = 1790600000000;
    f.external(remote);
    await f.visit('#lesson/' + lesson.id);
    await f.click({ openQuestion: lesson.id });
    await f.click({ answerId: lesson.id, choice: '1', mode: 'lesson' });
    assert.ok(JSON.parse(f.raw).completed[lessons[0].id]);
  });

  test(`${lang}: failed mission save does not advance to the next step`, async () => {
    const initial = seed(); const mission = missions[0]; initial.missionSteps[mission.id] = [true, true, false];
    const f = await boot(lang, { initial, writeFailure: true, hash: `#mission/${mission.id}` }); const before = f.raw;
    await f.click({ missionComplete: mission.id, step: '2' });
    assert.equal(f.raw, before);
    assert.match(f.main.innerHTML, /data-mission-complete=/);
  });

  test(`${lang}: denied reads cannot overwrite existing progress`, async () => {
    const f = await boot(lang, { readFailure: true }); const before = f.raw;
    await f.visit('#lesson/' + lesson.id);
    await f.click({ answerId: lesson.id, choice: '1', mode: 'lesson' });
    assert.equal(f.raw, before); assert.equal(f.writes, 0);
  });

  test(`${lang}: failed quiz write never completes a lesson or shows success`, async () => {
    const initial = seed(); initial.completed = {}; initial.answers = {}; initial.review = {};
    const f = await boot(lang, { initial, writeFailure: true });
    await f.visit('#lesson/' + lesson.id); await f.click({ openQuestion: lesson.id });
    await f.click({ answerId: lesson.id, choice: '1', mode: 'lesson' });
    assert.match(f.main.innerHTML, /data-answer-id=/, 'the question remains available for retry');
    await f.visit('#progress'); assert.match(f.main.innerHTML, /0 (?:из|of|\/) 32/u);
    assert.equal(f.writes, 0);
  });

  test(`${lang}: guided topic selection failure does not navigate`, async () => {
    const f = await boot(lang, { writeFailure: true, hash: '#start' }); const before = f.raw;
    await f.click({ topic: 'listening' });
    assert.equal(location.hash, '#start'); assert.equal(f.raw, before);
  });
}
