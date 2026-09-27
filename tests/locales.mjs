import assert from 'node:assert/strict';
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
  assert.equal(translated.quiz.choices.length, source.quiz.choices.length, `${source.id}: choice order changed`);
  assert.deepEqual(translated.quiz.correct, source.quiz.correct, `${source.id}: answer key changed`);
}

for (let i = 0; i < ru.missions.length; i++) {
  assert.equal(en.missions[i].steps.length, ru.missions[i].steps.length, `${ru.missions[i].id}: step count changed`);
}

assert.equal(ru.modules.length, 8);
assert.equal(ru.lessons.length, 32);
assert.equal(ru.missions.length, 6);
assert.doesNotMatch(JSON.stringify(en), /[А-Яа-яЁё]/u, 'English course contains untranslated Russian text');
console.log('RU/EN content, answer keys, and progress IDs are aligned.');
