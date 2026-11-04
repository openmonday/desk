# desk usage and API

A live, read-only view of a `.desk/` workspace or any folder of Markdown. Edit
the files in any editor; the page follows.

```text
src/
├── serve.mjs        HTTP server: reads and live events
├── desk.mjs         CLI: open a path
├── cli/             target detection and hash routes
├── server/          request handling, SSE, static assets, watcher
└── lib/             workspace scanner, docs scanner, settings, reads
public/              shell, styles, client modules, vendored marked, highlight.js, KaTeX
scripts/             setup-cli.sh: link and verify the global `desk` command
test/                scanner, docs, report, target, and server tests
tools/shot.mjs       headless screenshot helper
```

No dependencies, no build step. Node 18+.

## Open a path

```bash
npm link                                # once, makes `desk` global
desk                                    # current folder
desk .desk                              # workspace view
desk .desk/features                     # the ticket graph
desk .desk/AGENTS.md                    # any other Markdown document
desk .desk/features/demo/spec.md        # open that document
desk ~/notes                            # Markdown library
desk ~/notes/guides/install.md          # open that document
```

The target decides the mode:

| Target | Mode |
| --- | --- |
| the workspace root, or a folder under `.desk/` | workspace |
| `CONTEXT.md`, `arch/*.md`, a spec, or a ticket under `.desk/` | workspace |
| any other Markdown file | library from its own folder |
| a non-Markdown file | error |

A Markdown file opens from its own folder (`desk notes/today.md` serves
`notes/`). Workspace records open at their record, feature, or ticket route; a
workspace folder opens its section (`.desk/features` → graph, `.desk/arch` →
architecture, `.desk/features/<slug>` → spec). Other Markdown under `.desk/`,
such as `.desk/AGENTS.md`, opens as a library of that folder rather than being
refused. With a file the browser opens automatically. Options: `--no-open`,
`--port <n>`, `--host <addr>`, `--quiet`.

For development without the global link:

```bash
npm start                               # sample workspace, http://127.0.0.1:7777
npm run check                           # scan once, print diagnostics, exit 1 on errors
npm test                                # run the test suite
node src/serve.mjs --docs ~/notes --open
```

## Settings

Workspace top-tab order, visibility, and the landing tab are global settings,
changed through `desk config` (Markdown libraries keep their folder tabs):

```bash
desk config                              # show settings and the file path
desk config order features context architecture
desk config default features
desk config hide architecture
desk config unhide architecture
desk config reset
```

`order` sets the tab order, `default` picks the tab that opens when no document
is named, and `hide` removes a tab from the top bar (its routes still work).
Sections are `context`, `architecture`, and `features`. The file lives at
`~/.config/desk/config.json`; `XDG_CONFIG_HOME` moves it and `DESK_CONFIG`
points at another file. A long-running server reads the file per request, so a
browser reload applies the change.

## Hash routes

The open document is in the URL fragment, so views can be bookmarked and shared
with yourself.

| Route | Document |
| --- | --- |
| `#/context` | `.desk/CONTEXT.md` |
| `#/architecture` | the first architecture record |
| `#/architecture/<slug>` | `.desk/arch/<slug>.md` |
| `#/features` | the ticket graph |
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

LaTeX math is rendered locally with KaTeX. `$...$` and `\(...\)` are inline;
`$$...$$` and `\[...\]` are display, including multiline blocks. Code spans and
fenced blocks are left literal. The KaTeX bundle and fonts load only for a
document that contains a math delimiter.

## Diagnostics

`npm run check` (or `node src/serve.mjs --check --docs <dir>`) scans once,
prints a summary, and exits 1 when a diagnostic has severity `error`. The page
also shows diagnostics in the rail. A malformed document is a diagnostic, not a
render failure: it still shows what it can.

## The graph

Opening the Features tab, or `.desk/features`, shows the ticket graph instead of
a file. Clicking a node opens that ticket and syncs the rail; choosing a feature
or the graph icon switches back to reading. The graph and article are two views
of the same work area, so they are never shown together. Every view has an
in-page fullscreen button that fills the browser window; Esc exits.

The graph draws every ticket as a node and every `Blocked by:` entry as an arrow
from blocker to dependent. Layers run left to right by dependency depth;
"ready" means no open blockers.
