# 04: Add live updates, reading progress, and diagnostics

Status: done
Blocked by: 02

## What to build

The event-stream connection, live tree and document refresh with scroll preservation, reading-progress meter, read-time estimate, task and spec meta strips, diagnostics, and empty states.

## Acceptance criteria

- [x] Saving a file emits an event and refreshes the rail and open document without a reload.
- [x] Scroll position is preserved when the open document reloads.
- [x] The connection indicator reads live or reconnecting.
- [x] Progress percentage follows the reading position and the matching TREE item highlights.
- [x] Read time is computed from word count.
- [x] Tasks show status, blocked-by numbers or unblocked; specs show done/total tasks.
- [x] Diagnostics appear in an expandable rail list.
- [x] Empty states name `/setup-context`, `/to-spec`, or `/to-tasks`.
- [x] Malformed markdown degrades to a diagnostic and source fallback.

## Constraints

No mutation path. SSE only. Progress and active section read the actual scroll container.

## Verification

Changed a task status while the server was running; `/api/events` emitted a change and `/api/tree` reported the new status and progress.
