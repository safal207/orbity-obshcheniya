import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
test('PR concurrency is per-PR and cannot share the deployment queue', () => {
  assert.match(workflow, /group: \$\{\{ github\.event_name == 'pull_request' && format\('orbity-pr-\{0\}', github\.event\.pull_request\.number\) \|\| 'github-pages' \}\}/);
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});
test('deployment is restricted to main and gated by validation', () => {
  assert.match(workflow, /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /needs: validate/);
  for (const name of ['progress-safety.mjs', 'ui-safety.mjs', 'workflow-safety.mjs']) assert.ok(workflow.includes(`tests/${name}`));
});
