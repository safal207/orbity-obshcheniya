# Progress safety: bounded repair of audit items 1–4

Base: `32211982cb42f5703eb68eec306c3acaa6e1640c` (2026-09-28 audit).
This change does not alter course content, layout, or the progress export version.

## Persistence contract

RU and EN now use `dist/progress-store.js` and the existing
`orbity-dialoga-progress-v1` key. A save acquires that same-name exclusive Web
Lock, reads the latest state, changes only the requested answer/note/mission
step, and writes once. The UI receives the new state only after `setItem`
succeeds. Lock acquisition has a five-second abort timer. No prompt or await
occurs inside the read/modify/write callback.

All five exported maps are validated before showing the replacement prompt:
completed timestamps, answer indices, note strings (maximum 2,000 characters),
review timestamps, and exact boolean mission-step arrays. Arrays in place of
maps, unknown IDs, unsupported versions, missing maps, invalid values and
unexpected fields are rejected rather than silently dropped. Existing complete
v1 exports remain valid, including empty progress and files without `savedAt`.
A changed storage snapshot after the confirmation began aborts an import.

Independent edits in tabs are rebased on the latest saved state. Saving a note
compares its current stored text with the editor's original text; a conflicting
edit is rejected and the local draft stays in the textarea. Copy the draft and
reopen the lesson to see the other tab's note before resolving the conflict.
Storage/focus refresh does not re-render over a dirty textarea. Exports read
fresh saved state, not the tab's cached state. They do not include unsaved drafts.

Storage failure, denied access, invalid stored data, missing Web Locks and lock
wait expiry are errors, not successful saves. A failed mission write restores
the checkbox; a failed answer/import does not advance in-memory progress.
A failed note save leaves its text available for retry.

## Compatibility and limits

Web Locks must be available (use a modern browser on HTTPS or localhost).
There is deliberately no unsafe unlocked write fallback: reading and browsing
remain available, but saving reports an error when safe coordination is absent.
Reload **all** existing RU/EN tabs after deployment. Old pre-fix code does not
cooperate with the new lock, so mixed-version tabs are outside this guarantee.
This is local browser persistence, not device sync, a backup, or a guarantee
against user-cleared storage, storage corruption, or uncooperative scripts.
Malformed stored data is not silently overwritten; normal writes/imports report
an error until the invalid stored entry is deliberately recovered outside this UI.

The separate audit items on review pagination, skip-link routing, unsaved drafts
on navigation/language switching and the 320px layout are not closed here.

## CI isolation

PR checks use `orbity-pr-<number>`; main publication keeps `github-pages` and
never cancels an in-progress publication. Deploy requires both validation and
`refs/heads/main`. This isolates PR validation from pending publication runs;
it does not assert that every intermediate main push is deployed.

References:
- https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency

## Reproduce

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

Local Node 22.16.0 verification: both original scripts pass; 73 new tests pass.
The same 32 black-box UI cases against the original app modules yielded 28
failures and four passes, confirming the tests detect pre-fix behavior. To repeat
that comparison, copy the original app/course modules into a separate directory
and run `ORBITY_APP_DIR=/path/to/original/modules node --test tests/ui-safety.mjs`.

The storage tests use a serialized lock test double; UI tests use a DOM stub.
Workflow checks are static configuration assertions, not a live queue experiment.
A local Chromium navigation attempt was blocked with
`net::ERR_BLOCKED_BY_ADMINISTRATOR`; no real two-tab browser pass, visual pass or
live-site deployment verification is claimed. Browser acceptance should cover
RU/EN parallel writes, conflicting drafts, imports and simulated storage denial
before merging. No relationship-effectiveness claim is changed by this repair.
