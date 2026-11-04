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
    normalizeNav({ order: ["features", "features"], hidden: ["architecture"], default: "features" }),
    { order: ["features", "context", "architecture"], hidden: ["architecture"], default: "features" },
  );
  assert.deepEqual(
    normalizeNav({ order: ["nope"], hidden: ["context", "architecture", "features"] }),
    { order: ["context", "architecture", "features"], hidden: ["context", "architecture"], default: null },
  );
  assert.deepEqual(normalizeNav(null), { order: ["context", "architecture", "features"], hidden: [], default: null });
});

test("mutations reorder, hide, unhide, and keep a visible default", () => {
  const hidden = hideSection(DEFAULT_NAV, "architecture");
  assert.deepEqual(hidden.hidden, ["architecture"]);
  assert.equal(unhideSection(hidden, "architecture").hidden.length, 0);
  assert.equal(setDefault(hidden, "context").default, "context");
  assert.equal(setDefault(hidden, "architecture").hidden.includes("architecture"), false);
  assert.equal(hideSection({ ...DEFAULT_NAV, default: "features" }, "features").default, null);
  assert.equal(hideSection(hideSection(DEFAULT_NAV, "context"), "architecture").hidden.length, 2);
  assert.throws(
    () => hideSection(hideSection(hideSection(DEFAULT_NAV, "context"), "architecture"), "features"),
    /at least one/,
  );
  assert.throws(() => setOrder(DEFAULT_NAV, ["nope"]), /unknown section/);
  assert.deepEqual(setOrder(DEFAULT_NAV, ["features", "context"]).order, ["features", "context", "architecture"]);
});

test("config file round-trips under DESK_CONFIG", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "desk-config-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const env = { DESK_CONFIG: path.join(dir, "desk.json") };
  assert.equal(configPath(env), env.DESK_CONFIG);

  const nav = { order: ["features", "context", "architecture"], hidden: ["architecture"], default: "features" };
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
