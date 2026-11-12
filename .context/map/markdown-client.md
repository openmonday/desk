---
type: feat
files:
  - public/app.js
  - public/js/
since: e48f8be
---

# Markdown client, rail, and live updates

## Feature

Fetches the tree and documents, converts markdown in the browser with the vendored parser, renders the rail and article, and keeps both current as files change.

## Constraints

- Treat the server as the only data source: no filesystem access, no generated page content, no external requests.
- Give every rendered heading a stable, deduplicated ID before the rail tree reads it: links and scroll highlighting depend on those IDs.
- Remove task `Status:` and `Blocked by:` lines from the article body: the status strip is the single presentation of those fields.
- Preserve scroll position when a live change reloads the same document, and re-render the rail even when the document itself is unchanged.
- Degrade a markdown parse failure to a diagnostic plus a source `<pre>`; never leave the article blank.
- Respect `prefers-reduced-motion` for smooth scrolling and animations.
- Compute reading progress and the active section from the actual scroll container.

## Architecture

`public/app.js` wires the action registry and starts the page. `js/state.js` owns the model, routes, task-state derivation, and signatures; `js/navigation.js` loads documents; `js/render.js` renders article, graph, rail, and tabs; `js/markdown.js` sanitizes and rewrites local links; `js/live.js` owns the SSE-driven loop. State lives in the single `S` object.
