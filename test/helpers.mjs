/* Shared temporary-workspace fixtures for the node:test suite. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const SPEC_MD = `## Problem Statement

A fixture issue.

## Solution

Build it.

## User Stories

1. As a reader, I want a fixture.

## Implementation Decisions

Keep it small.

## Constraints

- Keep it read-only: no writes.

### Supersedes

None

## Testing Decisions

Assert the contract.

## Out of Scope

Everything else.
`;

export const RECORD_MD = `---
type: feat
files:
  - src/one.mjs
since: 0123456
---

# One

## Feature

Does one thing.

## Constraints

- Keep it.

## Architecture

It works.
`;

export async function makeWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "leaf-test-"));
  const ws = path.join(root, ".context");
  const issue = path.join(ws, "issues", "demo");
  await mkdir(path.join(issue, "tasks"), { recursive: true });
  await mkdir(path.join(ws, "map"), { recursive: true });
  await mkdir(path.join(ws, "reference", "other"), { recursive: true });

  await writeFile(
    path.join(ws, "GLOSSARY.md"),
    "# Glossary\n\n## Workspace\n\nThe workspace.\n\n## Task\n\nA unit of work.\n",
  );
  await writeFile(path.join(ws, "map", "one.md"), RECORD_MD);
  await writeFile(path.join(issue, "spec.md"), SPEC_MD);
  await writeFile(path.join(ws, "reference", "other", "README.md"), "# Other project\n");

  return {
    root,
    ws,
    issue,
    tasks: path.join(issue, "tasks"),
    reference: path.join(ws, "reference"),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export function task(n, title, status = "pending", blockedBy = "None", body = "") {
  const nn = String(n).padStart(2, "0");
  return `# ${nn}: ${title}

Status: ${status}
Blocked by: ${blockedBy}

${body || "## What to build\n\nDo it.\n\n## Acceptance criteria\n\n- [ ] It works.\n"}
`;
}

export function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Task files are named with a slug; the number lives in the heading. */
export async function writeTask(dir, n, title, status, blockedBy, body) {
  await writeFile(path.join(dir, `${slugify(title)}.md`), task(n, title, status, blockedBy, body));
}
