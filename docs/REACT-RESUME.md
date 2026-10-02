# React preview: resume and guided entry

This increment extends draft PR #3 on its existing PR #2 safety base. It does not
change `dist/`, the production Pages workflow, the v1 schema or course content.

## User-visible behavior

- The path restores the saved module once; an explicit lesson URL wins over it.
- Continue resumes an incomplete bookmarked lesson, then the next incomplete
  lesson in its module, then the remaining course. With every lesson completed,
  it opens Progress rather than inventing an incomplete lesson.
- Explicit in-app full-lesson navigation saves `currentLessonId`/`focusModule`
  under the existing Web Lock before navigating. It does not mark completion.
- The lesson screen is encoded as `#lesson/<id>/<0..2>` for reload and browser
  Back/Forward. Opening the root resumes the **lesson**, not its inner screen.
  The v1 backup does not acquire a new screen field or require a migration.
- Choose a situation ports the three existing guided topics and their original
  lesson sequence. Question feedback includes the existing example, clipboard
  copy with an honest failure message, and the existing optional note editor.
- Guided progress resumes from `guidedFlow.step`, including its result screen,
  in RU and EN. Legacy `#guided/0..2` and `#guided-done` consume that saved step;
  changing a URL cannot skip questions or fabricate completion.
- Guided answers advance only that cursor. No full-lesson completion, answers,
  review timestamp, mission checkmarks or XP are awarded by the introduction.
- Topic/step checks plus the existing token-checked `store.replace` transaction
  reject stale queued answers when another tab changes data. A concurrent note
  may cause a conservative conflict; it is never silently overwritten.
- Storage/lock failures must not navigate successfully or advance a question.
  A delayed save must not pull the user back after they navigate elsewhere.

## Verification contract

Run `cd react-preview && npm install && npm test && npm run build`, then
`npx playwright install chromium && npm run test:browser`.

The added unit tests cover route validation, legacy resume, module progression,
read-failure distinction and token-CAS failure controls. The CAS fake is not
browser evidence: the Chromium suite separately holds actual Web Locks and
queues a competing topic change before a stale answer.

The original 13 browser cases remain. Two negative controls now compare the
complete before/after snapshot rather than expect null: reaching a lesson quiz
now legitimately persists a bookmark, but never completion. Added browser cases
cover all three introductions, reload/language continuity, wrong answers,
blocked writes, legacy URL skip attempts, a queued cross-tab conflict, legacy
bookmarks, Back/Forward and narrow-screen focus/layout.

Only a completed Actions run at the exact feature head is a green gate. The
artifact includes `source-tested.tar.gz` from the checkout's exact HEAD, the
production bundle, dependency lock and browser report. A pull-request checkout
may be a synthetic merge ref; distinguish it from the feature head in reports.

## Remaining release gates

This closes the guided-entry/example and navigation-resume implementation items
from the original preview backlog, subject to the above acceptance checks. It
is not full legacy route parity: dedicated mission/review/about route parity,
physical Android, screen-reader/manual accessibility, dependency lock review
and CI action pinning still need review. PR #2 must be reviewed separately;
owner approval is required before merge/retarget/Pages publication. No deploy
is requested or performed by this increment. Old already-open legacy tabs
still need a controlled reload on any future release. Unsaved note drafts
remain in the open tab only, not durable backups.
