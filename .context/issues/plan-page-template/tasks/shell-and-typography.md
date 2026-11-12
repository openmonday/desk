# 02: Build the frozen visual shell

Status: done
Blocked by: 01

## What to build

The top tab bar, the two-pane viewport, the paper-like visual system, and the responsive single-column fallback, using the installed Anthropic font families.

## Acceptance criteria

- [x] OVERVIEW, GLOSSARY, MAP, and ISSUES tabs are present and keyboard reachable.
- [x] Rail and article scroll independently on wide screens.
- [x] Page and rail titles use Sans Display 500; body prose uses Serif Text at 18.5px / 1.7 and a 67ch measure.
- [x] H2 headings are Sans Text 500, 12.5px, uppercase, letter-spacing .15em.
- [x] No font weight 600 is used.
- [x] Below 900px the rail sits above the article with no nested scrolling.
- [x] Focus is visible and reduced motion is respected.

## Constraints

No `@font-face`, no embedded or fetched fonts, no cards, shadows, gradients, or decorative rounded corners. Accent is used sparingly.

## Verification

Rendered at 1440px and 390px with headless Chromium; screenshots reviewed for rail, article, measure, and single-column fallback.
