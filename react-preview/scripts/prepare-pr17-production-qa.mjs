import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// This QA-only branch never publishes application code. Browser contexts are
// disposable, and all storage fixtures below are synthetic. There is no server write.
const BASE = 'https://safal207.github.io/orbity-obshcheniya/';
const MERGE = '7dc25c96756b72196d4521c0eacb9199b7494106';
const RUN = '38085368279';
const JS = 'app-DnbfLWC6.js';
const CSS = 'app-CvJSb5IG.css';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
await mkdir('production-qa/evidence', { recursive: true });
const headers = { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}` };
let published = false;
for (let attempt = 0; attempt < 60; attempt++) {
  const response = await fetch(`https://api.github.com/repos/safal207/orbity-obshcheniya/actions/runs/${RUN}`, { headers });
  if (!response.ok) throw new Error(`Cannot verify publication run: HTTP ${response.status}`);
  const run = await response.json();
  if (run.head_sha !== MERGE) throw new Error('Publication commit does not match the reviewed merge');
  console.log(`Publication gate ${attempt}: ${run.status} / ${run.conclusion}`);
  if (run.status === 'completed') {
    if (run.conclusion !== 'success') throw new Error(`Main publication failed: ${run.conclusion}`);
    const jobsResponse = await fetch(`https://api.github.com/repos/safal207/orbity-obshcheniya/actions/runs/${RUN}/jobs?per_page=100`, { headers });
    if (!jobsResponse.ok) throw new Error(`Cannot inspect deploy job: ${jobsResponse.status}`);
    const jobs = (await jobsResponse.json()).jobs;
    const deploy = jobs.find(job => job.name === 'deploy');
    if (deploy?.conclusion !== 'success') throw new Error('A successful, non-skipped deploy job is required');
    await writeFile('production-qa/evidence/publication.json', JSON.stringify({ checkedAt: new Date().toISOString(), run: { id: run.id, sha: run.head_sha, conclusion: run.conclusion, url: run.html_url }, jobs: jobs.map(({ id, name, conclusion, started_at, completed_at }) => ({ id, name, conclusion, started_at, completed_at })) }, null, 2));
    published = true;
    break;
  }
  await pause(15000);
}
if (!published) throw new Error('NOT_PUBLISHED: main publication has not completed within the bounded wait');

let html = '';
for (let attempt = 0; attempt < 30; attempt++) {
  const response = await fetch(`${BASE}?qa_identity=${Date.now()}`, { cache: 'no-store' });
  html = response.ok ? await response.text() : '';
  if (html.includes(JS) && html.includes(CSS)) break;
  console.log(`Public asset propagation gate ${attempt}: HTTP ${response.status}`);
  await pause(10000);
}
if (!html.includes(JS) || !html.includes(CSS)) throw new Error('NOT_PUBLISHED: public HTML does not contain the accepted assets');
const identity = { checkedAt: new Date().toISOString(), productionUrl: BASE, merge: MERGE, htmlSha256: createHash('sha256').update(html).digest('hex'), assets: [] };
for (const name of [JS, CSS]) {
  const url = new URL(`assets/${name}`, BASE).href;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Published asset unavailable: ${url} ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  identity.assets.push({ url, status: response.status, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile('production-qa/evidence/identity.json', JSON.stringify(identity, null, 2));
await writeFile('production-qa/evidence/published-index.html', html);
console.log('PUBLIC_IDENTITY', JSON.stringify(identity));

// Adapt only navigation arguments, never arbitrary slash-prefixed strings.
// In particular, '/2' is a lesson-screen suffix and must remain exactly '/2'.
function adaptNavigation(source) {
  const adapted = source.replace(/\.goto\((['"\x60])\//g, '.goto($1./')
    .replace("${english ? '/?lang=en' : '/'}", "${english ? './?lang=en' : './'}");
  const before = source.split('\n');
  const after = adapted.split('\n');
  if (before.length !== after.length || before.some((line, index) => line !== after[index] && !line.includes('.goto('))) {
    throw new Error('The live-origin adapter must not modify assertions, fixtures, hash suffixes or non-navigation lines');
  }
  return adapted;
}
const adapterProbe = "await page.goto('/?lang=en#today'); const suffix = '/2';";
if (adaptNavigation(adapterProbe) !== "await page.goto('./?lang=en#today'); const suffix = '/2';") {
  throw new Error('Navigation adapter regression: lesson suffix changed');
}

// Reuse reviewed assertions against the actual public origin. No app code,
// network response, DOM, successful save or route fragment is substituted.
for (const name of ['personal-path.browser.spec.mjs', 'home-action.browser.spec.mjs', 'browser.spec.mjs', 'answer-next-step.browser.spec.mjs']) {
  const source = await readFile(`tests/${name}`, 'utf8');
  const adapted = adaptNavigation(source);
  await writeFile(`production-qa/${name}`, adapted);
  await copyFile(`tests/${name}`, `production-qa/evidence/source-${name}`);
}
await writeFile('production-qa.config.mjs', `import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './production-qa', testMatch: '*.browser.spec.mjs', workers: 1, retries: 0,
 timeout: 60000, expect: { timeout: 10000 },
 outputDir: process.env.PW_OUTPUT_DIR || 'production-results-chromium',
 reporter: [['list'], ['html', { open: 'never', outputFolder: process.env.PW_HTML_DIR || 'production-report-chromium' }], ['json', { outputFile: process.env.PW_JSON_FILE || 'production-qa/evidence/chromium-results.json' }]],
 use: { baseURL: '${BASE}', browserName: process.env.PW_BROWSER || 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' }
});
`);
await writeFile('production-qa/live-release.browser.spec.mjs', String.raw`import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
const PERSONAL = 'orbity-personal-path-v1';
const COURSE = 'orbity-dialoga-progress-v1';
const course = { completed: { 'map-1': 1000 }, answers: { 'map-1': 1 }, notes: { 'map-1': 'SYNTHETIC RELEASE QA KEEP course note' }, review: { 'map-1': 2000 }, missionSteps: { 'listen-ten': [true, false, true] }, focusModule: 'needs', currentLessonId: 'needs-1', guidedFlow: { topic: 'needs', step: 1 } };
const courseRaw = JSON.stringify(course);
const raw = (page, key = PERSONAL) => page.evaluate(key => localStorage.getItem(key), key);
const saved = async page => JSON.parse(await raw(page));
async function unchangedCourse(page) { expect(await raw(page, COURSE)).toBe(courseRaw); }
async function noOverflow(page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
async function capture(page, info, name) { await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: true }); }
async function a11y(page) { expect((await new AxeBuilder({ page }).analyze()).violations.filter(v => ['serious', 'critical'].includes(v.impact))).toEqual([]); }
async function seedCourse(page, lang) {
 await page.goto('./?lang=' + lang + '#about');
 // A fresh Playwright context is a hard safety precondition, not a reset operation.
 expect(await raw(page, COURSE)).toBeNull();
 expect(await raw(page)).toBeNull();
 await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: COURSE, value: courseRaw });
 await page.goto('./?lang=' + lang + '#today');
 await page.reload();
 await expect(page.getByTestId('daily-profile')).toBeVisible();
 await unchangedCourse(page);
}
async function exportText(page, lang) {
 const history = page.locator('.personal-history');
 await history.locator('summary').click();
 const [download] = await Promise.all([
  page.waitForEvent('download'),
  history.getByRole('button', { name: lang === 'ru' ? 'Скачать фразы текстовым файлом' : 'Download my phrases as text', exact: true }).click()
 ]);
 expect(await download.failure()).toBeNull();
 return { filename: download.suggestedFilename(), text: await readFile(await download.path(), 'utf8') };
}
for (const lang of ['ru', 'en']) {
 for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test('LIVE normal-motion ' + lang + ' ' + viewport.width + ': entry, local persistence, language, download and old resume', async ({ page }, info) => {
   await page.setViewportSize(viewport);
   await page.emulateMedia({ reducedMotion: 'no-preference' });
   const errors = []; page.on('pageerror', error => errors.push(error.message));
   await page.goto('./?lang=' + lang);
   const scripts = await page.locator('script[src]').evaluateAll(nodes => nodes.map(node => node.src));
   expect(scripts.some(url => url.includes('app-DnbfLWC6.js'))).toBe(true);
   expect(await page.evaluate(() => innerWidth)).toBe(viewport.width);
   expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false);
   const start = page.getByTestId('daily-start');
   await expect(start).toBeEnabled();
   if (viewport.width < 700) {
    const box = await start.boundingBox(); const nav = await page.locator('.sidebar nav').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
   }
   await noOverflow(page); await capture(page, info, 'home-' + lang + '-' + viewport.width);
   await seedCourse(page, lang);
   expect(await raw(page)).toBeNull();
   await capture(page, info, 'profile-' + lang + '-' + viewport.width);
   await page.getByTestId('daily-baseline-2').check();
   await page.getByTestId('daily-register').click();
   await expect(page.getByTestId('daily-phrase')).toBeVisible();
   const phrase = 'SYNTHETIC LIVE QA: мне нужен спокойный вечер для отдыха.';
   const plan = 'SYNTHETIC LIVE QA: попробую сказать это вечером.';
   await page.getByTestId('daily-phrase').fill(phrase); await page.getByTestId('daily-plan').fill(plan);
   await noOverflow(page); await capture(page, info, 'draft-' + lang + '-' + viewport.width);
   await page.getByRole('button', { name: lang === 'ru' ? 'Switch to English' : 'Переключить на русский', exact: true }).click();
   await expect(page.getByTestId('daily-phrase')).toHaveValue(phrase);
   await expect(page.getByTestId('daily-plan')).toHaveValue(plan);
   const other = lang === 'ru' ? 'en' : 'ru';
   await page.getByRole('button', { name: other === 'ru' ? 'Маршрут' : 'Learn', exact: true }).click();
   await page.getByTestId('daily-start').click();
   await expect(page.getByTestId('daily-phrase')).toHaveValue(phrase);
   await page.getByRole('button', { name: other === 'ru' ? 'Switch to English' : 'Переключить на русский', exact: true }).click();
   await page.getByTestId('daily-complete').click();
   await expect(page.getByTestId('daily-done')).toContainText(phrase);
   await page.getByTestId('daily-outcome-no-chance').check();
   const note = 'SYNTHETIC LIVE QA reflection retained.';
   await page.getByTestId('daily-reflection-note').fill(note);
   await page.getByTestId('daily-reflect-save').click();
   await expect(page.getByTestId('daily-reflection-saved')).toContainText(note);
   const personalRaw = await raw(page);
   expect((await saved(page)).sessions).toHaveLength(1);
   await page.reload();
   await expect(page.getByTestId('daily-done')).toContainText(phrase);
   await expect(page.getByTestId('daily-reflection-saved')).toContainText(note);
   await expect(page.getByTestId('daily-complete')).toHaveCount(0);
   expect(await raw(page)).toBe(personalRaw);
   await unchangedCourse(page); await noOverflow(page); await a11y(page);
   await capture(page, info, 'persisted-' + lang + '-' + viewport.width);
   const download = await exportText(page, lang);
   expect(download.filename).toBe('orbity-my-phrases.txt');
   for (const value of [phrase, plan, note]) expect(download.text).toContain(value);
   await info.attach('downloaded-synthetic-phrases', { body: download.text, contentType: 'text/plain' });
   await unchangedCourse(page);
   await page.getByRole('button', { name: lang === 'ru' ? 'Маршрут' : 'Learn', exact: true }).click();
   await expect(page.getByTestId('xp')).toContainText('20 XP');
   await page.getByTestId('resume').click();
   await expect(page).toHaveURL(/#guided/);
   const afterResume = JSON.parse(await raw(page, COURSE));
   for (const key of ['completed', 'answers', 'notes', 'review', 'missionSteps']) expect(afterResume[key]).toEqual(course[key]);
   expect(afterResume.guidedFlow).toEqual(course.guidedFlow);
   expect(await raw(page)).toBe(personalRaw);
   await noOverflow(page); await capture(page, info, 'course-resume-' + lang + '-' + viewport.width);
   expect(errors).toEqual([]);
   await info.attach('live-evidence', { body: JSON.stringify({ observedAt: new Date().toISOString(), viewport, lang, scripts, courseBytesUnchangedDuringPersonalWork: true, oldMapsAndGuidedCursorRetained: true, personalUnchangedByCourseResume: true, sessions: 1, download: download.filename, pageErrors: errors }), contentType: 'application/json' });
  });
 }
 test('LIVE ' + lang + ': all seven sessions with synthetic browser clock, weekly summary and real text export', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const now = Date.parse('2026-10-10T12:00:00Z');
  await page.clock.setFixedTime(new Date(now));
  await seedCourse(page, lang);
  await page.getByTestId('daily-register').click();
  const phrases = [];
  for (let index = 0; index < 7; index++) {
   if (index > 0) { await page.clock.setFixedTime(new Date(now + index * 86400000)); await page.reload(); }
   await expect(page.getByTestId('daily-phrase')).toBeVisible();
   const phrase = 'SYNTHETIC WEEK QA session ' + (index + 1) + ': could we find a calm time to talk?';
   phrases.push(phrase);
   await page.getByTestId('daily-phrase').fill(phrase);
   await page.getByTestId('daily-complete').click();
   await expect(page.getByTestId('daily-done')).toContainText(phrase);
   expect((await saved(page)).sessions).toHaveLength(index + 1);
   await unchangedCourse(page); await noOverflow(page);
  }
  await expect(page.getByTestId('daily-week-summary')).toBeVisible();
  await expect(page.getByTestId('daily-complete')).toHaveCount(0);
  const personalRaw = await raw(page);
  await page.reload();
  await expect(page.getByTestId('daily-week-summary')).toBeVisible();
  expect(await raw(page)).toBe(personalRaw);
  await a11y(page); await capture(page, info, 'weekly-' + lang + '-390');
  const download = await exportText(page, lang);
  for (const phrase of phrases) expect(download.text).toContain(phrase);
  await info.attach('seven-session-text-export', { body: download.text, contentType: 'text/plain' });
  await info.attach('clock-scope', { body: JSON.stringify({ syntheticBrowserClock: true, realElapsedSevenDays: false, savedSessions: 7, courseBytesPreserved: true }), contentType: 'application/json' });
  await unchangedCourse(page);
 });
}
`);
console.log('Prepared live-production checks. No preview server, local app substitution, persistent user profile, main edit or deployment step is used.');
