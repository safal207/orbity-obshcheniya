# Pending-write exit warning (React preview)

The existing beforeunload handler now checks both local note drafts and a live
ref counting operations inside App.write(). Incrementing before the operation
starts and decrementing in finally avoids a stale React-state closure and
covers Web-Lock waits, success, rejection and timeout. Notes keep their existing
draft-based protection; an unrelated completed write cannot discard a draft.
The guard itself does not read/write progress, retry a save or award XP.

This is a browser confirmation, not a forced navigation lock. Staying keeps the
original document and queued operation alive. The user may choose to leave;
then an uncommitted answer can be lost. The browser controls dialog wording
and language, requires prior user interaction, and may omit the event when a
mobile browser is killed or backgrounded. No guaranteed mobile persistence,
crash recovery or background-save claim is made. The existing always-registered
listener strategy is unchanged by this focused fix.

Tests in react-preview/tests/pending-unload.browser.spec.mjs use actual Chromium
beforeunload dialogs and a native Web Lock held in another tab. They do not
replace these with dispatched events. RU/EN at 320px covers reload/close with
Stay, a pending answer after internal navigation, clean exits after success or
write/timeout failure, retained note-draft protection and explicit Leave.
Saved bytes and successful-write counts are checked. Native dialog observations
are attached to the Playwright report; screenshots show application states,
not the browser-native dialog itself.

Run: cd react-preview && npm test && npm run build && npm run test:browser.
Model tests and generated screenshots alone are not browser interaction proof.
Exact-source CI and bounded screenshot review belong in the PR verification.
Physical Android, other browsers and manual screen-reader use remain separate.
No merge or Pages publication is included.

References:
- https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
- https://playwright.dev/docs/dialogs#beforeunload-dialog
