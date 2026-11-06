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
  files: {
    type: "dir",
    children: [
      { type: "file", path: "AGENTS.md" },
      { type: "file", path: "CONTEXT.md" },
      { type: "dir", children: [{ type: "file", path: "architecture/one.md" }] },
      { type: "dir", children: [
        { type: "file", path: "features/demo/spec.md" },
        { type: "dir", children: [{ type: "file", path: "features/demo/tickets/01-do-it.md" }] },
      ] },
    ],
  },
  context: { exists: true, path: "CONTEXT.md" },
  architecture: [{ path: "architecture/one.md" }],
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

test("detectedFiles lists workspace files and resolves ticket routes", () => {
  const files = detectedFiles(deskTree, "#/features/demo/1");
  assert.deepEqual(files, [
    { path: "AGENTS.md", opened: false },
    { path: "architecture/one.md", opened: false },
    { path: "CONTEXT.md", opened: false },
    { path: "features/demo/spec.md", opened: false },
    { path: "features/demo/tickets/01-do-it.md", opened: true },
  ]);
});

test("detectedFiles resolves overview file routes", () => {
  const files = detectedFiles(deskTree, "#/overview/architecture/one.md");
  assert.equal(files.find((file) => file.path === "architecture/one.md").opened, true);
  assert.equal(files.filter((file) => file.opened).length, 1);
});

test("formatFileList uses the skm-style installed/opened list", () => {
  const text = formatFileList(docsTree, "#/docs/guides/install.md", { isTTY: false });
  assert.match(text, /^Files \(3 detected\)$/m);
  assert.match(text, /● guides\/install\.md  opened/);
  assert.match(text, /○ README\.md/);
  assert.doesNotMatch(text, /\u001b\[/);
});

test("the code graph route does not mark a Markdown file as opened", () => {
  const files = detectedFiles({ ...deskTree, graph: { path: "architecture/graph.json" } }, "#/architecture/graph");
  assert.equal(files.filter((file) => file.opened).length, 0);
  assert.ok(!files.some((file) => file.path === "architecture/graph.json"));
});
