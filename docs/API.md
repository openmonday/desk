# desk usage and API

A live, read-only view of a `.desk/` workspace or any folder of Markdown. Edit
the files in any editor; the page follows.

```text
src/
├── serve.mjs        HTTP server: reads and live events
├── desk.mjs         CLI: open a path
├── cli/             target detection and hash routes
├── server/          request handling, SSE, static assets, watcher
└── lib/             workspace scanner, docs scanner and reads
public/              shell, styles, client modules, vendored marked
test/                scanner, docs, target, and server tests
tools/shot.mjs       headless screenshot helper
```

No dependencies, no build step. Node 18+.

## Open a path

```bash
npm link                                # once, makes `desk` global
desk                                    # current folder
desk .desk                              # workspace view
desk .desk/features/demo/spec.md        # open that document
desk ~/notes                            # Markdown library
desk ~/notes/guides/install.md          # open that document
```

The target decides the mode:

| Target | Mode |
| --- | --- |
| the workspace root, or a path under `.desk/` | workspace |
| anything else | Markdown library |

A Markdown file outside `.desk/` opens from its own folder (`desk notes/today.md`
serves `notes/`). Workspace files open at their record, feature, or ticket
route. With a file the browser opens automatically. Options: `--no-open`,
`--port <n>`, `--host <addr>`, `--quiet`.

For development without the global link:

```bash
npm start                               # sample workspace, http://127.0.0.1:7777
npm run check                           # scan once, print diagnostics, exit 1 on errors
npm test                                # run the test suite
node src/serve.mjs --docs ~/notes --open
```

## Hash routes

The open document is in the URL fragment, so views can be bookmarked and shared
with yourself.

| Route | Document |
| --- | --- |
| `#/context` | `.desk/CONTEXT.md` |
| `#/architecture/<slug>` | `.desk/arch/<slug>.md` |
| `#/features/<slug>` | feature spec |
| `#/features/<slug>/<n>` | ticket `<n>` of that feature |
| `#/docs/<path>` | a document in a Markdown library |

## Read-only API

The server exposes reads only. `POST`, `PATCH`, and `DELETE` return `405`.

```bash
curl -s 'localhost:7777/api/tree'
curl -s 'localhost:7777/api/doc?path=features/demo/spec.md'
curl -s 'localhost:7777/api/raw?path=features/demo/spec.md'
curl -s 'localhost:7777/api/events'          # SSE
```

Library mode also serves local images, PDFs, and media through a confined
asset route:

```bash
curl -s 'localhost:7777/api/asset?path=guides/images/install.png'
```

It serves only allowlisted extensions under the library root and rejects path
traversal, symlink escapes, and files over 8 MB.

## Live updates

`/api/events` fires when the watcher sees a file change. The page rescans,
updates the open document and rail, and redraws the ticket graph when it is
open. A ticket that just reached `done` is animated: the rail dot pulses, the
graph node shows a check, and a toast names the ticket. No reload, no polling.

## Markdown libraries

`/api/tree` returns `{ mode: "docs", sections: [...] }`. Each top-level folder
is a section; root Markdown files are collected into a section with key `home`
and title `Overview` (so a real `overview/` folder can coexist). Ordering is
deterministic: `README.md` / `index.md`, then other files, then folders, with
natural numeric sorting. Hidden folders and common generated folders are
skipped, and a file opens from the folder you named, not from a parent.

If a top-level `features/` folder contains feature folders (`spec.md` and/or
`tickets/`), that section keeps the feature view: spec, numbered tickets, and
the dependency graph. Every other section stays a plain document tree.

## Diagnostics

`npm run check` (or `node src/serve.mjs --check --docs <dir>`) scans once,
prints a summary, and exits 1 when a diagnostic has severity `error`. The page
also shows diagnostics in the rail. A malformed document is a diagnostic, not a
render failure: it still shows what it can.

## The graph

The graph opens from the network icon in the rail and replaces the article;
choosing a document switches back to reading. The graph and article are two
views of the same work area, so they are never shown together. Every view has an
in-page fullscreen button that fills the browser window; Esc exits.

The graph draws every ticket as a node and every `Blocked by:` entry as an arrow
from blocker to dependent. Layers run left to right by dependency depth;
"ready" means no open blockers. Clicking a node opens that ticket and syncs the
rail to it.
