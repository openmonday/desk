# 03: Wire navigation, tabs, and shareable hash routes

Status: done
Blocked by: 02

## What to build

Default document selection, tab-specific rail lists, issue expansion into spec and numbered tasks, the document TREE, hash routing, and the share actions.

## Acceptance criteria

- [x] The page opens the first issue spec, else the first map record, else the glossary.
- [x] Switching tabs and documents does not reload the page.
- [x] The URL hash identifies the open document and survives reload.
- [x] The rail lists glossary, map records, or issues with the selected issue's spec and tasks.
- [x] TREE items jump to their heading and the active item follows scrolling.
- [x] SHARE copies the path, copies the markdown, opens the raw markdown, and copies the link.

## Constraints

Navigation is read-only. The hash is the only persisted location state.

## Verification

Loaded `#/issues/api-key-rotation/3` directly; the task and its meta strip rendered. TREE items were present and the first section was active.
