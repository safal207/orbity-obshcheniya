# PR #2 legacy Chromium acceptance

Two bounded checks use native Chromium and Web Locks in isolated contexts: the original two-tab scenario and a lesson write-rejection scenario repeated in RU and EN.
The runner tests the exact application commit `5a5f4c2c71a5474e82c9fef22ad32bb302cf7602`, not React or the GitHub synthetic merge.
The harness is checked out from the current PR #2 head. Before browser navigation it verifies all 18 files in the exact target checkout, and separately requires the 9 served runtime files (`dist/**` plus `server.mjs`) to remain byte-identical in the current PR head. Workflow, documentation and test-harness files may evolve without invalidating otherwise exact browser evidence.

The scenario completes two distinct lessons through the UI, queues independent note saves behind a real origin lock, verifies no premature write, releases the lock and reloads both tabs. It then queues two edits of the same note, requires an explicit conflict, archives the losing synthetic draft before reload, and checks the accepted saved value in both reloaded UIs. Note transactions must leave all other persisted fields unchanged. Practice actions used to reopen notes may legitimately update review timestamps.

`result.json` records target SHA, harness SHA, workflow SHA, run URL, runtime versions, source verification, completed phases and exceptions. The artifact also contains saved synthetic states, screenshots, trace and exact tested source. Any assertion failure, source drift or blocked browser returns a non-zero exit code. The workflow has no deployment job and only `contents: read` permission.

This does not approve a merge or the full release. It does not cover actual quota/disk exhaustion, corruption restoration, physical Android, manual screen readers or visual acceptance. Unsaved conflicting drafts are tab memory, not durable backups. Python dependency versions and action commits are pinned; the hosted runner image and OS/browser system packages are not a hermetic environment.

The earlier local execution was blocked by `ERR_BLOCKED_BY_ADMINISTRATOR`; no environment policy is changed here. A green remote result must be read from the completed job and its artifact, not inferred from this README.

## Injected lesson write failure and retry

`write_failure.py` reuses the original exact-source verification without changing `acceptance.py`, application files, dependencies, action pins or two-tab assertions. A separate workflow step executes it after the existing two-tab acceptance.

For each language, a fresh browser context saves one baseline lesson and a note through the UI, then opens an uncompleted full lesson and waits for bookmark persistence. Only then the test temporarily replaces `Storage.prototype.setItem` for the progress key on `localStorage`, counts the attempted completion write and throws a synthetic `QuotaExceededError`. Reads, all other keys and native Web Locks remain intact.

Acceptance requires the localized error to be visible, no `.result.good`, the answer to remain available, unchanged header progress, byte-identical persisted JSON, and one completed lesson in the live Progress screen and after reload. Removing the fault must allow the same correct answer to complete the target lesson; the existing note/lesson and other fields must remain intact. A second reload must show both completed lessons. This retry is a positive control against a nonfunctional button masquerading as safe failure.

Results are separate under `write-failure/`: aggregate and per-language `result.json`, before/rejected/retry states, screenshots and traces. A rejected assertion or blocked browser is a non-zero exit; it is never converted into PASS. The original `result.json` still reports only the unchanged two-tab scenario. This is injected error handling, not a test that physically fills storage. No new complete visual, accessibility or release approval is implied.
