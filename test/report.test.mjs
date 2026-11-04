import assert from "node:assert/strict";
import test from "node:test";
import { detectedFiles, formatFileList } from "../src/server/report.mjs";

const docsTree = {
  mode: "docs",
  sections: [
    {
      tree: [
        { type: "file", path: "README.md" },
        { type: "dir", children: [{ type: "file", path: "guides/install.md" }] },
      ],
    },
    {
      tree: [{ type: "file", path: "notes/today.md" }],
    },
  ],
};

const deskTree = {
  mode: "desk",
  context: { exists: true, path: "CONTEXT.md" },
  architecture: [{ path: "arch/one.md" }],
  features: [{
    slug: "demo",
    specPath: "features/demo/spec.md",
    tickets: [{ n: 1, path: "features/demo/tickets/01-do-it.md" }],
  }],
};

test("detectedFiles lists every docs file and marks the opened document", () => {
  const files = detectedFiles(docsTree, "#/docs/guides/install.md");
  assert.deepEqual(files, [
    { path: "guides/install.md", opened: true },
    { path: "notes/today.md", opened: false },
    { path: "README.md", opened: false },
  ]);
});

test("detectedFiles lists workspace records and resolves ticket routes", () => {
  const files = detectedFiles(deskTree, "#/features/demo/1");
  assert.deepEqual(files, [
    { path: "arch/one.md", opened: false },
    { path: "CONTEXT.md", opened: false },
    { path: "features/demo/spec.md", opened: false },
    { path: "features/demo/tickets/01-do-it.md", opened: true },
  ]);
});

test("formatFileList uses the skm-style installed/opened list", () => {
  const text = formatFileList(docsTree, "#/docs/guides/install.md", { isTTY: false });
  assert.match(text, /^Files \(3 detected\)$/m);
  assert.match(text, /● guides\/install\.md  opened/);
  assert.match(text, /○ README\.md/);
  assert.doesNotMatch(text, /\u001b\[/);
});
