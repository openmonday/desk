/* Shared temporary-workspace fixtures for the node:test suite. */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const SPEC_MD = `# Demo

## Problem Statement

A fixture feature.

## Solution

Build it.

## Implementation Decisions

Keep it small.

## Testing Decisions

Assert the contract.

## Out of Scope

Everything else.
`;

export async function makeWorkspace() {
  const root = await mkdtemp(path.join(os.tmpdir(), "desk-test-"));
  const ws = path.join(root, ".desk");
  const feature = path.join(ws, "features", "demo");
  await mkdir(path.join(feature, "tickets"), { recursive: true });
  await mkdir(path.join(ws, "arch"), { recursive: true });

  await writeFile(
    path.join(ws, "CONTEXT.md"),
    "# Context\n\n## Workspace\n\nThe workspace.\n\n## Ticket\n\nA unit of work.\n",
  );
  await writeFile(
    path.join(ws, "arch", "one.md"),
    "---\ntype: feature\nfiles:\n  - one.mjs\nsince: 2026-01-01\n---\n\n# One\n\n## Constraints\n\nKeep it.\n\n## Architecture\n\nIt works.\n",
  );
  await writeFile(path.join(feature, "spec.md"), SPEC_MD);

  return {
    root,
    ws,
    feature,
    tickets: path.join(feature, "tickets"),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export function ticket(n, title, status = "pending", blockedBy = "None", body = "") {
  const nn = String(n).padStart(2, "0");
  return `# ${nn}: ${title}

Status: ${status}
Blocked by: ${blockedBy}

${body || "## What to build\n\nDo it.\n\n## Acceptance criteria\n\n- [ ] It works.\n"}
`;
}

export async function writeTicket(dir, n, title, status, blockedBy, body) {
  const nn = String(n).padStart(2, "0");
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  await writeFile(path.join(dir, `${nn}-${slug}.md`), ticket(n, title, status, blockedBy, body));
}
