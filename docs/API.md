# desk usage and API

A live, read-only view of a `.desk/` workspace or any folder of Markdown. Edit
the files in any editor; the page follows.

```text
src/
├── serve.mjs        HTTP server: reads and live events
├── desk.mjs         CLI: open a path, list and stop servers
├── cli/             argument grammar, target detection, hash routes
├── server/          request handling, SSE, static assets, watcher
└── lib/             scanners, settings, reads, running-server registry
public/              shell, styles, client modules, vendored marked, highlight.js, KaTeX
scripts/             setup-cli.sh: link and verify the global `desk` command
test/                scanner, docs, report, target, and server tests
tools/shot.mjs       headless screenshot helper
```

No dependencies, no build step. Node 18+.

## Commands

```text
desk [open] [path] [options]
desk list [--json]
desk kill (--all | <pid>...) [--force]
desk config [command]
desk help [command]
```

`open` is the default command, so `desk notes` and `desk open notes` are the
same. The first positional token is a command only when it is not escaped by
`--`. A folder literally named `list` therefore opens with `desk open list` or
`desk -- list`; `desk list` always lists servers.

The CLI follows these conventions:

- Commands are lowercase verbs: `open`, `list`, `kill`, `config`, `help`.
- Options use kebab-case long names: `--port`, `--no-open`, `--json`.
- Boolean options never take a value; use `--no-<option>` for a negation.
- Value options accept `--name value` or `--name=value`.
- `--` ends option parsing, and `-h` / `--help` prints help.

## Open a path

```bash
npm link                                # once, makes `desk` global
desk                                    # current folder
desk .desk                              # workspace view
desk .desk/features                     # the ticket graph
desk .desk/architecture                 # records and the code graph
desk .desk/architecture/graph.json      # the code graph route
desk .desk/AGENTS.md                    # any other Markdown document
desk .desk/features/demo/spec.md        # open that document
desk ~/notes                            # Markdown library
desk ~/notes/guides/install.md          # open that document
```

The target decides the mode:

| Target | Mode |
| --- | --- |
| the workspace root, or a folder under `.desk/` | workspace |
| `CONTEXT.md`, `architecture/*.md`, a spec, or a ticket under `.desk/` | workspace |
| `.desk/architecture/graph.json` | workspace, code graph route |
| any other Markdown file | library from its own folder |
| another non-Markdown file | error |

A Markdown file opens from its own folder (`desk notes/today.md` serves
`notes/`). Workspace records open at their record, feature, or ticket route; a
workspace folder opens its section (`.desk/features` → graph,
`.desk/architecture` → records plus the code graph when present,
`.desk/features/<slug>` → spec), and the workspace root opens on its Overview
file tree. `desk .desk/architecture/graph.json` resolves to workspace mode and
the `#/architecture/graph` route instead of a Markdown document. Other Markdown under `.desk/`, such as
`.desk/AGENTS.md`, opens as a library of that folder rather than being refused.
With a file the browser opens automatically. Options: `--no-open`, `--port
<n>`, `--host <addr>`, `--quiet`.

For development without the global link:

```bash
npm start                               # sample workspace, http://127.0.0.1:7777
npm run check                           # scan once, print diagnostics, exit 1 on errors
npm test                                # run the test suite
node src/serve.mjs --docs ~/notes --open
```

## Running servers

Each listening server writes a record under
`$XDG_STATE_HOME/desk/servers/<pid>.json` (default
`~/.local/state/desk/servers`), and removes it on exit. `DESK_STATE_DIR`
overrides the directory. Records are advisory; the HTTP server never depends on
them.

```bash
desk list                               # PID, PORT, MODE, URL, TARGET
desk list --json                        # the full records
desk kill 48213                         # stop by PID with SIGTERM
desk kill 48213 48214                   # stop several servers
desk kill --all                         # stop every visible server
desk kill --force 48213                 # SIGKILL instead of SIGTERM
```

`list` prunes records whose PID is no longer alive. `kill` accepts only PIDs
shown by `list`; validate every PID before sending any signal, and refuse to
mix `--all` with PIDs.

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
**Overview** is always the first workspace tab; the configurable sections are
`context`, `architecture`, and `features`. The file lives at
`~/.config/desk/config.json`; `XDG_CONFIG_HOME` moves it and `DESK_CONFIG`
points at another file. A long-running server reads the file per request, so a
browser reload applies the change.

## Hash routes

The open document or code graph is in the URL fragment, so views can be
bookmarked and shared with yourself.

| Route | Document |
| --- | --- |
| `#/overview` | the first Markdown file in `.desk/` |
| `#/overview/<path>` | any Markdown file under `.desk/` |
| `#/context` | `.desk/CONTEXT.md` |
| `#/architecture` | the code graph when present, otherwise the first record |
| `#/architecture/graph` | the architecture code graph |
| `#/architecture/<slug>` | `.desk/architecture/<slug>.md` |
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
curl -s 'localhost:7777/api/codegraph'
curl -s 'localhost:7777/api/events'          # SSE
```

In workspace mode, `/api/tree` also includes `files`, the `.desk/` Markdown
tree used by the Overview tab. Directories have `name`, `path`, `title`,
`count`, and `children`; files have `name`, `path`, `title`, and `mtime`.

When `architecture/graph.json` is present, `/api/tree` adds a small `graph`
summary and never the document itself:

```json
{
  "graph": {
    "path": "architecture/graph.json",
    "root": ".",
    "symbols": 3138,
    "edges": 10000,
    "files": 160,
    "hierarchies": 3000,
    "translationUnits": 20,
    "generator": { "name": "mycel", "version": "0.1.0" },
    "mtime": 1760000000000,
    "bytes": 3269780
  }
}
```

`GET /api/codegraph` returns the full document once it passes the top-level
contract:

```json
{ "ok": true, "path": "architecture/graph.json", "mtime": 1760000000000, "graph": { "...": "..." } }
```

The read is confined to the workspace, cheap for repeated requests (parsed once
per file size and mtime), and refused above 32 MB. A missing graph returns
`404`; malformed JSON or a missing required array returns `422` with an
`error`. The raw file is never served by `/api/doc` or `/api/raw`, and it is
absent from every Markdown tree.

Library mode also serves local images, PDFs, and media through a confined
asset route:

```bash
curl -s 'localhost:7777/api/asset?path=guides/images/install.png'
```

It serves only allowlisted extensions under the library root and rejects path
traversal, symlink escapes, and files over 8 MB.

## Live updates

`/api/events` fires when the watcher sees a file change. The page rescans,
updates the open document and rail, and redraws the ticket graph or the
architecture code graph when it is open. A ticket that just reached `done` is
animated: the rail dot pulses, the graph node shows a check, and a toast names
the ticket. No reload, no polling.

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

The rail roots the Overview at the library folder and every other section at
its own folder, so Questions starts at `questions/` and Architecture at `architecture/`
instead of showing the parent library. The Features view keeps its progress,
spec, and ticket rows under a `features/` root.

LaTeX math is rendered locally with KaTeX. `$...$` and `\(...\)` are inline;
`$$...$$` and `\[...\]` are display, including multiline blocks. Code spans and
fenced blocks are left literal. The KaTeX bundle and fonts load only for a
document that contains a math delimiter.

## Diagnostics

`npm run check` (or `node src/serve.mjs --check --docs <dir>`) scans once,
prints a summary, and exits 1 when a diagnostic has severity `error`. The page
also shows diagnostics in the rail. A malformed document is a diagnostic, not a
render failure: it still shows what it can. The same applies to
`architecture/graph.json`: invalid JSON, a missing required array, or a file
over 32 MB becomes a diagnostic and the Markdown views remain usable.

## The ticket graph

Opening the Features tab, or `.desk/features`, shows the ticket graph instead of
a file. Clicking a node opens that ticket and syncs the rail; choosing a feature
or the graph icon switches back to reading. The graph and article are two views
of the same work area, so they are never shown together. Every view has an
in-page fullscreen button that fills the browser window; Esc exits.

The graph draws every ticket as a node and every `Blocked by:` entry as an arrow
from blocker to dependent. Layers run left to right by dependency depth;
"ready" means no open blockers.

## The architecture code graph

The Architecture tab adds a **Code graph** row when
`architecture/graph.json` exists; `#/architecture/graph` is the shareable
route, and `#/architecture` opens the graph rather than the first record.
`#/architecture/<slug>` still opens that Markdown record, and the record tree
stays in the rail beside the graph.

The view consumes `symbols`, `edges`, and `files` from the mycel contract. It
defaults to callable symbols (`function`, `method`, `constructor`,
`destructor`) and project-internal call edges. Controls filter by name or file,
scope to a folder or file, allow external or unresolved edges, and reveal
non-callable kinds. At most 240 symbols and 2,200 edges are drawn at once; the
count line reports matched, drawn, and hidden totals, so a few-thousand-symbol
graph stays responsive. Symbol selection is deterministic and, when the limit
applies, follows the most connected symbols and their neighbours.

Clicking or keyboard-selecting a symbol shows its kind, name, file, span, and
full in/out edge counts. The layout is deterministic and dependency-free; the
canvas scrolls, starts centered, zooms between 50% and 250%, and is paired with
an accessible table of the rendered symbols. External edges draw blue and
dashed, unresolved edges clay and dashed. The raw `graph.json` never appears in
the rail, Overview, Architecture record tree, search, or startup file list.
