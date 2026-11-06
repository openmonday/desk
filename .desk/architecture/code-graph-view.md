---
type: feat
files:
  - src/lib/codegraph.mjs
  - src/lib/tickets/scan.mjs
  - src/server/http.mjs
  - src/cli/target.mjs
  - src/lib/workspace-files.mjs
  - src/server/report.mjs
  - src/serve.mjs
  - public/js/codegraph.js
  - public/js/codegraph-layout.js
  - public/js/state.js
  - public/js/article.js
  - public/js/navigation.js
  - public/js/hash.js
  - public/js/rail.js
  - public/styles/codegraph.css
since: ef12e279cc174fdc413d8514ca07ca2bc6f7696d
---

# Architecture code graph

## Feature
desk reads mycel's `.desk/architecture/graph.json` and renders its symbols and
call edges as an interactive code graph in the Architecture section. The graph
file is a data input, never a document; opening it directly lands on
`#/architecture/graph`, while Markdown architecture records keep their routes.

## Constraints
- `architecture/` is the architecture record folder; `architecture/graph.json` is the only non-Markdown workspace input and stays read-only.
- Never list graph.json in Overview, the Architecture document list, the rail, startup lists, search, `/api/doc`, or `/api/raw`.
- Validate the top-level mycel contract and degrade a malformed graph to a workspace diagnostic without breaking Markdown views.
- Read the graph through a realpath-confined path with the 32 MB cap and size/mtime cache; `/api/tree` carries only a summary and `/api/codegraph` serves the full document.
- Map a direct graph.json target to `#/architecture/graph` and an `architecture/` target to `#/architecture`.
- Default the view to callable, project-internal symbols and cap rendered nodes and edges; external and unresolved edges are opt-in.
- Keep the ticket graph and every existing Markdown route unchanged.
- Add no runtime dependencies and no mutation endpoints.

## Architecture
`src/lib/codegraph.mjs` confines, validates, and caches the document; the
scanner adds a small summary to the workspace model; the server exposes
`GET /api/codegraph`; `src/cli/target.mjs` owns the graph routes. The client
builds the filtered model in `public/js/codegraph.js`, lays it out
deterministically in `codegraph-layout.js`, and styles it with
`public/styles/codegraph.css`. The Architecture tab composes the graph with the
Markdown records.
