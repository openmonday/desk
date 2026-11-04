import assert from "node:assert/strict";
import test from "node:test";
import { parseArgv, routeArgv, validateOptions } from "../src/cli/args.mjs";

function route(argv) {
  const parsed = parseArgv(argv);
  return { ...routeArgv(parsed.positionals), options: parsed.options };
}

test("commands are recognized only in the first positional", () => {
  assert.deepEqual(route(["list"]), {
    command: "list", args: [], explicit: true, options: {},
  });
  assert.deepEqual(route(["kill", "12", "34", "--force"]), {
    command: "kill", args: ["12", "34"], explicit: true, options: { force: true },
  });
  assert.deepEqual(route(["config", "order", "features"]), {
    command: "config", args: ["order", "features"], explicit: true, options: {},
  });
  assert.deepEqual(route(["help", "list"]), {
    command: "help", args: ["list"], explicit: true, options: {},
  });
});

test("open is the default command and can open names that look like commands", () => {
  assert.deepEqual(route(["notes"]), {
    command: "open", args: ["notes"], explicit: false, options: {},
  });
  assert.deepEqual(route(["open", "list"]), {
    command: "open", args: ["list"], explicit: true, options: {},
  });
  assert.deepEqual(route(["--", "list"]), {
    command: "open", args: ["list"], explicit: false, options: {},
  });
  assert.deepEqual(route(["open", "--", "kill"]), {
    command: "open", args: ["kill"], explicit: true, options: {},
  });
});

test("options use long names, values, and negated booleans", () => {
  assert.deepEqual(route(["--port=8080", "--no-open", "notes"]).options, {
    port: "8080", open: false,
  });
  assert.deepEqual(route(["list", "--json"]).options, { json: true });
  assert.deepEqual(route(["kill", "--all", "--force"]).options, { all: true, force: true });
  assert.deepEqual(route(["-h"]).options, { help: true });
});

test("malformed options fail clearly", () => {
  assert.throws(() => parseArgv(["--wat"]), /unknown option "--wat"/);
  assert.throws(() => parseArgv(["--port"]), /--port requires a value/);
  assert.throws(() => parseArgv(["--json=yes"]), /--json does not take a value/);
  assert.throws(() => parseArgv(["-x"]), /unknown option "-x"/);
});

test("options are validated per command", () => {
  assert.doesNotThrow(() => validateOptions("open", { port: "8080", open: false, quiet: true }));
  assert.doesNotThrow(() => validateOptions("list", { json: true }));
  assert.doesNotThrow(() => validateOptions("kill", { all: true, force: true }));
  assert.throws(() => validateOptions("list", { port: "8080" }), /not valid for "desk list"/);
  assert.throws(() => validateOptions("config", { quiet: true }), /not valid for "desk config"/);
});
