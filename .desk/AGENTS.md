# Assist Instructions

Project-local conventions for the plan-page template. Read this file before planning, implementing, or reviewing work in this project.

## Files

```text
.desk/
├── AGENTS.md                      # these conventions
├── CONTEXT.md                     # domain terms (lasting)
├── arch/                          # architecture records (lasting)
│   └── <descriptive-slug>.md
└── features/                      # work in progress (temporary)
    └── plan-page-template/
        ├── spec.md
        └── tickets/
            ├── 01-<ticket-slug>.md
            └── 02-<ticket-slug>.md
```

Create files only when there is content to record.

## Rules

- The template under `plan-page/` is read-only at runtime. The server exposes GET/HEAD only; do not add mutation endpoints, edit forms, or status changes.
- `serve.mjs`, `lib/scan.mjs`, and `public/*` are frozen once accepted. Later projects use them through `--root`; they do not fork the shell.
- Markdown is the only content source. Do not add a database, generated data files, or runtime dependencies.
- Keep all runtime requests on localhost. No CDN, analytics, webfont requests, or embedded fonts.
- Preserve the data contract in `SKILL.md`: `/api/tree`, `/api/doc`, `/api/raw`, `/api/events`.
- Diagnostics are data. A malformed document must degrade to a rail diagnostic and still render.
- Ticket `Status:` values are `pending`, `in-progress`, `done`, or `blocked`. `Blocked by:` lists ticket numbers; use `None` when unblocked.
- Architecture records follow `update-arch/scripts/ARCH-FORMAT.md`: `type`, `files`, and `since` frontmatter, then `## Feature` (optional for refactors), `## Constraints`, and `## Architecture`.

## Finding arch records

Search the `files:` frontmatter for the paths a change touches:

```bash
grep -l -e '- serve.mjs' .desk/arch/*.md
```

Read matching records and respect their Constraints before changing code.
