# 03: Wire navigation, tabs, and shareable hash routes

Status: done
Blocked by: 02

## What to build

Default document selection, tab-specific rail lists, feature expansion into spec and numbered tickets, the document TREE, hash routing, and the share actions.

## Acceptance criteria

- [x] The page opens the first feature spec, else the first architecture record, else the glossary.
- [x] Switching tabs and documents does not reload the page.
- [x] The URL hash identifies the open document and survives reload.
- [x] The rail lists glossary, architecture records, or features with the selected feature's spec and tickets.
- [x] TREE items jump to their heading and the active item follows scrolling.
- [x] SHARE copies the path, copies the markdown, opens the raw markdown, and copies the link.

## Constraints

Navigation is read-only. The hash is the only persisted location state.

## Verification

Loaded `#/features/api-key-rotation/2` directly; the ticket and its meta strip rendered. TREE items were present and the first section was active.
