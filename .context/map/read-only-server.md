---
type: feat
files:
  - src/serve.mjs
  - src/server/
  - src/lib/servers.mjs
  - src/lib/docs/read.mjs
since: e48f8be
---

# Read-only local server for the workspace view

## Feature

Serves the page shell and a small JSON/SSE API over `.context/`. A browser can open the workspace, follow live changes, and download the raw markdown of a document or the assets beside it without any write path.

## Constraints

- Accept only GET and HEAD: the page is read-only by construction and must not grow mutation endpoints.
- Resolve every requested document and asset inside the real `.context` root: reject traversal, symlink escapes, non-markdown documents, and files larger than their read limit.
- Never serve a path below `reference/`: those are checkouts of other projects, not workspace documents.
- Emit a restrictive Content-Security-Policy on every response: the page must never call an external origin.
- Keep the server dependency-free and build-free: it runs directly with `node src/serve.mjs`.
- Watch `.context` recursively and debounce change events: editors often emit several events for one save.
- `--check` must scan once, print counts and diagnostics, and exit 1 when any diagnostic is an error.

## Architecture

`src/serve.mjs` owns options, lifecycle, and the startup report. `src/server/http.mjs` maps the read routes and static assets, `events.mjs` owns SSE clients, `static.mjs` serves the shell and vendored libraries, and `watcher.mjs` debounces filesystem changes. `src/lib/servers.mjs` records running servers for `desk list` and `desk kill`. Workspace parsing is delegated to `src/lib/scan.mjs`.
