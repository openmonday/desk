---
type: feat
files:
  - lib/scan.mjs
since: 0ad3833
---

# Workspace scanner and diagnostic model

## Feature

Turns `.desk/` markdown into the navigation tree the page renders: glossary headings, architecture records, features, tickets with normalized status and blockers, progress counts, and diagnostics.

## Constraints

- Read markdown only from the workspace shapes in `.desk/AGENTS.md`: `CONTEXT.md`, `arch/*.md`, and `features/*/{spec.md,tickets/NN-*.md}`.
- Strip fenced code before parsing headings and ticket metadata: a code sample must not create a section or a status.
- Normalize ticket status through one alias table: unknown values become `unknown` and produce a warning.
- Preserve zero-padded ticket numbers in `blockedBy` (`01`, `02`) but compare dependencies numerically.
- Report dangling blockers, cycles, missing specs, missing acceptance criteria, and malformed ticket headings as diagnostics; never throw for malformed content.
- Sort architecture records and features deterministically so the same markdown produces the same tree.

## Architecture

`scanWorkspace` reads the glossary and architecture directory, then scans each feature directory. `scanFeature` parses the spec, ticket files, statuses, blockers, cycles, and progress. `parseTicket` owns the ticket H1/`Status:`/`Blocked by:` grammar. `resolveDoc` and `readDoc` guard file reads and return `{ md, mtime }` for the client.
