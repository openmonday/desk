# 05: Verify acceptance checks and freeze the template

Status: pending
Blocked by: 01, 02, 03, 04

## What to build

Run the full acceptance checklist against a real workspace, document the frozen-file rule and data contract in `SKILL.md`, and confirm the page works at 390px with no non-local requests.

## Acceptance criteria

- [x] SKILL.md documents the trigger, run commands, `--check`, data contract, and frozen-files rule.
- [x] The page opens to a spec with rail and article scrolling independently.
- [x] Tabs switch context without a reload.
- [x] A dangling `Blocked by:` shows a diagnostic and still renders.
- [x] Rail TREE items jump and follow scroll; the page is usable at 390px.
- [x] Final visual review against the acceptance checklist on the finished real workspace.
- [x] Confirm no request leaves localhost with the network disconnected.

## Constraints

Do not edit the frozen shell, styles, client, or scanner to make the workspace fit. Fix markdown or diagnostics instead.

## Verification

Screenshots at 1440px and 390px; server contract checks; SSE change test; diagnostics fixture; browser live-refresh test; 390px overflow check; all 12 runtime requests stayed on 127.0.0.1.
