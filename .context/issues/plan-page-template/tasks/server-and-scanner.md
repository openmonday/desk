# 01: Build the read-only server and workspace scanner

Status: done
Blocked by: None

## What to build

A dependency-free local server that serves the shell and exposes the tree, document, raw markdown, and event-stream routes, backed by a scanner that turns `.context/` markdown into the navigation model and diagnostics.

## Acceptance criteria

- [x] `node src/serve.mjs` serves the shell and the five read routes on localhost.
- [x] `/api/tree` matches the documented shape for the glossary, map records, issues, tasks, progress, and diagnostics.
- [x] `/api/doc` returns raw markdown and mtime; `/api/raw` returns the markdown body.
- [x] Non-GET/HEAD requests receive 405 and document paths cannot escape `.context/`.
- [x] `--check` prints counts and diagnostics and exits 1 on errors.

## Constraints

Read-only server and scanner. No dependencies, no build step. Malformed content becomes diagnostics.

## Verification

Scanner and server exercised with a temporary workspace: 1 issue, 2 tasks, 1 map record; dangling blocker reported as an error.
