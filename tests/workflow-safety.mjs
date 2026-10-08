import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const acceptance = readFileSync(new URL('../.github/workflows/react-preview.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const deploy = workflow.split('\n  deploy:\n')[1];

test('only main publication runs can share the Pages deployment queue', () => {
  assert.match(workflow, /group: \$\{\{ github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main' && 'github-pages' \|\| format\('orbity-\{0\}', github\.ref\) \}\}/);
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \|\| github\.ref != 'refs\/heads\/main' \}\}/);
  assert.doesNotMatch(workflow, /pull_request.*\|\| 'github-pages'/);
});

test('deployment is restricted to main and gated by validation', () => {
  assert.match(workflow, /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
  assert.match(deploy, /needs: \[validate, react-acceptance\]/);
  assert.doesNotMatch(deploy, /if:.*always\(/, 'failed or cancelled acceptance cannot reach deployment');
  for (const name of ['progress-safety.mjs', 'ui-safety.mjs', 'workflow-safety.mjs']) assert.ok(workflow.includes(`tests/${name}`));
});

test('Pages runs the shared full Chromium and Firefox acceptance before deploying', () => {
  assert.match(workflow, /react-acceptance:\s+uses: \.\/.github\/workflows\/react-preview.yml/);
  assert.match(acceptance, /on:\s+workflow_call:/);
  for (const command of ['npm ci --no-fund', 'npm test', 'npm run build', 'node scripts/verify-build.mjs', 'npm run test:browser', 'npx playwright test tests/guided-restart.browser.spec.mjs']) {
    assert.ok(acceptance.includes(command), `acceptance includes ${command}`);
  }
  assert.match(acceptance, /PW_BROWSER: firefox/);
  assert.doesNotMatch(acceptance, /npm install|--no-audit/);
});

test('deployment consumes the successful tested artifact without rebuilding or checking out source', () => {
  const artifactName = 'orbity-react-site-${{ github.sha }}';
  const exported = acceptance.split('      - name: Export accepted React website\n')[1].split('      - name: Archive exact tested source\n')[0];
  assert.ok(exported.includes(`name: ${artifactName}`));
  assert.match(exported, /path: react-preview\/build\//);
  assert.match(exported, /if-no-files-found: error/);
  assert.doesNotMatch(exported, /if:/, 'accepted build is exported only after preceding checks succeed');
  assert.ok(acceptance.indexOf('Guided-resume acceptance (Firefox)') < acceptance.indexOf('Export accepted React website'));
  assert.ok(deploy.includes(`name: ${artifactName}`));
  assert.match(deploy, /path: accepted-site/g);
  assert.doesNotMatch(deploy, /checkout@|npm |path: dist|run:/);
});

test('only the Pages deploy job has publication permissions and Actions are pinned', () => {
  assert.doesNotMatch(acceptance, /pages: write|id-token: write|deploy-pages@/);
  const beforeDeploy = workflow.split('\n  deploy:\n')[0];
  assert.doesNotMatch(beforeDeploy, /pages: write|id-token: write/);
  assert.match(deploy, /pages: write/);
  assert.match(deploy, /id-token: write/);
  for (const source of [workflow, acceptance]) {
    const actions = [...source.matchAll(/uses: (actions\/[^@\s]+)@([^\s]+)/g)];
    assert.ok(actions.length > 0);
    for (const [, name, revision] of actions) assert.match(revision, /^[a-f0-9]{40}$/, `${name} uses an immutable verified commit`);
  }
});
