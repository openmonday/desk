---
type: feat
files:
  - src/lib/scan.mjs
  - src/lib/workspace.mjs
  - src/lib/workspace-files.mjs
  - src/lib/issues/
  - src/lib/tasks/
  - src/lib/records/
  - src/lib/docs/
since: e48f8be
---

# Workspace scanner and diagnostic model

## Feature

Turns `.context/` markdown into the navigation model the page renders: the glossary headings, map records with their front matter, issues with their spec, research, tasks, normalized status, blockers, progress counts, and diagnostics.

## Constraints

- Read markdown only from the shapes the skills write: `GLOSSARY.md`, `map/**/*.md`, and `issues/<slug>/{spec.md,research.md,tasks/*.md}`. Never scan `reference/`.
- The task number comes from the `# NN: Title` heading, never from the file name: task files are named with a slug.
- Strip fenced code before parsing headings and metadata: a code sample must not create a section or a status.
- Normalize task status through one alias table: `pending`, `in-progress (<owner>)`, `done`, and `dropped`; anything else becomes `unknown` and warns.
- Preserve zero-padded task numbers in `blockedBy` (`01`, `02`) but compare dependencies numerically.
- Report dangling blockers, cycles, missing specs, missing acceptance criteria, and malformed task headings as diagnostics; never throw for malformed content.
- Sort records, issues, and tasks deterministically so the same markdown produces the same tree.

## Architecture

`scanWorkspace` reads the glossary, walks `map/`, and scans each issue. `src/lib/tasks/parse.mjs` owns the task heading, `Status:`, and `Blocked by:` grammar plus cycle detection. `src/lib/records/parse.mjs` owns the record front matter and sections. `resolveDoc` and `readDoc` guard reads and keep `reference/` out. Overview uses `src/lib/workspace-files.mjs`.
