import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_NAV, configPath, hideSection, normalizeNav, readNav, resetNav,
  setDefault, setOrder, unhideSection, writeNav,
} from "../src/lib/config.mjs";

test("normalizeNav fills and filters sections", () => {
  assert.deepEqual(
    normalizeNav({ order: ["issues", "issues"], hidden: ["map"], default: "issues" }),
    { order: ["issues", "glossary", "map"], hidden: ["map"], default: "issues" },
  );
  assert.deepEqual(
    normalizeNav({ order: ["nope"], hidden: ["glossary", "map", "issues"] }),
    { order: ["glossary", "map", "issues"], hidden: ["glossary", "map"], default: null },
  );
  assert.deepEqual(normalizeNav(null), { order: ["glossary", "map", "issues"], hidden: [], default: null });
});

test("sections from the old .desk layout keep working as aliases", () => {
  assert.deepEqual(
    normalizeNav({ order: ["features", "context", "architecture"], hidden: ["architecture"], default: "features" }),
    { order: ["issues", "glossary", "map"], hidden: ["map"], default: "issues" },
  );
});

test("mutations reorder, hide, unhide, and keep a visible default", () => {
  const hidden = hideSection(DEFAULT_NAV, "map");
  assert.deepEqual(hidden.hidden, ["map"]);
  assert.equal(unhideSection(hidden, "map").hidden.length, 0);
  assert.equal(setDefault(hidden, "glossary").default, "glossary");
  assert.equal(setDefault(hidden, "map").hidden.includes("map"), false);
  assert.equal(hideSection({ ...DEFAULT_NAV, default: "issues" }, "issues").default, null);
  assert.equal(hideSection(hideSection(DEFAULT_NAV, "glossary"), "map").hidden.length, 2);
  assert.throws(
    () => hideSection(hideSection(hideSection(DEFAULT_NAV, "glossary"), "map"), "issues"),
    /at least one/,
  );
  assert.throws(() => setOrder(DEFAULT_NAV, ["nope"]), /unknown section/);
  assert.deepEqual(setOrder(DEFAULT_NAV, ["issues", "glossary"]).order, ["issues", "glossary", "map"]);
});

test("config file round-trips under DESK_CONFIG", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "desk-config-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = { DESK_CONFIG: path.join(dir, "desk.json") };
  assert.equal(configPath(env), env.DESK_CONFIG);

  const nav = { order: ["issues", "glossary", "map"], hidden: ["map"], default: "issues" };
  await writeNav(nav, env);
  assert.deepEqual(await readNav(env), nav);

  await resetNav(env);
  assert.deepEqual(await readNav(env), normalizeNav(DEFAULT_NAV));
});

test("a broken config falls back to defaults", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "desk-config-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "desk.json");
  await writeFile(file, "{ not json");
  assert.deepEqual(await readNav({ DESK_CONFIG: file }), normalizeNav(DEFAULT_NAV));
});
