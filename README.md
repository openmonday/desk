# desk

A live local view of a `.desk` engineering workspace, plus the small CLI and
HTTP API agents use to change it. No dependencies, no build step: Node 18+ and
plain HTML, CSS, and JavaScript.

```bash
npm start        # serve the sample workspace at http://127.0.0.1:7777
npm run check    # scan once, print diagnostics, exit 1 on errors
npm test         # run the scanner and ticket-writer tests
```

The page renders `CONTEXT.md`, `arch/*.md`, and each feature spec and its
tickets. Changes made by an agent through the CLI or HTTP API appear live over
server-sent events. The shared ticket dependency graph is the centre of the
feature view.

## Layout

```text
.
├── .desk/                  sample workspace: glossary, architecture, features
├── src/                    server and library code
│   ├── serve.mjs           HTTP entry: options, workspace, lifecycle
│   ├── desk.mjs            agent CLI
│   ├── server/             request handler, SSE, static assets, watcher
│   └── lib/                scanner and ticket writer, split by responsibility
├── public/                 shell, styles, client modules, vendored marked
├── tools/shot.mjs          headless screenshot helper
├── docs/                   API reference, design brief, reference images
└── test/                   node:test fixtures and tests
```

See [`docs/API.md`](docs/API.md) for commands, the CLI, the HTTP API, and
hash routes.
