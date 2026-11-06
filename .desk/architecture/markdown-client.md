---
type: feat
files:
  - public/app.js
since: 0ad3833
---

# Markdown client, rail, and live updates

## Feature

Fetches the tree and documents, converts markdown in the browser with the vendored parser, renders the rail and article, and keeps both current as files change.

## Constraints

- Treat the server as the only data source: no filesystem access, no generated page content, no external requests.
- Give every rendered heading a stable, deduplicated ID before the TREE reads it: rail links and scroll highlighting depend on those IDs.
- Remove ticket `Status:` and `Blocked by:` lines from the article body: the meta strip is the single presentation of those fields.
- Preserve scroll position when a live change reloads the same document, and re-render the rail even when the document itself is unchanged.
- Degrade a markdown parse failure to a diagnostic plus a source `<pre>`; never leave the article blank.
- Respect `prefers-reduced-motion` for smooth scrolling and animations.
- Compute reading progress and the active section from the actual scroll container (desktop article pane or mobile document).

## Architecture

`public/app.js` is one IIFE. `refreshTree` and `loadEntry` own data loading; `mdToNodes` sanitizes and IDs the parsed markdown; `renderArticle`, `renderRail`, and `renderTabs` own the view; `updateMeter` and `updateActiveHeading` own scroll state; `scheduleRefresh` and `connectEvents` own the SSE-driven live loop. State lives in the single `S` object.
