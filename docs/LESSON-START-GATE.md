# React final-step completion requires a saved lesson start

Scope: the isolated React preview. A fresh `#lesson/<id>/2` link no longer
exposes a completion quiz without a saved full-lesson bookmark. The localized
screen offers an explicit return to step one. Merely opening, reloading or
changing the language of that guarded link performs no progress writes.

The existing v1 `currentLessonId` matching the lesson, with `guidedFlow == null`,
is the start/resume signal. No storage key, schema field or migration is added.
A valid old backup carrying that bookmark continues to resume; a guided cursor,
even with the same lesson id, is not a full-lesson start. The explicit start
uses the existing safe `selectLesson` operation; failed writes do not unlock
the quiz. Existing practice/review paths remain separate and do not award XP
for an uncompleted lesson.

`createProgressStore({ requireLessonStart: true })` is enabled for React. The
same condition is checked inside its existing locked lesson-answer transaction,
not just against cached UI state before awaiting the lock. If another tab has
changed the saved lesson or started guided work, the old queued answer fails
with `LESSON_NOT_STARTED` and writes nothing. The user can explicitly start the
lesson again; no other tab's progress is silently erased by that stale answer.
Legacy callers retain the default `requireLessonStart: false`, so this is not
a change to the published legacy course or a claim of legacy-browser coverage.

This is an accidental-route/consistency guard, not anti-cheat or proof that
someone read every paragraph or visited every step. It trusts a validated
existing bookmark, including one restored from backup. User-controlled local
storage and imported data are not server-attested achievements. No timings,
life penalties or new completion records are introduced.

Verification:
- New real Chromium cases in `lesson-start.browser.spec.mjs`: RU/EN at 320px,
  empty/foreign/guided bookmarks, explicit start and reload, one-time completion,
  start-write rejection/retry, a real two-tab Web Lock race and practice-only XP.
- Nine separate model cases in `lesson-start.test.mjs`, including atomic guard,
  restoration, map preservation, failure and unchanged legacy defaults.
- The two existing Lumi save-feedback cases now establish the lesson through
  its reading/exercise UI before injecting save faults. Their feedback, XP,
  byte-preservation, reduced-motion and accessibility assertions are unchanged;
  relying on an unstarted final link would contradict this task's new contract.
- Existing browser tests remain enabled with zero retries. Generated captures
  are not manual review; exact-head results and any inspected screenshots are
  recorded separately in the PR. Physical-device/screen-reader checks are not
  implied by Chromium automation.

No merge, Pages deployment, dependency or workflow changes are included.
