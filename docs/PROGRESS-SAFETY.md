# Progress safety: audit items 1–4

Integrated with main `529b8c52e113835df9b332f70cf50916b8292ca4` after the
initial repair was prepared against `32211982`. The newer one-question UI,
guided onboarding, automatic note saving, lesson-completion rules, existing
skip-link handler, markup, styles, course content and enhanced smoke tests
are preserved. The reconciliation commit has both histories as parents.

## Persistence contract

RU and EN use `dist/progress-store.js` with the existing
`orbity-dialoga-progress-v1` key. Each save acquires the same-name exclusive
Web Lock, reads the latest saved state, changes only the requested fields,
and writes once. State and success messages change only after `setItem`
succeeds. Lock acquisition has a five-second abort timer; no prompt or await
occurs within the synchronous read/modify/write callback.

Imports validate all five maps before the replacement prompt: timestamps,
answer indices, note strings (maximum 2,000 characters), and exact boolean
mission-step arrays. Map arrays/nulls, unknown IDs, bad values, unsupported
versions, missing maps and unexpected fields are rejected, not dropped.
Both legacy five-map v1 exports and the newer v1 exports with `focusModule`,
`currentLessonId` and `guidedFlow` work. Optional navigation fields are
validated and preserved. A storage change after the confirmation snapshot
aborts replacement. Unsaved/pending local notes block imports.

Independent tab edits rebase on current saved state. Conflicting notes compare
against the editor baseline and are rejected, not silently replaced. Autosaves
queue in typing order; only successful saves advance that baseline. A persistent
note status reports saving/saved/error, and a retry button retries retained text.
Failed/pending drafts stay in this tab's memory across SPA navigation. Storage
and focus refresh do not re-render over such drafts. A `beforeunload` handler
requests a browser warning before leaving with unsaved text; it is not a backup
or a guarantee that a browser will display the warning. Copy important drafts
before closing/reloading. To resolve a cross-tab conflict, copy the local draft
and reload to compare it with the saved remote note.

Only full-lesson answers mark lessons complete; guided and standalone practice
retain the newer main branch's distinct behavior. Topic/lesson navigation also
uses coordinated writes. A stale guided answer cannot advance a different topic.
Exports read fresh saved data; they do not include unsaved local drafts.
Failed answer/mission/import writes do not advance the visible saved progress.

## Boundaries and rollout

Saving requires Web Locks in a supported browser on HTTPS/localhost. There is
no unsafe unlocked fallback: reads/browsing remain available; failed saving is
explicit. Reload all previously open RU/EN tabs after deployment. Old pre-fix
code does not acquire the lock, so mixed-version tabs are outside this contract.
This is local browser persistence, not cross-device sync or protection against
user-cleared storage, corruption, or uncooperative scripts. Corrupt stored data
blocks ordinary writes without silently dropping values. A validated backup can
restore it through the explicit replacement prompt; a raw-token comparison still
rejects an intervening repair from another tab. Import validation is not relaxed.
Focus refresh skips unchanged state; when data changes it restores scroll, open
disclosures and the focused field/selection. Repeated read-error toasts are
suppressed until the storage state recovers.

PR checks use `orbity-pr-<number>`; main publication retains `github-pages` and
does not cancel running publication. Deploy also requires validation and
`refs/heads/main`. Queue isolation is not a promise to deploy every main push.

The old audit's review/layout/navigation items need acceptance against the
newer interface; this PR does not declare all remaining audit items closed.
No relationship-effectiveness or therapy claim is changed.

## Executed checks

```sh
node --check dist/app.js
node --check dist/app.en.js
node --check dist/course.js
node --check dist/course.en.js
node --check dist/progress-store.js
node tests/locales.mjs
node tests/ui-smoke.mjs
node --test tests/progress-safety.mjs tests/ui-safety.mjs tests/workflow-safety.mjs
git diff --check
```

Node 22.16.0: both enhanced upstream scripts pass; **102 new tests pass**.
The same 50 black-box UI cases against main `529b8c52` produce **42 failures
and eight passes**. Set `ORBITY_APP_DIR` to that revision's original dist folder
to reproduce the negative control with `node --test tests/ui-safety.mjs`.
Earlier verification on the original pre-redesign base was superseded by this
integrated run; it is not used to claim acceptance of the new UI.

Storage tests use a serialized lock test double; UI tests use DOM stubs;
workflow assertions inspect configuration, not a live queue experiment.
Chromium navigation was blocked in this environment with
`net::ERR_BLOCKED_BY_ADMINISTRATOR`. No real-browser two-tab, visual, or
live-site verification is claimed. Before merging, exercise RU/EN parallel
writes, note conflicts, rapid typing, storage failures and old/new imports in
an actual browser. Keep the PR unmerged until owner approval and acceptance.

References:
- https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
