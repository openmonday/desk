# Design brief — beautify the leaf page

> Historical brief. The app now lives in `src/` (server and library) and
> `public/` (shell, styles, client modules). The layout has been split since
> this brief was written, and the workspace moved to `.context/` (glossary, map
> records, issues, tasks). The visual and behaviour contracts below still
> apply; read "ticket" as "task", "feature" as "issue", and "architecture
> record" as "map record".

You are taking over a small, self-contained tool and making it beautiful, clear,
and unmistakably Claude. This is a visual and interaction redesign, not a
rewrite. You have wide creative latitude on the look; the behaviour and data
contracts below are fixed.

## What this is

`leaf` is a local web page for an engineering workspace. A project keeps a
legacy workspace directory containing a glossary (`CONTEXT.md`), architecture records
(`architecture/*.md`), and feature specs with tickets (`features/<slug>/{spec.md,tickets/NN-*.md}`).
The page renders that workspace live, and it is also the control surface an AI
agent drives: tickets are added, edited, started, and completed by writing those
files through a small CLI/HTTP API, and the page updates in place over SSE.

Two audiences, one page: a human reading the work, and an agent changing it
while the human watches.

## Run it

```bash
cd /path/to/leaf
node src/serve.mjs --root . --open        # http://127.0.0.1:7777 (falls forward)
node src/serve.mjs --check --root .       # scan + diagnostics, exit 1 on errors
```

If a server is already running, use it or start another port; reloading the
browser is enough for CSS/JS changes, while `serve.mjs` changes need a restart.

## Where things are

```text
/path/to/leaf/
├── legacy-workspace/                      sample workspace (5 tickets, 4 architecture records) — test data
├── src/                        server and library code; edit here
│   ├── serve.mjs               HTTP server: reads, ticket writes, SSE
│   ├── leaf.mjs                agent CLI (add / update / done / rm / list / check / page)
│   ├── server/                 request handler, SSE, static assets, watcher
│   ├── lib/scan.mjs            workspace → page model
│   └── lib/ticket.mjs          ticket file writer
├── public/
│   ├── shell.html              the shell
│   ├── theme.css               stylesheet entry point
│   ├── styles/                 visual system, split by responsibility
│   ├── app.js                  client entry (ES modules under js/)
│   ├── js/                     state, views, graph, article, live updates
│   └── marked.min.js           vendored markdown parser
├── tools/shot.mjs              screenshot helper (see Verification)
├── docs/reference/before-*.png current screenshots, for comparison
├── docs/API.md                 behaviour + API reference
└── test/                       scanner and ticket-writer tests
```

Read `docs/API.md` before changing anything. Do **not** edit
`/Users/openmonday/projects/agent/cli/skm/skills/dev/plan-page/` — that is the
upstream template, not this copy.

## What already works (keep it working)

- Tabs: Context, Architecture, Features. Rail on the left, article on the right,
  each scrolling independently; single column below 900px.
- Hash routes: `#/context`, `#/architecture`, `#/architecture/graph`,
  `#/architecture/<slug>`, `#/features/<slug>`, `#/features/<slug>/<n>`.
- Markdown rendering of the workspace; ticket `Status:` / `Blocked by:` lines are
  lifted into a meta strip; diagnostics render in the rail.
- Live SSE updates: any file change (yours, an agent's, the CLI's) rescans,
  redraws, and preserves scroll.
- Ticket actions in the page: `Start`, `Mark done`, `Reopen`; completion triggers
  a rail-dot pulse, a node check + ring, and a toast.
- Spec view draws a ticket dependency graph; clicking a node opens the ticket and
  syncs the rail (active row + scroll into view).
- `leaf.mjs` behaves as documented. The viewer is read-only; ticket status
  changes are ordinary Markdown edits and appear over SSE.

## The brief

### 1. Make the ticket graph horizontal

Today it is a vertical layered DAG (`layOut()`, `graphBlock()`, `chartNode()` in
`app.js`; `.chart-*`, `.node*` in `theme.css`). It reads as a long chain and
leaves the wide article column empty.

Redesign it so dependencies flow **left → right**: blockers on the left,
dependents on the right, parallel branches stacked vertically within a layer.
This should become the visual centrepiece of the spec view.

Make it survive real data:

- 1–20 tickets, parallel branches, merge points, skip-level blockers
  (ticket 05 blocked by 01 directly, when 02–04 sit between).
- Long titles: wrap to two lines, never clip; nodes keep a predictable height.
- Status at a glance without reading: done / in progress / blocked / pending-ready.
  Do not rely on colour alone.
- Arrowheads and edge routing must stay legible when edges cross layers. Consider
  orthogonal routing with rounded corners, or curves that visibly avoid nodes.
- Cycles already produce diagnostics; never hang or overlap into a pile.
- Mobile (390px): no page-wide horizontal scroll. Either let the graph pan inside
  its own area with a clear affordance, or switch to a compact representation
  (e.g. an ordered list with dependency indentation) that still reads as a graph.
- Click a node → open that ticket; the rail row must highlight and scroll into
  view. Keep hover/focus states and keyboard access (nodes are `<button>`s).
- Consider small affordances that fit the calm editorial tone: a dependency count,
  "ready" markers, a progress line, dimming satisfied edges. No icon soup.

### 2. Replace the ticket meta strip — it is the weakest part of the page

Right now a ticket header reads:

```
[DONE] [BLOCKED BY 02] [FEATURE PLAN-PAGE-TEMPLATE]          [Graph] [Reopen]
```

Three equal-weight uppercase mono pills, a cryptic `DONE` that repeats the
heading's meaning, `BLOCKED BY 02` with no idea what ticket 02 is, a `FEATURE …`
slug that means nothing to a human, and two buttons that look like navigation
but perform different kinds of action. It is unclear and noisy.

Replace it with a clear ticket header:

- Status as one unmistakable state (label + shape/icon), not a pill soup.
- Dependency information in plain language: `Blocked by 02 · Build the frozen
  visual shell` when waiting; `Unblocked — ready to start` when all blockers are
  done; `Blocked` (explicit status) distinguished from "waiting on 02".
  Link the blocker number to that ticket.
- Feature context as quiet secondary information, not a slug chip.
- Actions grouped and obviously actionable. The primary action is the next step
  (`Start`, then `Mark done`; `Reopen` when done). `Graph` is navigation back to
  the spec graph, so style it as such.
- The same clarity applies to the spec header (`feature <slug>` today).
- Keep the raw `Status:` value available (tooltip or small print) so agents and
  humans agree on what the file says.

### 3. Use Claude's classic palette and voice

The page is currently paper/ink with a clay accent that barely appears; statuses
and the graph read green/gray, and it does not feel like Claude.

- Anchor on Anthropic/Claude's warm editorial palette: paper `#FAF9F5`, deeper
  oat/ivory `#F0EEE6`, ink `#141413`, muted `#B0AEA5`, hairline `#E8E6DC`,
  clay `#D97757`. The existing blue `#6A9BCC` and green `#788C5D` may stay as
  status hues, but clay should carry the identity and warm neutrals should do
  most of the work.
- Warmth, hairlines, generous whitespace, strong typographic hierarchy, small
  caps mono labels, restrained ornament. No card shadows, no gradient slop, no
  glassmorphism, no emoji.
- Statuses must remain distinguishable and accessible: colour + shape + label,
  with adequate contrast. Avoid a page that is 90% green when everything is done.
- Optional and tasteful: the Claude starburst as a small inline SVG mark (no
  image files, no CDN). Only if it earns its place.
- Fonts: locally installed `"Anthropic Sans Display"` for titles,
  `"Anthropic Sans Text"` for prose, `"Anthropic Mono Web"` for labels. No
  `@font-face`, no webfont requests, no serif. Body prose is currently 16.5px;
  keep it readable and slightly smaller than the old 18.5px serif.

### 4. General clarity pass (be critical)

Act as a designer reviewing the whole page. Likely candidates:

- Rail: titles truncate mid-word at 344px; hierarchy between feature, spec, and
  tickets is thin; active state is subtle. Make the rail scannable.
- Reading-progress meter and "6 MIN READ": decide whether they earn their space
  on a spec page; if not, remove them or make them meaningful.
- Legend: currently tiny and detached; integrate status meaning into the graph.
- Diagnostics and empty states: make them helpful, not decorative.
- Toast: verify it does not sit on top of prose or the graph.
- Spacing rhythm, optical alignment, hover/focus, reduced motion, dark display
  environments (not required, but do not break).
- Copy: button labels, empty-state sentences, and status words should be plain
  English, consistent, and short.

If you have a better idea than anything above, do it and explain the tradeoff.

## Constraints (hard)

- No new dependencies, no build step, no bundler, no network at runtime. Vanilla
  HTML/CSS/JS only; Node 18+ on the server.
- Keep the API: `GET /api/tree`, `/api/doc?path=`, `/api/raw?path=`, `/api/events`;
  `POST/PATCH/DELETE /api/tickets` with JSON; writes stay same-origin/loopback
  guarded. Do not add endpoints without a reason.
- Markdown remains the only content source. Do not introduce a database, generated
  data files, or stored UI state beyond the URL hash.
- CSP: no inline `<script>`; `style-src` allows inline styles. No external fonts,
  images, or analytics.
- Do not touch legacy workspace content except temporary tickets you create for testing
  (delete them afterwards). The five sample tickets describe the original
  read-only template and are intentionally stale in places.
- Do not reintroduce the removed Share and Tree rail blocks.
- Respect `prefers-reduced-motion`, keyboard focus, and visible focus rings.
- Keep shell.html / theme.css / app.js responsibilities separated. Prefer CSS
  custom properties over one-off values.

## Verification (do all of it)

Run the server and exercise the real flows:

```bash
node src/serve.mjs --check --root .          # expect: no diagnostics

# horizontal graph with branches and a merge, then clean up
node src/leaf.mjs add plan-page-template --title "Branch A" --blocked-by 02
node src/leaf.mjs add plan-page-template --title "Branch B" --blocked-by 02
node src/leaf.mjs add plan-page-template --title "Merge point" --blocked-by 06,07
node src/leaf.mjs done plan-page-template 8
node src/leaf.mjs rm plan-page-template 8
node src/leaf.mjs rm plan-page-template 7
node src/leaf.mjs rm plan-page-template 6

# live change while the page is open (completion animation)
node src/leaf.mjs update plan-page-template 5 --status in-progress
node src/leaf.mjs done plan-page-template 5
```

Screenshots: **do not use Chrome's `--screenshot` flag** — the page holds an SSE
connection open and the command never settles. Use the bundled tool, which drives
headless Chromium over CDP:

```bash
node tools/shot.mjs http://127.0.0.1:7777/ /tmp/spec-1440.png 1440 1000
node tools/shot.mjs "http://127.0.0.1:7777/#/features/plan-page-template/3" /tmp/ticket-1440.png 1440 1000
node tools/shot.mjs http://127.0.0.1:7777/ /tmp/spec-390.png 390 844
```

Also verify, by hand or via DevTools protocol:

- Click each graph node: URL hash, article, rail highlight, and rail scroll agree.
- `Start` → `Mark done` → `Reopen` each update the file and the page.
- Completion animation fires (rail dot, node check/ring, toast) and settles.
- No console errors, no 404s, no page-level horizontal scroll at 390px.
- `node src/serve.mjs --check --root .` still reports no diagnostics.

## Definition of done

- A fresh reader can answer, within three seconds: what feature is this, what is
  the state of each ticket, what blocks what, what should happen next.
- The spec view looks like a designed Claude artifact, not a dashboard.
- The graph is horizontal, readable at 5 and at 20 tickets, and still works on a
  phone.
- The page communicates live agent activity without shouting.
- You can explain every visual decision, and nothing in the old constraints broke.

Report back with: what you changed, the visual rationale, before/after screenshots,
the commands you ran, and anything you deliberately left alone.
