# desk

A live, read-only view of a `.desk` engineering workspace or any folder of
Markdown. You write Markdown; the page follows. No dependencies, no build step:
Node 18+ and plain HTML, CSS, and JavaScript. Markdown is rendered with vendored
marked and highlighted with a vendored highlight.js build; everything stays
local.

```bash
npm start        # serve the sample workspace at http://127.0.0.1:7777
npm run check    # scan once, print diagnostics, exit 1 on errors
npm test         # run the test suite
npm link         # install the `desk` command globally from this checkout
```

## Open something

```bash
desk                                    # current folder
desk ~/notes                            # a Markdown library
desk .desk                              # a workspace
desk .desk/features/demo/spec.md        # that document in the browser
```

`desk` decides the mode from the path. The workspace root (the folder that
contains `.desk/`) and anything under `.desk/` open in the workspace view;
everything else opens as a Markdown library. A Markdown file outside `.desk/`
opens from its own folder, so `desk notes/today.md` shows the `notes/` tree at
that document. With a file the browser opens automatically; pass `--no-open` to
keep it closed. `--port`,
`--host`, and `--quiet` work as expected.

The page renders `CONTEXT.md`, `arch/*.md`, and each feature spec and its
tickets. Edits made by you or an agent appear live over server-sent events. The
shared ticket dependency graph opens from the rail and replaces the article;
close it to return to reading. Every view can fill the browser window with
in-page fullscreen. The round button at the top right cycles auto, light, and
dark; auto follows the operating system.

## Markdown libraries

Any folder of Markdown opens the same way:

```bash
desk ~/notes
desk ~/notes/guides/install.md
```

Every top-level folder becomes a tab and section; root-level Markdown files go
in an **Overview** tab. Folders render as a recursive tree, and
`README.md` / `index.md` sort before other files (numbers sort naturally).
Labels are display-only and uppercased in CSS; folder names never change on
disk (the `.desk` convention `arch` displays as Architecture). Tree labels stay
on one line and ellipsize when long; navigating to a nested document opens its
folder branch automatically. The active document and its parent folders use
rounded rows (the document is clay-tinted); files carry a `└` branch mark and
folders use an SVG chevron. Fenced code blocks are highlighted locally by
language (language-less blocks fall back to detection when confident). Relative
Markdown links become in-page links, and local images, PDFs, and media load
through a path-confined asset route. The URL
keeps the open document, e.g. `#/docs/guides/install.md`, so it can be
bookmarked.

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
│   ├── desk.mjs            viewer CLI
│   ├── cli/                target detection and hash routes
│   ├── server/             request handler, SSE, static assets, watcher
│   └── lib/                workspace scanner, docs scanner and reads
├── public/                 shell, styles, client modules, vendored libraries
├── tools/shot.mjs          headless screenshot helper
├── docs/                   API reference, design brief, reference images
└── test/                   node:test fixtures and tests
```

Third-party notices: marked is MIT-licensed; highlight.js is BSD-3-Clause
(see `public/highlight.LICENSE.txt`).

See [`docs/API.md`](docs/API.md) for the command, modes, read-only HTTP API,
and hash routes.
