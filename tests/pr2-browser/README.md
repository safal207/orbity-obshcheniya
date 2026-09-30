# PR #2 legacy Chromium acceptance

One scenario, native Chromium and Web Locks, two RU/EN pages in an isolated context.
The runner tests the exact application commit `5a5f4c2c71a5474e82c9fef22ad32bb302cf7602`, not React or the GitHub synthetic merge.
The harness is checked out from the current PR #2 head. Before browser navigation it compares every one of the 18 original files with the target checkout and with the current head. A changed original file fails the gate instead of silently validating a stale target.

The scenario completes two distinct lessons through the UI, queues independent note saves behind a real origin lock, verifies no premature write, releases the lock and reloads both tabs. It then queues two edits of the same note, requires an explicit conflict, archives the losing synthetic draft before reload, and checks the accepted saved value in both reloaded UIs. Note transactions must leave all other persisted fields unchanged. Practice actions used to reopen notes may legitimately update review timestamps.

`result.json` records target SHA, harness SHA, workflow SHA, run URL, runtime versions, source verification, completed phases and exceptions. The artifact also contains saved synthetic states, screenshots, trace and exact tested source. Any assertion failure, source drift or blocked browser returns a non-zero exit code. The workflow has no deployment job and only `contents: read` permission.

This does not approve a merge or the full release. It does not cover storage write failure, corruption restoration, physical Android, manual screen readers or visual acceptance. Unsaved conflicting drafts are tab memory, not durable backups. Python dependency versions and action commits are pinned; the hosted runner image and OS/browser system packages are not a hermetic environment.

The earlier local execution was blocked by `ERR_BLOCKED_BY_ADMINISTRATOR`; no environment policy is changed here. A green remote result must be read from the completed job and its artifact, not inferred from this README.
