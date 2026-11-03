# desk API and usage

A live local view of a `.desk/` workspace, plus the write interface agents use
to change it. The same page can also render an arbitrary Markdown folder in
docs mode.

```text
src/
├── serve.mjs        HTTP server: reads + ticket writes + live events
├── desk.mjs         CLI for agents (add / update / done / rm / list / check / page)
├── server/          request handling, SSE, static assets, watcher
└── lib/             workspace scanner, ticket writer, docs scanner and reads
public/              shell, styles, client modules, vendored marked
test/                scanner and ticket-writer tests
tools/shot.mjs       headless screenshot helper
```

No dependencies, no build step. Node 18+.

## Run

```bash
npm start                               # or: node src/serve.mjs --root . --open
npm run check                           # or: node src/serve.mjs --check --root .
npm test                                # scanner + ticket-writer tests
node src/desk.mjs page --open           # serve from the CLI

# docs mode: a folder of Markdown, with top-level folders as sections
node src/serve.mjs --docs ~/notes --open
node src/desk.mjs docs ~/notes --open
node src/desk.mjs check --docs ~/notes
```

## Theme

The round button at the right edge of the top bar cycles through auto, light,
and dark. Auto follows the operating system's `prefers-color-scheme` and updates
live when it changes; the choice is remembered in local storage.

## Agent interface (CLI)

Every command prints one JSON object. Numbers may be given as `4` or `04`.

```bash
# add — appends the next number, fills Status/Blocked by, applies the template
node src/desk.mjs add plan-page --title "Retry failed uploads" --blocked-by 02,03

# add with a body from a file or stdin
node src/desk.mjs add plan-page --title "Cache the tree" --body ./notes.md
cat notes.md | node src/desk.mjs add plan-page --title "Cache the tree" --body -

# change — any combination of fields, body replaces everything from the first "##"
node src/desk.mjs update plan-page 06 --status in-progress
node src/desk.mjs update plan-page 06 --title "Cache the workspace tree"
node src/desk.mjs update plan-page 06 --blocked-by 04,05

# complete — sets Status: done and ticks every "- [ ]"
node src/desk.mjs done plan-page 06

# remove — refuses while other tickets are blocked by it, unless --force
node src/desk.mjs rm plan-page 06 --force

# inspect
node src/desk.mjs list plan-page
node src/desk.mjs check
```

Statuses: `pending`, `in-progress`, `done`, `blocked`. Aliases (`todo`, `wip`,
`complete`, …) are accepted. Unknown values fail with a JSON error and exit 1.

## Agent interface (HTTP)

Same operations, same JSON, for tools that prefer HTTP. The server rejects
cross-origin writes and requires `content-type: application/json`.

```bash
curl -s localhost:7777/api/tickets -H 'content-type: application/json' \
  -d '{"feature":"plan-page","title":"Retry failed uploads","blockedBy":["02","03"]}'

curl -s -X PATCH localhost:7777/api/tickets -H 'content-type: application/json' \
  -d '{"feature":"plan-page","n":6,"status":"in-progress"}'

curl -s -X PATCH localhost:7777/api/tickets -H 'content-type: application/json' \
  -d '{"feature":"plan-page","n":6,"action":"complete"}'

curl -s -X DELETE 'localhost:7777/api/tickets?feature=plan-page&n=6'
```

Reads stay the same: `GET /api/tree`, `GET /api/doc?path=…`, `GET /api/raw?path=…`,
`GET /api/events` (SSE).

## Docs mode

With `--docs <dir>`, `/api/tree` returns `{ mode: "docs", sections: [...] }`
instead of the `.desk` model. Each top-level folder is a section; root Markdown
files are collected into a section with key `home` and title `Overview` (so a
real `overview/` folder can coexist). Ordering is deterministic:
`README.md` / `index.md`, then other files, then folders, with natural numeric
sorting. `/api/doc` and `/api/raw` read Markdown from that root; `/api/tickets`
writes are available only for a detected top-level `features/` section.

Docs mode adds a confined asset route for local images and downloads:

```bash
curl -s 'localhost:7777/api/asset?path=guides/images/install.png'
```

It serves only allowlisted extensions under the docs root and rejects path
traversal, symlink escapes, and files over 8 MB.

## What the page does with a change

`/api/events` fires on every write, including writes made by the CLI. The page
rescans, updates the open document and rail, and redraws the ticket graph when
it is open. A ticket that just reached `done` is animated: the rail dot pulses,
the graph node shows a check, and a toast names the ticket. No reload, no
polling.

## The graph

The graph opens from the network icon in the rail and replaces the article;
choosing a document switches back to reading. The graph and article are two
views of the same work area, so they are never shown together. Every view has an
in-page fullscreen button that fills the browser window; Esc exits.

The graph draws every ticket as a node and every `Blocked by:` entry as an arrow
from blocker to dependent. Layers run left to right by dependency depth;
"ready" means no open blockers. Clicking a node opens that ticket and syncs the
rail to it. Ticket pages offer `Start`, `Mark done`, and `Reopen`.
