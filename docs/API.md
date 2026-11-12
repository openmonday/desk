# leaf usage and API

A live, read-only view of a `.context/` workspace or any folder of Markdown.
Edit the files in any editor; the page follows.

```text
src/
├── serve.mjs        HTTP server: reads and live events
├── leaf.mjs         CLI: open a path, list and stop servers
├── cli/             argument grammar, target detection, hash routes
├── server/          request handling, SSE, static assets, watcher
└── lib/             scanners, settings, reads, running-server registry
public/              shell, styles, client modules, vendored marked, highlight.js, KaTeX
scripts/             setup-cli.sh: link and verify the global `leaf` command
test/                scanner, docs, report, target, and server tests
tools/shot.mjs       headless screenshot helper
```

No dependencies, no build step. Node 18+.

## Commands

```text
leaf [open] [path] [options]
leaf list [--json]
leaf kill (--all | <pid>...) [--force]
leaf config [command]
leaf help [command]
```

`open` is the default command, so `leaf notes` and `leaf open notes` are the
same. The first positional token is a command only when it is not escaped by
`--`. A folder literally named `list` therefore opens with `leaf open list` or
`leaf -- list`; `leaf list` always lists servers.

The CLI follows these conventions:

- Commands are lowercase verbs: `open`, `list`, `kill`, `config`, `help`.
- Options use kebab-case long names: `--port`, `--no-open`, `--json`.
- Boolean options never take a value; use `--no-<option>` for a negation.
- Value options accept `--name value` or `--name=value`.
- `--` ends option parsing, and `-h` / `--help` prints help.

## Open a path

```bash
npm link                                # once, makes `leaf` global
leaf                                    # current folder
leaf .context                           # workspace view
leaf .context/issues                    # issues
leaf .context/map                       # map records
leaf .context/GLOSSARY.md               # the glossary
leaf .context/map/server/http.md        # that record
leaf .context/issues/demo/spec.md       # that spec
leaf .context/issues/demo/tasks/cache.md  # that task (route uses its number)
leaf ~/notes                            # Markdown library
leaf ~/notes/guides/install.md          # open that document
```

The target decides the mode:

| Target | Mode |
| --- | --- |
| the workspace root, or a folder under `.context/` | workspace |
| `GLOSSARY.md`, `map/**/*.md`, an issue spec or research report, or a task | workspace |
| any other Markdown file under `.context/` | workspace, Overview route |
| a folder or file under `.context/reference/` | library from its own folder |
| any other Markdown file | library from its own folder |
| another non-Markdown file | error |

A Markdown file opens from its own folder (`leaf notes/today.md` serves
`notes/`). Workspace documents open at their record route; a workspace folder
opens its section (`.context/issues` → issues, `.context/map` → the first
record, `.context/issues/<slug>` → spec), and the workspace root opens on its
Overview file tree. Reference checkouts are repositories, not workspace
content, so they open as ordinary Markdown libraries. With a file the browser
opens automatically. Options: `--no-open`, `--port <n>`, `--host <addr>`,
`--quiet`.

For development without the global link:

```bash
npm start                               # sample workspace, http://127.0.0.1:7777
npm run check                           # scan once, print diagnostics, exit 1 on errors
npm test                                # run the test suite
node src/serve.mjs --docs ~/notes --open
```

## Running servers

Each listening server writes a record under
`$XDG_STATE_HOME/leaf/servers/<pid>.json` (default
`~/.local/state/leaf/servers`), and removes it on exit. `LEAF_STATE_DIR`
overrides the directory. Records are advisory; the HTTP server never depends on
them.

```bash
leaf list                               # PID, PORT, MODE, URL, TARGET
leaf list --json                        # the full records
leaf kill 48213                         # stop by PID with SIGTERM
leaf kill 48213 48214                   # stop several servers
leaf kill --all                         # stop every visible server
leaf kill --force 48213                 # SIGKILL instead of SIGTERM
```

`list` prunes records whose PID is no longer alive. `kill` accepts only PIDs
shown by `list`; validate every PID before sending any signal, and refuse to
mix `--all` with PIDs.

## Settings

Workspace top-tab order, visibility, and the landing tab are global settings,
changed through `leaf config` (Markdown libraries keep their folder tabs):

```bash
leaf config                              # show settings and the file path
leaf config order issues map glossary
leaf config default issues
leaf config hide map
leaf config unhide map
leaf config reset
```

`order` sets the tab order, `default` picks the tab that opens when no document
is named, and `hide` removes a tab from the top bar (its routes still work).
**Overview** is always the first workspace tab; the configurable sections are
`glossary`, `map`, and `issues`. The old names `context`, `architecture`, and
`features` are accepted as aliases so an existing config file keeps working.
The file lives at `~/.config/leaf/config.json`; `XDG_CONFIG_HOME` moves it and
`LEAF_CONFIG` points at another file. A long-running server reads the file per
request, so a browser reload applies the change.

## Hash routes

The open document is in the URL fragment, so views can be bookmarked and shared
with yourself.

| Route | Document |
| --- | --- |
| `#/overview` | the first Markdown file in `.context/` |
| `#/overview/<path>` | any Markdown file under `.context/` |
| `#/glossary` | `.context/GLOSSARY.md` |
| `#/map` | the first map record |
| `#/map/<record>` | `.context/map/<record>.md`; folders become path segments, e.g. `#/map/server/http` |
| `#/issues` | the task graph of the first issue |
| `#/issues/<issue>` | issue spec |
| `#/issues/<issue>/research` | the issue's research report |
| `#/issues/<issue>/<n>` | task `<n>` of that issue |
| `#/docs/<path>` | a document in a Markdown library |

## Read-only API

The server exposes reads only. `POST`, `PATCH`, and `DELETE` return `405`.

```bash
curl -s 'localhost:7777/api/tree'
curl -s 'localhost:7777/api/doc?path=issues/demo/spec.md'
curl -s 'localhost:7777/api/raw?path=issues/demo/spec.md'
curl -s 'localhost:7777/api/asset?path=issues/demo/flow.svg'
curl -s 'localhost:7777/api/events'          # SSE
```

In workspace mode, `/api/tree` carries the glossary, the map records, the
issues with their tasks, the Overview `files` tree, and diagnostics. The `files`
tree contains only Markdown: `reference/` is excluded, and directories have
`name`, `path`, `title`, `count`, and `children`; files have `name`, `path`,
`title`, and `mtime`. A file's `title` is the filename, not the document H1.

```json
{
  "mode": "context",
  "glossary": { "exists": true, "path": "GLOSSARY.md", "headings": ["..."] },
  "map": { "path": "map", "records": [
    { "slug": "server/http", "path": "map/server/http.md", "type": "feat", "files": ["src/http.mjs"], "since": "0123456" }
  ] },
  "issues": [
    { "slug": "demo", "title": "Demo", "specPath": "issues/demo/spec.md", "researchPath": null,
      "progress": { "done": 1, "total": 2, "dropped": 0 },
      "tasks": [{ "n": 2, "title": "Cache the tree", "status": "pending", "blockedBy": ["01"] }] }
  ]
}
```

`/api/doc` and `/api/raw` read one Markdown document. `/api/asset` serves
allowlisted local assets (images, PDFs, media) beside a document, confined to
the root; in workspace mode it refuses every path below `reference/`. Both
routes reject traversal, symlink escapes, and oversized files.

## Live updates

`/api/events` fires when the watcher sees a file change. The page rescans,
updates the open document and rail, and redraws the task graph when it is open.
A task that just reached `done` is animated: the rail dot pulses, the graph node
shows a check, and a toast names the task. No reload, no polling.

## Markdown libraries

`/api/tree` returns `{ mode: "docs", sections: [...] }`. Each top-level folder
is a section; root Markdown files are collected into a section with key `home`
and title `Overview` (so a real `overview/` folder can coexist). Ordering is
deterministic: `README.md` / `index.md`, then other files, then folders, with
natural numeric sorting. Hidden folders and common generated folders are
skipped, and a file opens from the folder you named, not from a parent. Every
section is a plain document tree.

The rail roots the Overview at the library folder and every other section at
its own folder, so Questions starts at `questions/` instead of showing the
parent library.

Relative links between documents become page routes, and relative images and
media load through the asset route. LaTeX math is rendered locally with KaTeX.
`$...$` and `\(...\)` are inline; `$$...$$` and `\[...\]` are display, including
multiline blocks. Code spans and fenced blocks are left literal. The KaTeX
bundle and fonts load only for a document that contains a math delimiter.

## Diagnostics

`npm run check` (or `node src/serve.mjs --check --docs <dir>`) scans once,
prints a summary, and exits 1 when a diagnostic has severity `error`. The page
also shows diagnostics in the rail. A malformed document is a diagnostic, not a
render failure: it still shows what it can.

Workspace diagnostics cover a missing spec, missing spec sections, a task
heading that is not `# NN: Title`, a duplicate number, a missing or unknown
`Status:`, a missing acceptance-criteria section, dangling blockers, dependency
cycles, and record front matter that does not match the map format.

## The task graph

Opening the Issues tab, or `.context/issues`, shows the task graph instead of a
file. Clicking a node opens that task and syncs the rail; choosing an issue or
the graph icon switches back to reading. The graph and article are two views of
the same work area, so they are never shown together. Every view has an
in-page fullscreen button that fills the browser window; Esc exits.

The graph draws every task as a node and every `Blocked by:` entry as an arrow
from blocker to dependent. Layers run left to right by dependency depth.
Statuses come from the `Status:` line: `pending` with no open blockers reads
**Ready**, `pending` with open blockers reads **Waiting**, `in-progress` reads
**In progress**, `done` reads **Done**, and `dropped` is drawn struck through.
A cycle is reported as a diagnostic and the back edges are not drawn.

## Map records

The Map tab shows `map/` as a document tree, module folders included. A record
opens as a document with its front matter shown as record facts: type, `since`
commit, and the project files it covers. The files list is the link between a
record and the code it governs; the body keeps the record's Constraints,
Architecture, and any Violations.
