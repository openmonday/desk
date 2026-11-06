# Context

## Workspace

The `.desk/` directory at a project root. It holds the glossary, architecture records, feature specs, tickets, handoffs, and reports that engineering skills read and write.

## Glossary

`CONTEXT.md`. A lasting list of the project's domain terms. Each term is an H2 heading so the plan page can render it as a section in the TREE.

## Code Graph

`architecture/graph.json`. A read-only document produced by mycel: files, symbols, call edges, and symbol hierarchies. The page draws it as a graph; it is never treated as a Markdown document.

## Architecture Record

A lasting note under `architecture/<slug>.md` describing one finished change: what it built, the rules future changes must keep, and its shape. Records use `type`, `files`, and `since` frontmatter.

## Feature

A directory under `features/<feature-slug>/` that groups one unit of work: a `spec.md` and a `tickets/` directory. Features are temporary; remove them when the work closes.

## Spec

`spec.md`. The durable source of a feature's problem, solution, user stories, implementation decisions, constraints, testing decisions, and out-of-scope work. Specs start at `## Problem Statement` and have no H1.

## Ticket

A tracer-bullet vertical slice under `tickets/NN-<slug>.md`. Each ticket has an H1 in the form `# NN: Title`, a `Status:` line, a `Blocked by:` line, acceptance criteria, and verification evidence as it completes.

## Status

A ticket's normalized state: `pending`, `in-progress`, `done`, or `blocked`. The plan page maps these to muted, blue, green, and accent dots; an unrecognized value becomes `unknown` with an outlined accent dot.

## Blocker

A ticket edge declared by `Blocked by: 01, 02`. A blocker must resolve within the same feature. A dangling or cyclic blocker is a diagnostic, not a render failure.

## Diagnostic

A scanner finding attached to a path and severity (`warn` or `error`). Diagnostics appear in the plan page rail; they never replace the article or blank the page.

## Frozen Template

The rule that the accepted `plan-page/` shell is never edited to fit a workspace. A project passes its root to the server; the markdown shapes and diagnostics absorb project variation.

## Rail

The fixed left column of the plan page. It contains the open document title, the tab's document list, the TREE, reading progress, SHARE actions, and diagnostics.

## Tree

The list of the open document's H2 headings, rendered with connectors. Tree items jump to their heading and highlight the section under the reading position.

## Read Time

An estimate computed in the browser from the open document's word count at roughly 220 words per minute.

## Hash Route

The shareable URL fragment that identifies the open document: `#/context`, `#/architecture/<slug>`, `#/features/<slug>`, or `#/features/<slug>/<ticket-number>`.
