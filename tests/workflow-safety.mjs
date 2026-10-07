import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');

test('only main publication runs can share the Pages deployment queue', () => {
  assert.match(workflow, /group: \$\{\{ github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main' && 'github-pages' \|\| format\('orbity-\{0\}', github\.ref\) \}\}/);
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \|\| github\.ref != 'refs\/heads\/main' \}\}/);
  assert.doesNotMatch(workflow, /pull_request.*\|\| 'github-pages'/);
});

test('deployment is restricted to main and gated by validation', () => {
  assert.match(workflow, /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /needs: validate/);
  for (const name of ['progress-safety.mjs', 'ui-safety.mjs', 'workflow-safety.mjs']) assert.ok(workflow.includes(`tests/${name}`));
});
