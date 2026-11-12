# leaf

A live, read-only view of a `.context` engineering workspace or any folder of
Markdown. You write Markdown; the page follows. No dependencies, no build step:
Node 18+ and plain HTML, CSS, and JavaScript. Markdown is rendered with vendored
marked, highlighted with a vendored highlight.js build, and LaTeX math is
rendered with vendored KaTeX that loads only when a document contains math.
Everything stays local.

```bash
npm start        # serve the sample workspace at http://127.0.0.1:7777
npm run check    # scan once, print diagnostics, exit 1 on errors
npm test         # run the test suite
./scripts/setup-cli.sh  # link, verify, and install the `leaf` command
```

## Open something

```bash
leaf                                    # current folder
leaf ~/notes                            # a Markdown library
leaf .context                           # a workspace
leaf .context/issues                    # issues
leaf .context/issues/demo               # that issue's spec
leaf .context/issues/demo/tasks/cache-the-tree.md   # that task
leaf .context/map                       # map records
leaf .context/map/server/http.md        # that record
leaf .context/GLOSSARY.md               # the glossary
leaf .context/AGENTS.md                 # any other Markdown document
leaf open list                           # a folder literally named "list"
leaf -- list                             # same, using the option terminator
```

The first word is a command. `open` is the default, so a bare path does not
need it. A command name always wins over a folder with the same name; use
`leaf open <path>` or put `--` before the path to open the folder itself.

On startup, leaf lists every Markdown file it detected in the target and marks
the document it opened. The list uses the same `●` / `○` treatment as the
skills manager: filled means opened, hollow means available.

`leaf` decides the mode from the path. The workspace root (the folder that
contains `.context/`), folders under `.context/`, and its documents open in the
workspace view. Any other Markdown file opens as a Markdown library from its
own folder. A task opens at its number route, which the page resolves from the
`# NN: Title` heading rather than the file name. `reference/` holds checkouts of
other projects, so it is never scanned, listed, served, or counted: a path
inside it opens as an ordinary Markdown library. With a file the browser opens
automatically; pass `--no-open` to keep it closed. `--port`, `--host`, and
`--quiet` work as expected.

By default, workspaces open on **Overview**, a Markdown file tree rooted at
`.context/`: `GLOSSARY.md`, `AGENTS.md`, `issues/`, `map/`, and anything else
Markdown. The **Glossary**, **Map**, and **Issues** tabs keep their focused
views. **Glossary** shows `GLOSSARY.md`. **Map** shows `map/` as a tree with
module folders; a record opens with its front matter as record facts: the type,
the `since` commit, and the project files it covers. **Issues** lists each issue
with its progress, then its spec, research report, and tasks.

Opening the **Issues** section, or `.context/issues`, shows the task graph;
clicking a node opens the task, and the spec is a click away. Edits made by you
or an agent appear live over server-sent events. Every view can fill the browser
window with in-page fullscreen. The round button at the top right cycles auto,
light, and dark; auto follows the operating system.

## Task graph

`Blocked by: 01, 02` draws an arrow from each blocker to its dependent. Columns
run left to right by dependency depth. The node state comes from the `Status:`
line: `pending` with no open blockers is **Ready**, `pending` with open blockers
is **Waiting**, `in-progress` is **In progress**, `done` is **Done**, and
`dropped` is struck through. A cycle is a diagnostic and its back edges are not
drawn. The phone layout lists the same tasks, indented by column.

Diagnostics catch a missing spec, missing spec sections, a task heading that is
not `# NN: Title`, a duplicate task number, a missing or unknown status, a
missing acceptance-criteria section, a dangling blocker, a dependency cycle, and
record front matter that does not match the map format. A diagnostic never
blanks the page.

## Map records

A record lives anywhere under `map/`, for example `map/payments/retry.md`, and
starts with the limited front matter the `draw-map` skill writes:

```markdown
---
type: feat
files:
  - src/payments/
since: abc123f
---
```

The page shows the type, the `since` commit, and the covered files above the
record body; the filename is the rail label, never the record title. The body
renders like any other document, so Constraints, Architecture, and Violations
stay readable and linkable.

## Running servers

Every server records itself after it starts listening, then removes the record
when it exits. `leaf list` reads those records, removes stale entries, and
prints the PID, port, mode, URL, and target. `leaf kill` stops the servers you
name by PID:

```bash
leaf list                                # human-readable table
leaf list --json                         # machine-readable records
leaf kill 48213                          # stop one server with SIGTERM
leaf kill 48213 48214                    # stop several servers
leaf kill --all                          # stop every running leaf server
leaf kill --force 48213                  # SIGKILL instead of SIGTERM
```

Records live under `$XDG_STATE_HOME/leaf/servers` (by default
`~/.local/state/leaf/servers`). `LEAF_STATE_DIR` overrides the state directory.
Only servers started by the current user are visible.

## Settings

Settings for the `.context` workspace's top tabs are global (stored once per
user, not per project) and changed with `leaf config`:

```bash
leaf config                              # show settings and the file path
leaf config order issues map glossary
leaf config default issues
leaf config hide map
leaf config unhide map
leaf config reset
```

`order` sets the top-tab order, `default` picks the tab that opens when you name
no document, and `hide` removes a tab from the top bar (the path still works).
**Overview** is always the first workspace tab and is not configurable; the
sections are `glossary`, `map`, and `issues`. The old names `context`,
`architecture`, and `features` are accepted as aliases. Reload an open page to
apply a change. Set `LEAF_CONFIG` to use another file, or `XDG_CONFIG_HOME` to
move the default `~/.config/leaf/config.json`.

## Markdown libraries

Any folder of Markdown opens the same way:

```bash
leaf ~/notes
leaf ~/notes/guides/install.md
```

Every top-level folder becomes a tab and section; root-level Markdown files go
in an **Overview** tab. **Overview** shows the whole library tree rooted at the
folder you opened: root files first, then every top-level folder and its
contents. Any other tab treats its folder as the tree root, the way an IDE
opens a subfolder: **Questions** starts at `questions/`, and **Architecture**
starts at `architecture/`. The parent folder is not shown.
Tabs still jump to a section and its first document. Folders render as nested
nodes, and `README.md` / `index.md` sort before other files (numbers sort
naturally).
Labels are display-only and uppercased in CSS; folder names never change on
disk. Folders show their real names, so `architecture/` does not become
Architecture. Hairline connectors join each folder to its contents, and the
line leading to the open document, like the folder icons along that branch, is
clay. Tree labels stay on one line and ellipsize when long; navigating to a
nested document opens its folder branch automatically. Folder rows use mono
type with a trailing `/` and a document count; a collapsed folder ends in `/ …`.
Files show their real filenames, never the Markdown H1; the open document gets
a clay label wash, and every filename underlines on hover. The rail heading
shows the current section name. Fenced code blocks are
highlighted locally by language (language-less blocks fall back to detection
when confident). Relative Markdown links become in-page links, and local
images, PDFs, and media load through a path-confined asset route. The URL
keeps the open document, e.g. `#/docs/guides/install.md`, so it can be
bookmarked.

LaTeX math works in every Markdown view. Use `$...$` or `\(...\)` for inline
math and `$$...$$` or `\[...\]` on their own lines for display math.
Formulas inside code spans and fenced blocks stay literal, and KaTeX loads
lazily on the first document that needs it.

Both modes still bind to `127.0.0.1` and have no authentication. Do not expose
them with `--host 0.0.0.0` on an untrusted network.

## Layout

```text
.
├── .context/               sample workspace: glossary, map records, one issue
├── src/                    server and library code
│   ├── serve.mjs           HTTP entry: options, workspace, lifecycle
│   ├── leaf.mjs            viewer CLI and server commands
│   ├── cli/                argument grammar, target detection and hash routes
│   ├── server/             request handler, SSE, static assets, watcher
│   └── lib/                scanners, task and record parsing, settings, reads
├── public/                 shell, styles, client modules, vendored libraries
├── scripts/setup-cli.sh    link and verify the global `leaf` command
├── tools/shot.mjs          headless screenshot helper
├── docs/                   API reference, design brief, reference images
└── test/                   node:test fixtures and tests
```

Third-party notices: marked is MIT-licensed; highlight.js is BSD-3-Clause
(see `public/highlight.LICENSE.txt`); KaTeX is MIT-licensed (see
`public/katex.LICENSE.txt`).

See [`docs/API.md`](docs/API.md) for the command, modes, read-only HTTP API,
and hash routes.
