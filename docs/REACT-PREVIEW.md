# React orbit path — staged migration, not a production switch

Base: progress-safety PR #2 at `5a5f4c2c71a5474e82c9fef22ad32bb302cf7602`.
User direction: brighter, more appealing React UI with a short-lesson path and
supportive gamification inspired by Duolingo, using our own orbital identity.

## What this slice implements

- React + Vite preview in `react-preview/`; no changes to the published `dist/`.
- All 8 modules, 32 lessons and 6 missions imported from the existing RU/EN
  course modules, not copied or re-authored. Language switching stays in the SPA.
- Original CSS orbital companion, raised buttons, a lesson path, unit selector,
  a 3-step full lesson, standalone practice/review, real-life mission checkboxes,
  progress, notes and backup import/export. All lessons remain accessible.
- Lifetime XP is **derived**: 20 per first completed lesson. No parallel reward
  ledger, no duplicate reward for replay, no penalties or lost lives. The series
  counts local calendar days of first completions only, NOT all practice activity.
- The existing strict Web-Lock store is reused unchanged. Same v1 key and IDs;
  no destructive data migration. Correct answers earn completion only after a
  successful full-lesson save. Practice does not complete an unfinished lesson.
- Tab-memory note drafts, 700 ms autosave, retry, explicit conflict messages,
  unload warning, import blocked by drafts, strict import before confirmation,
  token-checked replacement, and explicit recovery from corrupt saved data.
- No analytics, accounts, paid assets, external fonts or generated fake users.

## Run the preview

Use Node 22.12+ (local work used Node 22.16.0):

```sh
cd react-preview
npm install
npm test
npm run build
npm run preview
# For browser acceptance:
npx playwright install chromium
npm run test:browser
```

The build uses relative asset URLs and hash routes. English: `/?lang=en`.
It is not yet mounted at the public website; the existing Pages workflow is
unchanged. The new workflow uploads a review artifact and cannot deploy Pages.
Direct dependencies are exact-pinned; commit the generated lockfile after the
first successful dependency resolution before treating the build as locked.

## Verified locally in the authoring environment

- `npm test`: 14 model/import tests PASS, Node 22.16.0.
- Browser test source covers widths 320/390/768/1280, actual RU/EN tabs, notes,
  same-note conflicts, quota failures, corrupt storage recovery, invalid import,
  no duplicate XP, fresh review answers and mission persistence.
- Local environment cannot resolve github.com or npm; React dependencies are
  unavailable locally. Build, rendered appearance and browser assertions are
  **NOT locally verified**. Read the new GitHub Actions run for their result.
- Previous PR #2's 102 tests do not prove the React UI works. Existing validation
  remains intact and separate from this preview's acceptance suite.

## Open tails and release gate

1. PR #2 is still unmerged. Do not close it as superseded: the preview depends on
   its safety store. Stacked review targets `fix/progress-safety-and-pages-ci`.
2. Require a successful preview build + browser acceptance, then inspect the
   uploaded screenshots. Green model tests are not a visual or two-tab pass.
3. Complete parity for the legacy guided-entry/phrase flows before replacing the
   original UI. Stored guidedFlow/navigation fields are retained but not consumed
   as React resume navigation yet. This is a first slice, not total feature parity.
4. Test a real Android device, browser Back/Forward, long notes, private-storage
   restrictions, keyboard navigation and accessibility before release. Automated
   Chromium checks alone do not cover those devices and assistive technologies.
5. Reconcile and commit dependency lock, review transitive dependency audit, and
   pin CI dependencies as part of release hardening. No supply-chain audit claimed.
6. Owner approval is required before changing the Pages entrypoint or merging
   the safety PR. Reload all old RU/EN tabs when releasing: old app code does not
   cooperate with the lock. Unsaved tab drafts are not durable backups.

Boundaries: local browser persistence only, no device sync or authorization
claims. This learning tool is not therapy or evidence of relationship outcomes.
No Duolingo logos, mascots, copied illustrations or proprietary course content.
