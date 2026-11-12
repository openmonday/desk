# Assist Instructions

Project-local conventions for the leaf page. Read this file before planning, implementing, or reviewing work in this project.

## Files

```text
.context/
├── GLOSSARY.md                    # domain terms (lasting)
├── map/                           # records of the committed code (lasting)
│   └── <module>/<slug>.md
├── issues/                        # work in progress (temporary)
│   └── <issue-slug>/
│       ├── spec.md
│       ├── research.md            # optional, diagrams beside it
│       └── tasks/
│           └── <task-slug>.md
└── reference/                     # pinned checkouts for /research
```

`.context/` is excluded through `.git/info/exclude`. Create files only when there is content to record.

## Rules

- The page is read-only at runtime. The server exposes GET/HEAD only; do not add mutation endpoints, edit forms, or status changes.
- `src/serve.mjs`, `src/lib/scan.mjs`, and `public/*` are the shell. Projects use them through `leaf <path>`; they do not fork the shell.
- Markdown is the only document source. No database, generated data files, or runtime dependencies.
- `reference/` holds checkouts of other projects. Never scan it, list it, or serve it as a document or asset.
- Keep all runtime requests on localhost. No CDN, analytics, webfont requests, or embedded fonts.
- Preserve the data contract: `/api/tree`, `/api/doc`, `/api/raw`, `/api/asset`, `/api/events`.
- Diagnostics are data. Malformed content must degrade to a rail diagnostic and leave the other views usable.
- Task `Status:` values are `pending`, `in-progress (<owner>)`, `done`, or `dropped`. `Blocked by:` lists task numbers; use `None` when unblocked. The number lives in the `# NN: Title` heading, not the file name.
- Map records use `type`, `files`, and `since` front matter, then `## Feature` for a feat, `## Constraints`, `## Architecture`, and any `## Violations`.

## Finding map records

Search the `files:` front matter for the paths a change touches:

```bash
grep -rl -e '  - src/server/' .context/map/
```

Read matching records and respect their Constraints before changing code. `draw-map/scripts/query-map.py <file>...` does the same lookup with the skill's own parser.
