# desk API and usage

A live local view of a `.desk/` workspace, plus the write interface agents use
to change it.

```text
src/
├── serve.mjs        HTTP server: reads + ticket writes + live events
├── desk.mjs         CLI for agents (add / update / done / rm / list / check / page)
├── server/          request handling, SSE, static assets, watcher
└── lib/             workspace scanner and ticket writer
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
```

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

## What the page does with a change

`/api/events` fires on every write, including writes made by the CLI. The page
rescans, redraws the ticket graph, and animates a ticket that just reached
`done`: the rail dot pulses, the graph node shows a check, and a toast names the
ticket. No reload, no polling.

## The graph

The spec view draws every ticket as a node and every `Blocked by:` entry as an
arrow from blocker to dependent. Layers run top to bottom by dependency depth;
"ready" means no open blockers. Clicking a node opens that ticket and syncs the
rail to it. Ticket pages offer `Graph`, `Start`, `Mark done`, and `Reopen`.
