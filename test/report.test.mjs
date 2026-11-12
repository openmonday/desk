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

const contextTree = {
  mode: "context",
  files: {
    type: "dir",
    children: [
      { type: "file", path: "AGENTS.md" },
      { type: "file", path: "GLOSSARY.md" },
      { type: "dir", children: [{ type: "file", path: "map/one.md" }] },
      { type: "dir", children: [
        { type: "file", path: "issues/demo/spec.md" },
        { type: "file", path: "issues/demo/research.md" },
        { type: "dir", children: [{ type: "file", path: "issues/demo/tasks/cache.md" }] },
      ] },
    ],
  },
  glossary: { exists: true, path: "GLOSSARY.md" },
  map: { records: [{ path: "map/one.md" }] },
  issues: [{
    slug: "demo",
    specPath: "issues/demo/spec.md",
    researchPath: "issues/demo/research.md",
    tasks: [{ n: 2, path: "issues/demo/tasks/cache.md" }],
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

test("detectedFiles lists workspace files and resolves task routes", () => {
  const files = detectedFiles(contextTree, "#/issues/demo/2");
  assert.deepEqual(files, [
    { path: "AGENTS.md", opened: false },
    { path: "GLOSSARY.md", opened: false },
    { path: "issues/demo/research.md", opened: false },
    { path: "issues/demo/spec.md", opened: false },
    { path: "issues/demo/tasks/cache.md", opened: true },
    { path: "map/one.md", opened: false },
  ]);
});

test("detectedFiles resolves overview and record routes", () => {
  const overview = detectedFiles(contextTree, "#/overview/map/one.md");
  assert.equal(overview.find((file) => file.path === "map/one.md").opened, true);
  assert.equal(overview.filter((file) => file.opened).length, 1);

  assert.equal(detectedFiles(contextTree, "#/map/one")[5].opened, true);
  assert.equal(detectedFiles(contextTree, "#/glossary")[1].opened, true);
  assert.equal(detectedFiles(contextTree, "#/issues/demo/research")[2].opened, true);
});

test("formatFileList uses the skm-style installed/opened list", () => {
  const text = formatFileList(docsTree, "#/docs/guides/install.md", { isTTY: false });
  assert.match(text, /^Files \(3 detected\)$/m);
  assert.match(text, /● guides\/install\.md  opened/);
  assert.match(text, /○ README\.md/);
  assert.doesNotMatch(text, /\u001b\[/);
});
