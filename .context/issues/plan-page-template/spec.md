## Problem Statement

A project's engineering workspace lives as markdown files under `.context/` — a glossary, map records, issue specs, and tasks. Reading it means opening files one at a time, losing the relationship between a spec and its tasks, and having no quick way to see status, blockers, or reading progress. Teammates who receive a path cannot open a shareable view without a checkout and an editor.

## Solution

A read-only local page that renders the whole workspace as one navigable document. Three tabs swap the rail and article between glossary, map, and issues. Issues expand to their spec and numbered tasks. A fixed rail carries the open document's title, its section tree, reading progress, share actions, and diagnostics. A local server supplies the tree, document markdown, raw markdown, and change events; the browser converts markdown and never touches the filesystem.

## User Stories

1. As an engineer, I want to open one page and see the project's glossary, map, and issue plan, so that I do not have to browse `.context/` file by file.
2. As an engineer, I want the page to open on the active issue's spec, so that the most useful planning document is visible immediately.
3. As a reviewer, I want to switch between glossary, map, and issues without a reload, so that I can move between domain vocabulary, constraints, and planned work quickly.
4. As a reviewer, I want the rail to list every map record, so that I can jump to the rules that govern the files I am reviewing.
5. As an issue owner, I want the selected issue to show its spec and numbered tasks, so that I can see the plan and its slices together.
6. As an issue owner, I want each task to show its status and blockers, so that I can tell what can start now and what is waiting.
7. As an issue owner, I want the spec to show how many tasks are done, so that I can judge progress without opening every task.
8. As a reader, I want the open document's H2 headings listed in a TREE, so that I can jump to a section.
9. As a reader, I want the active TREE item to follow my scroll position, so that I always know which section I am in.
10. As a reader, I want a reading-progress meter and an estimated read time, so that I can pace a long record or spec.
11. As a reader, I want the page to preserve my scroll position when a file changes, so that a live update does not lose my place.
12. As a reader, I want a live/reconnecting indicator, so that I know whether the page is still watching the workspace.
13. As a sharer, I want the URL hash to identify the open document, so that I can send a link to a spec or task.
14. As a sharer, I want to copy the file path, copy the markdown, open the raw markdown, and copy the link, so that I can move the content into another tool.
15. As a maintainer, I want malformed tasks and specs to appear as diagnostics while still rendering, so that one bad file cannot hide the rest of the workspace.
16. As a maintainer, I want a one-shot `--check` report, so that an agent can verify a workspace without reading HTML.
17. As a maintainer, I want the template to be frozen and dependency-free, so that projects use it through `--root` without forking the shell.
18. As a reader on a phone, I want the rail above the article in one column, so that the page is usable at 390px without nested scrolling.
19. As a keyboard user, I want visible focus and native controls, so that tabs, TREE items, and share actions work without a pointer.
20. As a privacy-conscious user, I want no request to leave localhost, so that the page works with the network disconnected.

## Implementation Decisions

- One HTML shell, a token-driven stylesheet set, and small ES modules under `public/js/`, with a vendored pinned markdown parser. No framework, bundler, build step, or runtime npm dependency.
- `src/serve.mjs` exposes `/api/tree`, `/api/doc`, `/api/raw`, `/api/asset`, and `/api/events`; all other routes serve static shell assets. Non-GET/HEAD requests are rejected.
- `src/lib/scan.mjs` owns workspace discovery; the task and record parsers own their grammars, status normalization, dependency validation, and diagnostics.
- Reference checkouts under `.context/reference/` stay out of every tree, count, and read route; they are other projects, not workspace documents.
- The browser converts markdown with the vendored parser, sanitizes the result, assigns stable deduplicated heading IDs, and rewrites relative links and images to page routes.
- The URL hash is the source of truth for the open document: `#/glossary`, `#/map/<record>`, `#/issues/<issue>`, `#/issues/<issue>/research`, `#/issues/<issue>/<task-number>`.
- Live updates arrive through a server-sent event stream. The client debounces a tree refresh and reloads the open document in place.
- The rail is independently scrollable on desktop, and the whole page scrolls on narrow screens.
- Typography uses the locally installed Anthropic families by name. No font is embedded or fetched.
- Diagnostics are part of the tree payload and are also produced client-side when markdown cannot be rendered.

## Constraints

- The page is read-only: no writes, edit forms, status changes, or mutation endpoints.
- The template never reads the filesystem from the browser; all data comes from the local server.
- The accepted shell, scanner, client, and styles are frozen. Projects supply a root; they do not edit the template.
- Markdown is the only content source. Do not add generated data files, a database, or a CMS.
- No request may leave localhost at runtime: no CDN, analytics, webfonts, or external images.
- Only font weights 400, 500, and 700 may be used. Never use 600.
- The page must degrade, not blank, when a document is malformed.
- Below 900px the layout collapses to one column with no nested scrolling.
- The same markdown input must produce the same page output.

### Supersedes

None

## Testing Decisions

- Test the scanner against real `.context` shapes and against malformed fixtures: missing status, unknown status, missing spec, dangling blocker, cycle, and malformed heading.
- Test the server contract with HTTP requests: tree shape, document payload, raw markdown, SSE change notification, path traversal rejection, and 405 on writes.
- Test the rendered page at desktop and 390px widths: default spec, tab switching, TREE jumps, active section, progress, task meta, diagnostics, and independent scrolling.
- Judge external behavior rather than implementation details. A good test asserts what a reader can see or what the API returns, not internal class names.
- Verify `--check` exits 1 on an error diagnostic and 0 on a clean workspace.
- Confirm no runtime request targets a non-local origin.

## Out of Scope

Editing content, authentication, search, deployment, multi-repository workspaces, and wiring the template into existing skills (`to-spec`, `to-tasks`, `implement`).

## Further Notes

The visual pattern follows a fixed-rail article layout: a quiet paper ground, hairline rules, small tracked uppercase display headings, and serif body prose. The layout is adapted; the reference content is not.
