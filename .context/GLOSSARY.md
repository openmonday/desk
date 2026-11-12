# Glossary

## Context Workspace

`.context/`. The local, Git-excluded directory at a project root that holds the glossary, the map, the issue folders, and reference checkouts. It is disposable: the committed code is the source of truth.

## Glossary

`GLOSSARY.md`. A lasting list of the project's domain terms. Each term is an H2 heading so the rail can list it.

## Map

`map/`. The records that describe the committed code, grouped in module folders. The map is rebuilt and reconciled by `/draw-map`; it is never edited to fit a workspace.

## Map Record

A Markdown file anywhere under `map/`, such as `map/payments/retry.md`. Front matter names its `type`, the `files` it covers, and the `since` commit; the body states its Feature, Constraints, Architecture, and any Violations.

## Issue

A folder under `issues/<issue-slug>/` that groups one unit of work: a spec, an optional research report, and the tasks that split it. Issues are temporary; remove them when the work closes.

## Spec

`spec.md`. The durable source of an issue's problem, solution, user stories, implementation decisions, constraints, testing decisions, and out-of-scope work. Specs start at `## Problem Statement` and have no H1.

## Task

A tracer-bullet vertical slice under `tasks/<task-slug>.md`. Each task has an `# NN: Title` heading, a `Status:` line, a `Blocked by:` line, acceptance criteria, and verification evidence as it completes.

## Status

A task's normalized state: `pending`, `in-progress`, `done`, or `dropped`. An unrecognized value becomes `unknown` with a diagnostic.

## Blocker

A task edge declared by `Blocked by: 01, 02`. A blocker must resolve within the same issue. A dangling or cyclic blocker is a diagnostic, not a render failure.

## Frontier

The tasks whose blockers are all done. The graph panel shows them as ready to start.

## Reference

`reference/`. Checkouts of other projects used by `/research`, one folder per project at a pinned commit. The page never renders or serves them.

## Research Report

`research.md` in an issue folder. How the reference projects solve a problem, with diagrams saved beside it and cited by relative link.

## Diagnostic

A scanner finding attached to a path and severity (`warn` or `error`). Diagnostics appear in the rail; they never replace the article or blank the page.

## Rail

The fixed left column of the page. It contains the tab's document list, the open document's sections, reading progress, share actions, and diagnostics.

## Tree

The list of the open document's H2 headings, rendered with connectors. Tree items jump to their heading and highlight the section under the reading position.

## Hash Route

The shareable URL fragment that identifies the open document: `#/glossary`, `#/map/<record>`, `#/issues/<issue>`, `#/issues/<issue>/research`, `#/issues/<issue>/<task-number>`, or `#/overview/<path>`.
