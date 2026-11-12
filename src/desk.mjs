#!/usr/bin/env node
/* desk — open a Markdown file or folder in the live page, and manage the
 * servers started by earlier invocations.
 *
 * The page decides what it is looking at: a `.context` workspace when the
 * target is the workspace root or lives under `.context/`, otherwise a
 * Markdown library.
 * With a file target, the matching document opens in the browser. The viewer
 * is read-only: edit the Markdown and the page follows.
 */
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgv, routeArgv, validateOptions } from "./cli/args.mjs";
import { resolveTarget } from "./cli/target.mjs";
import {
  SECTIONS, configPath, hideSection, readNav, resetNav, setDefault, setOrder,
  unhideSection, writeNav,
} from "./lib/config.mjs";
import { listServers, stopServer } from "./lib/servers.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const HELP = `Usage:
  desk [open] [path] [options]
  desk list [--json]
  desk kill (--all | <pid>...) [--force]
  desk config [command]
  desk help [command]

Open a Markdown file or folder in the live page. Folders under .context, the
workspace root, and the glossary, map records, and issues open the workspace
view. Any Markdown file outside .context, or inside .context/reference, opens
as a library from its own folder. With a file, the browser opens that
document.

Commands:
  open [path]        Open a path (the default command)
  list               List running desk servers
  kill               Stop running desk servers by PID
  config             Show or change workspace settings
  help [command]     Show this help, or help for one command

Open options:
  --port <n>         Port to listen on (default 7777, falls forward)
  --host <addr>      Bind address (default 127.0.0.1)
  --open             Open the browser (default when path is a file)
  --no-open          Keep the browser closed
  --quiet            Suppress the startup report
  -h, --help         Show this help

A command name is always a command. To open a folder with the same name, use
the open command or the option terminator:

  desk open list
  desk -- list

Settings (workspace tabs; global, stored once per user; reload open pages to apply):
Overview is always the first workspace tab. These settings apply to
glossary, map, and issues.
  desk config                    show current settings
  desk config order <id...>      reorder the top tabs
  desk config default <id>       tab to open when no document is given
  desk config hide <id>          hide a top tab
  desk config unhide <id>        show a hidden tab
  desk config reset              restore the defaults

  Sections: ${SECTIONS.join(", ")}`;

const COMMAND_HELP = {
  open: HELP,
  list: `Usage:
  desk list [--json]

List every running desk server owned by the current user.

Options:
  --json         Print machine-readable JSON
  -h, --help     Show this help`,
  kill: `Usage:
  desk kill (--all | <pid>...) [--force]

Stop running desk servers. Pass one or more PIDs from \`desk list\`, or use
--all to stop every server. SIGTERM is sent by default.

Options:
  --all          Stop every running desk server
  --force        Send SIGKILL instead of SIGTERM
  -h, --help     Show this help`,
  config: `Usage:
  desk config                    show current settings
  desk config order <id...>      reorder the top tabs
  desk config default <id>       tab to open when no document is given
  desk config hide <id>          hide a top tab
  desk config unhide <id>        show a hidden tab
  desk config reset              restore the defaults

Overview is always the first workspace tab.
Sections: ${SECTIONS.join(", ")}`,
  help: `Usage:
  desk help [command]

Show general help, or help for one command: open, list, kill, or config.`,
};

function printHelp(topic) {
  process.stdout.write(`${COMMAND_HELP[topic] || HELP}\n`);
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

function displayPath(value) {
  const home = os.homedir();
  if (value === home) return "~";
  if (value.startsWith(`${home}${path.sep}`)) return `~${value.slice(home.length)}`;
  return value;
}

function formatTable(headers, rows) {
  const widths = headers.map((header, i) => Math.max(
    header.length,
    ...rows.map((row) => row[i].length),
  ));
  return [headers, ...rows]
    .map((row) => row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]))).join("  "))
    .join("\n");
}

async function runList(options) {
  const servers = await listServers();

  if (options.json) {
    process.stdout.write(`${JSON.stringify(servers, null, 2)}\n`);
    return;
  }
  if (!servers.length) {
    process.stdout.write("desk: no running servers\n");
    return;
  }

  const rows = servers.map((server) => [
    String(server.pid),
    String(server.port),
    server.mode,
    server.url,
    displayPath(server.root),
  ]);
  console.log(formatTable(["PID", "PORT", "MODE", "URL", "TARGET"], rows));
}

function parsePid(value) {
  const pid = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(pid) || pid <= 0) {
    throw new Error(`invalid PID "${value}"`);
  }
  return pid;
}

async function runKill(options, args) {
  if (options.all && args.length) throw new Error("kill accepts either --all or one or more PIDs, not both");
  if (!options.all && !args.length) throw new Error("kill needs one or more PIDs, or --all");

  const servers = await listServers();
  let targets;
  if (options.all) {
    targets = servers;
  } else {
    const pids = [...new Set(args.map(parsePid))];
    const byPid = new Map(servers.map((server) => [server.pid, server]));
    const missing = pids.filter((pid) => !byPid.has(pid));
    if (missing.length) {
      throw new Error(`no running desk server with PID ${missing.join(", ")}; run "desk list"`);
    }
    targets = pids.map((pid) => byPid.get(pid));
  }

  if (!targets.length) {
    process.stdout.write("desk: no running servers\n");
    return;
  }

  for (const server of targets) {
    await stopServer(server, { force: Boolean(options.force) });
    process.stdout.write(`desk: stopped ${server.pid} (${server.url})\n`);
  }
}

async function runOpen(options, args) {
  if (args.length > 1) throw new Error(`expected one path, got ${args.length}`);
  const target = args[0];

  const resolved = await resolveTarget(target ?? ".");
  const childArgs = [path.join(HERE, "serve.mjs")];
  childArgs.push(resolved.mode === "context" ? "--root" : "--docs", resolved.root);
  if (resolved.route) childArgs.push("--hash", resolved.route);
  if (options.port) childArgs.push("--port", String(options.port));
  if (options.host) childArgs.push("--host", options.host);
  if (options.quiet) childArgs.push("--quiet");
  if (options.open ?? resolved.file) childArgs.push("--open");

  const child = spawn(process.execPath, childArgs, { stdio: "inherit" });
  child.on("exit", (code, signal) => process.exit(signal ? 130 : code ?? 0));
}

async function main() {
  const { options, positionals } = parseArgv(process.argv.slice(2));
  const route = routeArgv(positionals);

  if (options.help) {
    printHelp(route.explicit ? route.command : null);
    return;
  }
  if (route.command === "help") {
    validateOptions("help", options);
    if (route.args.length > 1) throw new Error("help takes at most one command");
    const topic = route.args[0];
    if (topic && !COMMAND_HELP[topic]) throw new Error(`unknown command "${topic}"`);
    printHelp(topic);
    return;
  }

  validateOptions(route.command, options);

  if (route.command === "list") {
    await runList(options);
  } else if (route.command === "kill") {
    await runKill(options, route.args);
  } else if (route.command === "config") {
    await runConfig(route.args);
  } else {
    await runOpen(options, route.args);
  }
}

main().catch((err) => {
  process.stderr.write(`desk: ${String(err?.message || err)}\n`);
  process.exit(1);
});
