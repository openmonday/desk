# desk

A live local view of a `.desk` engineering workspace, plus the small CLI and
HTTP API agents use to change it. It can also serve any folder of Markdown as a
read-only docs library. No dependencies, no build step: Node 18+ and plain HTML,
CSS, and JavaScript.

```bash
npm start        # serve the sample workspace at http://127.0.0.1:7777
npm run check    # scan once, print diagnostics, exit 1 on errors
npm test         # run the scanner and ticket-writer tests
```

The page renders `CONTEXT.md`, `arch/*.md`, and each feature spec and its
tickets. Changes made by an agent through the CLI or HTTP API appear live over
server-sent events. The shared ticket dependency graph opens from the rail and
replaces the article; close it to return to reading. Every view can fill the
browser window with in-page fullscreen. The round button at the top right cycles
auto, light, and dark; auto follows the operating system.

## Docs mode

Point the same page at any folder of Markdown files:

```bash
node src/serve.mjs --docs ~/notes --open
node src/desk.mjs docs ~/notes --open       # same thing through the CLI
node src/desk.mjs check --docs ~/notes      # diagnostics for the docs tree
```

Every top-level folder becomes a tab and section; root-level Markdown files go
in an **Overview** tab. Folders render as a recursive tree, and
`README.md` / `index.md` sort before other files (numbers sort naturally).
Labels are display-only and uppercased in CSS; folder names never change on
disk (the `.desk` convention `arch` displays as Architecture). Tree labels stay
on one line and ellipsize when long; navigating to a nested document opens its
folder branch automatically. The active document and its parent folders use
rounded rows (the document is clay-tinted), and folders use chevrons. Relative
Markdown links become in-page links, and local images, PDFs, and media load
through a path-confined asset route. The URL
keeps the open document, e.g. `#/docs/guides/install.md`, so it can be
bookmarked.

If a top-level `features/` folder contains feature folders (`spec.md` and/or
`tickets/`), that section keeps the feature view: spec, numbered tickets,
dependency graph, and ticket actions. Every other section stays a plain,
read-only document tree. With `--docs`, `.desk` ticket writes are only available
for that detected Features section.

Docs mode still binds to `127.0.0.1` and has no authentication. Do not expose it
with `--host 0.0.0.0` on an untrusted network.

## Layout

```text
.
├── .desk/                  sample workspace: glossary, architecture, features
├── src/                    server and library code
│   ├── serve.mjs           HTTP entry: options, workspace, lifecycle
│   ├── desk.mjs            agent CLI
│   ├── server/             request handler, SSE, static assets, watcher
│   └── lib/                workspace scanner, ticket writer, docs scanner/reads
├── public/                 shell, styles, client modules, vendored marked
├── tools/shot.mjs          headless screenshot helper
├── docs/                   API reference, design brief, reference images
└── test/                   node:test fixtures and tests
```

See [`docs/API.md`](docs/API.md) for commands, the CLI, the HTTP API, and
hash routes.
