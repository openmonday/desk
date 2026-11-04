#!/usr/bin/env node
/* desk — open a Markdown file or folder in the live page.
 *
 * The page decides what it is looking at: a `.desk` workspace when the target
 * is the workspace root or lives under `.desk/`, otherwise a Markdown library.
 * With a file target, the matching document opens in the browser. The viewer
 * is read-only: edit the Markdown and the page follows.
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveTarget } from "./cli/target.mjs";
import {
  SECTIONS, configPath, hideSection, readNav, resetNav, setDefault, setOrder,
  unhideSection, writeNav,
} from "./lib/config.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const HELP = `Usage:
  desk [path] [options]

Open a Markdown file or folder in the live page. Folders under .desk, the
workspace root, and recognized workspace records open the workspace view. Any
other Markdown file opens as a library from its own folder. With a file, the
browser opens that document.

Options:
  --port <n>     Port to listen on (default 7777, falls forward)
  --host <addr>  Bind address (default 127.0.0.1)
  --open         Open the browser (default when path is a file)
  --no-open      Keep the browser closed
  --quiet        Suppress the startup report
  -h, --help     Show this help

Settings (workspace tabs; global, stored once per user; reload open pages to apply):
  desk config                    show current settings
  desk config order <id...>      reorder the top tabs
  desk config default <id>       tab to open when no document is given
  desk config hide <id>          hide a top tab
  desk config unhide <id>        show a hidden tab
  desk config reset              restore the defaults

  Sections: ${SECTIONS.join(", ")}`;

const VALUED = new Set(["port", "host"]);

function parse(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help" || arg === "help") {
      flags.help = true;
    } else if (arg === "--open") {
      flags.open = true;
    } else if (arg === "--no-open") {
      flags.open = false;
    } else if (arg === "--quiet") {
      flags.quiet = true;
    } else if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const key = arg.slice(2, eq === -1 ? undefined : eq);
      if (!VALUED.has(key)) throw new Error(`unknown option "${arg}"`);
      const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
      if (value == null || value === "") throw new Error(`--${key} requires a value`);
      flags[key] = value;
    } else {
      pos.push(arg);
    }
  }
  return { flags, pos };
}

function printConfig(nav) {
  const width = 8;
  const row = (label, value) => `${label.padEnd(width)}  ${value}`;
  console.log(row("Config", configPath()));
  console.log(row("Order", nav.order.join(", ")));
  console.log(row("Default", nav.default || "auto"));
  console.log(row("Hidden", nav.hidden.length ? nav.hidden.join(", ") : "none"));
}

async function runConfig(args) {
  const [sub, ...rest] = args;
  if (!sub) {
    printConfig(await readNav());
    return;
  }

  if (sub === "reset") {
    if (rest.length) throw new Error("config reset takes no arguments");
    const file = await resetNav();
    process.stdout.write(`desk: reset ${file}\n`);
    return;
  }

  const nav = await readNav();
  let next;
  if (sub === "order") {
    if (!rest.length) throw new Error(`config order needs one or more sections: ${SECTIONS.join(", ")}`);
    next = setOrder(nav, rest);
  } else if (sub === "default") {
    if (rest.length !== 1) throw new Error("config default needs one section");
    next = setDefault(nav, rest[0]);
  } else if (sub === "hide") {
    if (rest.length !== 1) throw new Error("config hide needs one section");
    next = hideSection(nav, rest[0]);
  } else if (sub === "unhide") {
    if (rest.length !== 1) throw new Error("config unhide needs one section");
    next = unhideSection(nav, rest[0]);
  } else {
    throw new Error(`unknown config command "${sub}"`);
  }

  await writeNav(next);
  printConfig(next);
}

async function main() {
  const { flags, pos } = parse(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  const [command, ...configArgs] = pos;
  if (command === "config") {
    await runConfig(configArgs);
    return;
  }
  if (pos.length > 1) throw new Error(`expected one path, got ${pos.length}`);
  const target = command;

  const resolved = await resolveTarget(target ?? ".");
  const args = [path.join(HERE, "serve.mjs")];
  args.push(resolved.mode === "desk" ? "--root" : "--docs", resolved.root);
  if (resolved.route) args.push("--hash", resolved.route);
  if (flags.port) args.push("--port", String(flags.port));
  if (flags.host) args.push("--host", flags.host);
  if (flags.quiet) args.push("--quiet");
  if (flags.open ?? resolved.file) args.push("--open");

  const child = spawn(process.execPath, args, { stdio: "inherit" });
  child.on("exit", (code, signal) => process.exit(signal ? 130 : code ?? 0));
}

main().catch((err) => {
  process.stderr.write(`desk: ${String(err?.message || err)}\n`);
  process.exit(1);
});
