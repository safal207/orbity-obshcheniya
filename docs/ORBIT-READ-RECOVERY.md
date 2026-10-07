# Recover a committed orbit selection after a read failure

The picker now distinguishes a committed store.selectModule() from a rejected
write. If the write committed but App.write() could not reread its result, the
picker marks the existing deferred orbit-restoration flag. After a successful
Check again, the existing path effect reads the latest validated focusModule
and updates both picker and lesson route. No action is replayed and recovery
performs no storage writes. While reads fail, the old choice remains disabled
and the existing localized storage error stays visible.

The successful-save path is unchanged. A failed write does not set the flag,
so an unrelated second-tab change cannot unexpectedly move this tab's active
orbit. If another tab commits a newer choice during the read outage, recovery
uses the latest snapshot rather than replaying the older selection. A newer
explicit module/lesson link keeps precedence; the saved preference is restored
on the next ordinary path visit, not by moving that linked view.

The change preserves all progress maps, the existing lesson/guided bookmark,
XP inputs, v1 import/export, RU/EN copy, Lumi, styling and storage transactions.
It does not add automatic retries, schema fields or a second source of truth.
It is specifically picker recovery, not a redesign of every post-write path.

Eight real-Chromium tests in orbit-read-recovery.browser.spec.mjs cover RU/EN
at 320px: own committed choice, a newer second-tab choice, explicit-link
precedence and rejection before commit. The read failure is injected only after
an actual setItem succeeds; an unpatched tab verifies exact saved bytes. Tests
check one write, no retry writes, reload, language switching, preserved guided
question 2/3, scoped Axe checks and screenshots. This fault injection does not
claim a particular browser naturally produces this sequence.

Run: cd react-preview && npm test && npm run build && npm run test:browser.
CI results and separately inspected captures are recorded on the PR. Model
tests and screenshot generation are not substitutes for browser interaction.
Physical Android, manual screen reader and complete visual acceptance remain
separate checks. No merge, Pages publication or dependency/workflow changes.
