---
type: feat
files:
  - public/shell.html
  - public/theme.css
since: 0ad3833
---

# Frozen visual shell and typography contract

## Feature

Provides the fixed three-tab top bar, the two-pane viewport, the paper-like visual system, and the responsive single-column fallback.

## Constraints

- Use the installed Anthropic families by family name only: no `@font-face`, no embedding, no webfont request.
- Only weights 400, 500, and 700 exist. Never use 600: it triggers synthetic bold.
- Set page and rail titles in Anthropic Sans Display 500; body prose in Anthropic Serif Text 400 at about 18.5px / 1.7 with a 66–68ch measure; H2 in Sans Text 500, 12.5px, uppercase, `.15em`; labels, tabs, and chips in Sans Text; numerals, percentages, read time, ticket numbers, and code in Mono Web.
- Keep the ground quiet: hairline rules, no cards, shadows, gradients, or decorative rounded corners.
- Use accent only for warnings, unknown states, and link hover. Status dots are muted (pending), blue (in-progress), green (done), accent (blocked), and outlined accent (unknown).
- Below 900px collapse to one column with the rail above the article and no nested scrolling.
- Provide visible focus, sensible contrast, and reduced-motion behavior.

## Architecture

`shell.html` owns only the tab bar, live indicator, rail container, and article container. `theme.css` owns tokens, typography roles, layout, list/tree styling, meter, diagnostics, article prose, meta strip, and the narrow breakpoint. All content is injected by `app.js`.
