import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { scanDocs } from "../src/lib/docs/scan.mjs";
import { readDocsAsset, readDocsDoc } from "../src/lib/docs/read.mjs";
import { SPEC_MD, ticket } from "./helpers.mjs";

async function makeDocs() {
  const root = await mkdtemp(path.join(os.tmpdir(), "desk-docs-test-"));
  await mkdir(path.join(root, "context", "deep"), { recursive: true });
  await mkdir(path.join(root, "context", "assets"), { recursive: true });
  await mkdir(path.join(root, "architecture"), { recursive: true });
  await mkdir(path.join(root, "features", "demo", "tickets"), { recursive: true });

  await writeFile(path.join(root, "README.md"), "# Welcome\n\nRoot readme.\n");
  await writeFile(path.join(root, "context", "overview.md"), "# Context Overview\n\nIntro.\n");
  await writeFile(path.join(root, "context", "deep", "terms.md"), "# Terms\n\nTerms.\n");
  await writeFile(path.join(root, "architecture", "one.md"), "# One\n\nArchitecture.\n");
  await writeFile(path.join(root, "features", "demo", "spec.md"), SPEC_MD);
  await writeFile(path.join(root, "features", "demo", "tickets", "01-do-it.md"), ticket(1, "Do it"));

  const png = Buffer.from("89504e470d0a1a0a", "hex");
  await writeFile(path.join(root, "context", "assets", "pixel.png"), png);
  await writeFile(path.join(root, "outside.md"), "# Outside\n");

  return {
    root,
    png,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("scanDocs builds sections and a recursive tree", async (t) => {
  const d = await makeDocs();
  t.after(d.cleanup);

  const tree = await scanDocs(d.root);
  assert.equal(tree.ok, true);
  assert.equal(tree.mode, "docs");
  assert.deepEqual(tree.sections.map((s) => s.key), ["home", "architecture", "context", "features"]);
  assert.equal(tree.sections[0].tree[0].path, "README.md");
  assert.equal(tree.sections.find((s) => s.key === "context").firstPath, "context/overview.md");

  const context = tree.sections.find((s) => s.key === "context");
  assert.deepEqual(context.tree.map((n) => [n.type, n.name]), [["file", "overview.md"], ["dir", "deep"]]);
  assert.equal(context.tree[1].children[0].title, "Terms");

  const features = tree.sections.find((s) => s.key === "features");
  assert.equal(features.kind, "features");
  assert.equal(features.features[0].specPath, "features/demo/spec.md");
  assert.equal(features.features[0].tickets[0].path, "features/demo/tickets/01-do-it.md");
});

test("README comes before other files and replacement index files sort naturally", async (t) => {
  const d = await makeDocs();
  t.after(d.cleanup);
  await writeFile(path.join(d.root, "context", "10-later.md"), "# Later\n");
  await writeFile(path.join(d.root, "context", "index.md"), "# Index\n");
  await mkdir(path.join(d.root, "context", "more"), { recursive: true });
  await writeFile(path.join(d.root, "context", "more", "inside.md"), "# Inside\n");

  const tree = await scanDocs(d.root);
  const context = tree.sections.find((s) => s.key === "context");
  assert.equal(context.firstPath, "context/index.md");
  assert.deepEqual(context.tree.map((n) => n.name), ["index.md", "10-later.md", "overview.md", "deep", "more"]);
});

test("docs reads are confined to the root and markdown only", async (t) => {
  const d = await makeDocs();
  t.after(d.cleanup);

  const doc = await readDocsDoc(d.root, "context/overview.md");
  assert.ok(doc.md.startsWith("# Context Overview"));
  assert.equal(await readDocsDoc(d.root, "../outside.md"), null);
  assert.equal(await readDocsDoc(d.root, "context/overview.txt"), null);
  assert.equal(await readDocsDoc(d.root, "nope.md"), null);

  const asset = await readDocsAsset(d.root, "context/assets/pixel.png");
  assert.equal(asset.type, "image/png");
  assert.deepEqual(asset.body, d.png);
  assert.equal(await readDocsAsset(d.root, "context/assets/pixel.html"), null);
  assert.equal(await readDocsAsset(d.root, "../outside.md"), null);
});

test("a top-level overview folder does not collide with root files", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "desk-docs-home-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "overview"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "# Home\n");
  await writeFile(path.join(root, "overview", "index.md"), "# Overview folder\n");

  const tree = await scanDocs(root);
  assert.deepEqual(tree.sections.map((s) => s.key), ["home", "overview"]);
  assert.equal(tree.sections[0].kind, "overview");
  assert.equal(tree.sections[1].firstPath, "overview/index.md");
});
