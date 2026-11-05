# desk

A live, read-only view of a `.desk` engineering workspace or any folder of
Markdown. You write Markdown; the page follows. No dependencies, no build step:
Node 18+ and plain HTML, CSS, and JavaScript. Markdown is rendered with vendored
marked, highlighted with a vendored highlight.js build, and LaTeX math is
rendered with vendored KaTeX that loads only when a document contains math;
everything stays local.

```bash
npm start        # serve the sample workspace at http://127.0.0.1:7777
npm run check    # scan once, print diagnostics, exit 1 on errors
npm test         # run the test suite
./scripts/setup-cli.sh  # link, verify, and install the `desk` command
```

## Open something

```bash
desk                                    # current folder
desk ~/notes                            # a Markdown library
desk .desk                              # a workspace
desk .desk/features                     # the ticket graph
desk .desk/AGENTS.md                    # any other Markdown document
desk .desk/features/demo/spec.md        # that document in the browser
desk open list                           # a folder literally named "list"
desk -- list                             # same, using the option terminator
```

The first word is a command. `open` is the default, so a bare path does not
need it. A command name always wins over a folder with the same name; use
`desk open <path>` or put `--` before the path to open the folder itself.

On startup, desk lists every Markdown file it detected in the target and marks
the document it opened. The list uses the same `●` / `○` treatment as the
skills manager: filled means opened, hollow means available.

`desk` decides the mode from the path. The workspace root (the folder that
contains `.desk/`), folders under `.desk/`, and recognized records
(`CONTEXT.md`, `arch/*.md`, specs, tickets) open in the workspace view.
Everything else opens as a Markdown library, and a file opens from its own
folder, so `desk notes/today.md` shows the `notes/` tree at that document. That
also means a plain file like `.desk/AGENTS.md` opens as a document instead of
being refused. With a file the browser opens automatically; pass `--no-open` to
keep it closed. `--port`, `--host`, and `--quiet` work as expected.

By default, workspaces open on **Overview**, a Markdown file tree rooted at `.desk/`:
`arch/`, `features/`, `CONTEXT.md`, `AGENTS.md`, and anything else Markdown.
The **Context**, **Architecture**, and **Features** tabs keep their focused
views. **Architecture** shows the `arch/` folder as its tree root rather than
the library root; **Features** does the same for `features/` while keeping the
feature progress, spec, and numbered ticket rows under each feature folder.
The page renders `CONTEXT.md`, `arch/*.md`, and each feature spec and
its tickets. Opening the **Features** section, or `.desk/features`, lands on
the ticket graph; clicking a node opens the ticket, and the spec is a click
away. Edits made by you or an agent appear live over server-sent events.
Every view can fill the browser window with in-page fullscreen. The round button at the
top right cycles auto, light, and dark; auto follows the operating system.

## Running servers

Every server records itself after it starts listening, then removes the record
when it exits. `desk list` reads those records, removes stale entries, and
prints the PID, port, mode, URL, and target. `desk kill` stops the servers you
name by PID:

```bash
desk list                                # human-readable table
desk list --json                         # machine-readable records
desk kill 48213                          # stop one server with SIGTERM
desk kill 48213 48214                    # stop several servers
desk kill --all                          # stop every running desk server
desk kill --force 48213                  # SIGKILL instead of SIGTERM
```

Records live under `$XDG_STATE_HOME/desk/servers` (by default
`~/.local/state/desk/servers`). `DESK_STATE_DIR` overrides the state directory.
Only servers started by the current user are visible.

## Settings

Settings for the `.desk` workspace's top tabs are global (stored once per user,
not per project) and changed with `desk config`:

```bash
desk config                              # show settings and the file path
desk config order features context architecture
desk config default features
desk config hide architecture
desk config unhide architecture
desk config reset
```

`order` sets the top-tab order, `default` picks the tab that opens when you name
no document, and `hide` removes a tab from the top bar (the path still works).
**Overview** is always the first workspace tab and is not configurable; the
sections are `context`, `architecture`, and `features`. Reload an open page
to apply a change. Set `DESK_CONFIG` to use another file, or `XDG_CONFIG_HOME`
to move the default `~/.config/desk/config.json`.

## Markdown libraries

Any folder of Markdown opens the same way:

```bash
desk ~/notes
desk ~/notes/guides/install.md
```

Every top-level folder becomes a tab and section; root-level Markdown files go
in an **Overview** tab. **Overview** shows the whole library tree rooted at the
folder you opened: root files first, then every top-level folder and its
contents. Any other tab treats its folder as the tree root, the way an IDE
opens a subfolder: **Questions** starts at `questions/`, and **Architecture**
starts at `arch/`. The parent folder is not shown.
Tabs still jump to a section and its first document. Folders render as nested
nodes, and `README.md` / `index.md` sort before other files (numbers sort
naturally).
Labels are display-only and uppercased in CSS; folder names never change on
disk. Folders show their real names, so `arch` stays `arch/` instead of becoming
Architecture. Hairline connectors join each folder to its contents, and the
line leading to the open document, like the folder icons along that branch, is
clay. Tree labels stay on one line and ellipsize when long; navigating to a
nested document opens its folder branch automatically. Folder rows use mono
type with a trailing `/` and a document count; a collapsed folder ends in `/ …`.
Files are plain titles; the open document gets a clay label wash, and every
file title underlines on hover. The rail heading shows the current section
name. Fenced code blocks are
highlighted locally by language (language-less blocks fall back to detection
when confident). Relative Markdown links become in-page links, and local
images, PDFs, and media load through a path-confined asset route. The URL
keeps the open document, e.g. `#/docs/guides/install.md`, so it can be
bookmarked.

LaTeX math works in every Markdown view. Use `$...$` or `\(...\)` for inline
math and `$$...$$` or `\[...\]` on their own lines for display math.
Formulas inside code spans and fenced blocks stay literal, and KaTeX loads
lazily on the first document that needs it.

If a top-level `features/` folder contains feature folders (`spec.md` and/or
`tickets/`), that section keeps the feature view: spec, numbered tickets, and
the dependency graph. Every other section stays a plain, read-only document
tree.

Both modes still bind to `127.0.0.1` and have no authentication. Do not expose
them with `--host 0.0.0.0` on an untrusted network.

## Layout

```text
.
├── .desk/                  sample workspace: glossary, architecture, features
├── src/                    server and library code
│   ├── serve.mjs           HTTP entry: options, workspace, lifecycle
│   ├── desk.mjs            viewer CLI and server commands
│   ├── cli/                argument grammar, target detection and hash routes
│   ├── server/             request handler, SSE, static assets, watcher
│   └── lib/                scanners, settings, reads, running-server registry
├── public/                 shell, styles, client modules, vendored libraries
├── scripts/setup-cli.sh    link and verify the global `desk` command
├── tools/shot.mjs          headless screenshot helper
├── docs/                   API reference, design brief, reference images
└── test/                   node:test fixtures and tests
```

Third-party notices: marked is MIT-licensed; highlight.js is BSD-3-Clause
(see `public/highlight.LICENSE.txt`); KaTeX is MIT-licensed (see
`public/katex.LICENSE.txt`).

See [`docs/API.md`](docs/API.md) for the command, modes, read-only HTTP API,
and hash routes.
