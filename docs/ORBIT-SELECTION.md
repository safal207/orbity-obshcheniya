# Safe orbit selection in the React preview

This focused change is stacked on Lumi PR #4 at
`1a65a622326b697c6b0bb6d89dc556c429a008b6`. It does not merge the PR stack,
change the Pages entry point, migrate data, alter lessons or award XP.

`store.selectModule(id)` validates a real module id and updates only
`focusModule`, reading the latest snapshot under the existing origin-wide Web
Lock. It preserves completed, answers, notes, review, missionSteps,
currentLessonId and guidedFlow. This additive method is not called by the
legacy RU/EN interfaces; their existing operations are unchanged.

The React picker is disabled while writes are pending or state is unreadable.
Its displayed selection changes only after successful persistence. On a write
error, unavailable lock or lock timeout, it retains the previous choice and
uses the existing localized error message. Select the desired orbit again to
retry. No optimistic success or separate progress key is introduced.

A normal root/path reload restores the stored orbit. Explicit lesson and
legacy `#module/<id>` deep links take precedence without silently writing
progress; selecting a new orbit from a legacy module link updates that hash
only after saving. A delayed write cannot move a view visited while waiting
for the lock. Another tab's storage events refresh progress but do not move the
current view; reloading reads the latest committed orbit. Concurrent choices
are serialized; the last committed choice becomes the reload preference.

Changing the displayed orbit is not a request to abandon a saved lesson or
introduction. Continue therefore still follows an existing unfinished lesson
or guided cursor. No new learning state or backup version is introduced.

## Verification

- `node --test tests/progress-safety.mjs tests/ui-safety.mjs tests/workflow-safety.mjs`
  includes eight additional store regression tests: all module ids, preservation,
  interleaved edits, ordered choices, replacement recovery and fail-closed errors.
- `node tests/locales.mjs && node tests/ui-smoke.mjs` checks unchanged legacy
  content alignment and UI contracts.
- `cd react-preview && npm test && npm run build && npm run test:browser`
  retains all prior acceptance and adds `tests/orbit.browser.spec.mjs` to the
  explicit Playwright test list. Thirteen new real-browser cases cover RU/EN,
  root reload, language changes, empty storage, bookmarks/guided cursor,
  module deep links, two-tab notes/selections, delayed navigation, write
  rejection/retry, unavailable locks and a real 5-second lock timeout.
- New 320px screenshots and scoped Axe checks cover restored selection and
  save errors in both languages. Existing viewport checks remain enabled.

Model tests are not browser evidence. Screenshot generation is not manual
visual review. Exact-head CI results and any separately inspected captures
belong in the PR verification record. Physical Android, manual screen reader,
full migration acceptance and publication approval remain separate gates.
