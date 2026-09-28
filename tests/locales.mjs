import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as ru from '../dist/course.js';
import * as en from '../dist/course.en.js';

function ids(items) { return items.map((item) => item.id); }

for (const kind of ['modules', 'lessons', 'missions']) {
  assert.deepEqual(ids(en[kind]), ids(ru[kind]), `${kind} IDs must stay aligned across languages`);
  assert.equal(new Set(ids(en[kind])).size, en[kind].length, `${kind} IDs must be unique`);
}

for (let i = 0; i < ru.lessons.length; i++) {
  const source = ru.lessons[i];
  const translated = en.lessons[i];
  assert.equal(translated.moduleId, source.moduleId, `${source.id}: module changed`);
  assert.equal(translated.minutes, source.minutes, `${source.id}: duration changed`);
  for (const field of ['title', 'summary', 'principle', 'example', 'action']) {
    assert.ok(typeof translated[field] === 'string' && translated[field].trim(), `${source.id}: missing English ${field}`);
  }
  assert.ok(translated.quiz.prompt.trim(), `${source.id}: missing English question`);
  assert.equal(translated.quiz.choices.length, source.quiz.choices.length, `${source.id}: choice order changed`);
  assert.deepEqual(translated.quiz.correct, source.quiz.correct, `${source.id}: answer key changed`);
  assert.ok(translated.quiz.correct.every((index) => Number.isInteger(index) && index >= 0 && index < translated.quiz.choices.length),
    `${source.id}: invalid answer key`);
  assert.ok(translated.quiz.choices.every((choice) => typeof choice === 'string' && choice.trim()),
    `${source.id}: missing English answer choice`);
}

for (let i = 0; i < ru.missions.length; i++) {
  assert.equal(en.missions[i].steps.length, ru.missions[i].steps.length, `${ru.missions[i].id}: step count changed`);
}

assert.equal(ru.modules.length, 8);
assert.equal(ru.lessons.length, 32);
assert.equal(ru.missions.length, 6);
assert.doesNotMatch(JSON.stringify(en), /[А-Яа-яЁё]/u, 'English course contains untranslated Russian text');
const [ruPage, enPage] = await Promise.all([
  readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../dist/en.html', import.meta.url), 'utf8'),
]);
assert.match(ruPage, /<html lang="ru">/u);
assert.match(enPage, /<html lang="en">/u);
assert.match(ruPage, /src="app\.js"/u);
assert.match(enPage, /src="app\.en\.js"/u);
assert.match(ruPage, /id="language-link"[^>]*href="en\.html/u, 'Russian page links to English');
assert.match(enPage, /id="language-link"[^>]*href="index\.html/u, 'English page links to Russian');
console.log('RU/EN content, answer keys, and progress IDs are aligned.');
