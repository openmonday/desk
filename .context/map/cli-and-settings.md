---
type: feat
files:
  - src/leaf.mjs
  - src/cli/
  - src/lib/config.mjs
since: e48f8be
---

# Viewer CLI, target detection, and global settings

## Feature

`leaf <path>` decides whether a target is a workspace or a Markdown library, opens the matching document route, and starts the page server. `leaf config` reorders, hides, or defaults the workspace tabs.

## Constraints

- Decide the mode from the path: the `.context` root, its folders, and its glossary, map, and issue documents open the workspace view; everything else opens as a Markdown library from its own folder.
- A task target opens its number route, so the page can find the task by heading rather than file name.
- A command name always wins over a folder with the same name; `leaf open <path>` and `--` reach the folder itself.
- Settings are global to the user, optional, and tolerant: unknown or old section names are ignored or aliased, never fatal.
- Keep the route encoding identical in `src/cli/target.mjs` and `public/js/state.js`.

## Architecture

`src/leaf.mjs` owns the commands and help; `src/cli/args.mjs` the argument grammar; `src/cli/target.mjs` mode detection and initial routes; `src/lib/config.mjs` the normalized settings model. The server serves whatever route the CLI passes with `--hash`.
