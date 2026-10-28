# Public React site with Lumi

The public entrypoint is the React application in `react-preview`. Pages serves
its production build instead of the former `dist` interface. The original Lumi
artwork, existing RU/EN course content and v1 browser-storage key are retained.
This release does not migrate, reset or upload visitors' saved data.

Both `index.html` and `en.html` load the same application. Existing lesson,
practice, module, mission and guided hash links retain their destinations.
An explicit `?lang=ru` or `?lang=en` wins over the HTML filename, so changing
language keeps the current route and survives reload.

Review selects up to four completed lessons, preferring those due for review.
It has an empty state, question-by-question feedback and a session result.
Practice and review do not award duplicate XP or complete an unfinished lesson.
Lesson, practice and review feedback offer the example, honest clipboard-copy
feedback and the existing note editor. Saving still uses the shared Web Lock
store, and successful UI feedback depends on a committed, readable write.

## Personal results and full backups

Progress starts with the visitor's saved phrase, practice plan and self-reported
experience. Tried, difficult, no opportunity and unrecorded remain distinct;
they are not a relationship score. The next action uses the latest recorded
experience, and the saved course topic explains how course work relates to the
needs-and-requests personal path. A completed week can be compared and revisited
without resetting it or awarding course XP.

Export includes the personal profile, sessions, phrases, plans and reflections
in a full v2 file whenever a personal path exists. Course-only visitors retain
the original v1 export. Both are downloaded locally; no notes are uploaded.
V1 imports replace only course data and preserve personal storage byte for byte.
V2 imports validate both sections before confirmation and replace both after
explicit confirmation. File limits are 512 KiB for v1 and 1 MiB for v2.

Full restore owns the existing course lock, then the personal lock, and compares
both original storage tokens before writing. Personal revisions advance past
both the current and imported revision so an old reflection form cannot silently
overwrite restored data. Unsaved course or personal drafts, including hidden
forms, block import. Pending writes block the export/restore controls.

The two localStorage keys do not provide crash-atomic transactions. A detected
write failure rolls back both previous values while holding both locks; it never
reports success. If the browser also rejects rollback, the UI offers the original
raw bytes as a recovery download. That recovery file preserves evidence for
manual recovery; it is not a normal importable v1/v2 backup. Browser/process
termination between key writes remains a platform limitation. No existing data
is migrated merely by opening this release.

Creator, exercise principles and sources of ideas are reachable from the footer.
Source links do not claim clinical validation or endorsement of this app.

## Build and verification

Use Node 22.12+:

```sh
cd react-preview
npm ci
npm test
npm run build
node scripts/verify-build.mjs
npx playwright install chromium firefox
npm run test:browser
PW_BROWSER=firefox npx playwright test tests/guided-restart.browser.spec.mjs
npm run preview -- --port 4173
```

Open `http://127.0.0.1:4173/` or `/en.html`. `node server.mjs` intentionally
continues to serve the prior `dist` application for regression comparison.

`package-lock.json` locks direct and transitive dependencies. The npm registry
audit on 2026-10-07 reported zero known vulnerabilities, including development
dependencies; this is a point-in-time result rather than a security guarantee.
Both workflows pin third-party Actions to verified immutable commit IDs.

## Publication

The Pages workflow retains the legacy bilingual/store/UI checks and calls the
shared React acceptance workflow. That workflow builds once, verifies both HTML
entries and relative assets, then runs the complete Chromium suite and the
Firefox guided-restart suite. Only after success does it export the accepted
website artifact. Pages downloads that artifact in the same workflow run and
publishes it without checking out or rebuilding different code.

The shared acceptance workflow also runs the personal-result and full-backup
scenarios in Firefox, including real two-tab restore conflicts. Browser tests
are discovered by the `*.browser.spec.mjs` pattern so new acceptance files cannot
be silently omitted from the suite.

PRs and manual feature-branch runs perform validation only. Deployment requires
a successful main-branch run, both validation jobs and the main-only condition.
Its queue is separate from PR validation, so updating a PR cannot cancel a live
main publication. Revert the release commit to restore the former Pages setup;
the legacy source remains available in `dist`.

## Verification limits

Browser acceptance covers narrow/wide RU/EN screens, loaded Lumi artwork,
keyboard focus, reduced motion, automated accessibility, old links, storage
failures, import/export and actual two-tab Web Locks. The Firefox regression
checks the queued note in persisted JSON and in both tabs after reload, not
only a saved-status label.

No physical Android device was connected during this release preparation.
Manual spoken screen-reader use is also unverified. Mobile browser emulation,
keyboard checks and Axe do not establish those two forms of acceptance.
They remain explicit follow-up checks rather than completed preview tasks.

Already-open tabs continue running their previously loaded code until reload.
Save or export notes before reloading; an unsaved draft exists only in its tab.
