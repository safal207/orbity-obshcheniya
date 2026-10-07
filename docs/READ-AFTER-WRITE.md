# Read failure after a committed progress write (React preview)

App.refresh() now returns whether it loaded a valid progress snapshot. The
loaded flag is still set on either outcome. App.write() only returns UI success
and clears the current error after a successful refresh; a failed read retains
its existing localized storage alert and suppresses the caller's success state.
The operation may already have committed. Nothing rolls it back or silently
repeats it. Check again rereads the existing snapshot without writing; the
committed completion, practice answer or guided cursor becomes visible when
reading works again. XP remains derived from the saved completion map.

This deliberately leaves storage transactions, locks, schema, imports/exports,
lesson-start validation, note handling, copy and content unchanged. It does not
promise crash-proof persistence or solve every other error/draft recovery path.
The change handles the post-write refresh outcome, not a failed write itself.
Existing write-failure, conflict and pending-unload behavior stays covered by
the existing browser suite.

Six new real-Chromium tests cover full lessons, guided answers and practice in
RU/EN at 320px. They perform the real keyed setItem successfully and then inject
getItem failures in only the writing tab. A separate unpatched tab reads the
committed bytes. Assertions require exactly one write, a visible error while
reads fail (including another Check again), no false success, and recovery plus
reload with identical saved bytes and no duplicate XP. Tests include screenshots
and scoped Axe checks of error states. Synthetic fault injection is not evidence
that a particular browser naturally produces this exact failure sequence.

Run: cd react-preview && npm test && npm run build && npm run test:browser.
Model tests and screenshots alone do not establish browser behavior. See the PR
for exact-source CI evidence and any separately inspected captures. Physical
Android, manual screen-reader use and full visual acceptance remain separate.
No merge, Pages publication, dependency or workflow change is included.
