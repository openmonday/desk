---
type: feat
files:
  - serve.mjs
since: 0ad3833
---

# Read-only local server for the workspace view

## Feature

Serves the frozen plan-page shell and a small JSON/SSE API over `.desk/`. A browser can open the workspace, follow live changes, and download the raw markdown of any document without any write path.

## Constraints

- Accept only GET and HEAD: the page is read-only by construction and must not grow mutation endpoints.
- Resolve every requested document inside the real `.desk` root: reject traversal, symlink escapes, non-markdown paths, and files larger than 2 MB.
- Emit a restrictive Content-Security-Policy on every response: the page must never call an external origin.
- Keep the server dependency-free and build-free: it runs directly with `node serve.mjs`.
- Watch `.desk` recursively and debounce change events: editors often emit several events for one save.
- `--check` must scan once, print counts and diagnostics, and exit 1 when any diagnostic is an error.

## Architecture

`serve.mjs` owns HTTP, static assets, SSE clients, and the file watcher. It delegates all workspace parsing to `lib/scan.mjs` (`findWorkspace`, `scanWorkspace`, `readDoc`). The client talks to four routes: `/api/tree`, `/api/doc`, `/api/raw`, and `/api/events`. Static routes serve `public/shell.html`, `theme.css`, `app.js`, and the vendored `marked.min.js`.
