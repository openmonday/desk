#!/usr/bin/env node
/* desk.mjs — the agent-facing CLI for a .desk workspace.
 *
 * One call per intent, JSON on stdout, plain exit codes. Agents add, change,
 * and complete tickets without reading or rewriting markdown by hand, and the
 * page updates live because the server watches the same files.
 *
 *   desk add <feature> --title "Retry failed uploads" --blocked-by 02,03
 *   desk update <feature> 04 --status in-progress
 *   desk update <feature> 04 --body ./notes.md
 *   desk done <feature> 04
 *   desk rm <feature> 07 --force
 *   desk list [feature]
 *   desk check
 *   desk page [--port 7777] [--open]
 *   desk docs ./tutorial [--port 7777] [--open]
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findWorkspace, scanWorkspace } from "./lib/scan.mjs";
import { scanDocs } from "./lib/docs/scan.mjs";
import {
  createTicket, updateTicket, completeTicket, removeTicket, listTickets,
} from "./lib/ticket.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const HELP = `desk — add, change, and complete tickets in a .desk workspace

  desk add <feature> --title <text> [--status <s>] [--blocked-by 01,02] [--body <file|->]
  desk update <feature> <n> [--title <text>] [--status <s>] [--blocked-by 01,02] [--body <file|->]
  desk done <feature> <n>              mark done and tick every acceptance box
  desk rm <feature> <n> [--force]      delete a ticket
  desk list [feature]                  every ticket with status and blockers
  desk check [--docs <dir>]            scan and print diagnostics
  desk page [--port <n>] [--open]      serve the live .desk page
  desk docs [dir] [--port <n>] [--open] serve a folder as a Markdown docs library

  --root <dir>   project directory containing .desk (default: walk up from cwd)
  --docs <dir>   docs folder for "desk check", "desk page", or "desk docs"
  --json         always on; output is one JSON object per command

Statuses: pending | in-progress | done | blocked. "complete", "wip", and
"todo" are accepted as aliases.`;

function parse(argv) {
  const flags = {};
  const pos = [];
  const valued = new Set(["title", "status", "blocked-by", "body", "root", "docs", "port", "host"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a === "--json") flags.json = true;
    else if (a === "--force") flags.force = true;
    else if (a === "--open") flags.open = true;
    else if (a === "--quiet") flags.quiet = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      if (!valued.has(key)) throw new Error(`unknown option ${a}`);
      const value = argv[++i];
      if (value == null) throw new Error(`${a} needs a value`);
      flags[key] = value;
    } else pos.push(a);
  }
  return { flags, pos };
}

async function readBody(value) {
  if (value == null) return undefined;
  if (value === "-") return fsp.readFile(0, "utf8");
  return fsp.readFile(path.resolve(value), "utf8");
}

async function resolveWorkspace(flags) {
  const ws = flags.root
    ? (flags.root.endsWith(".desk") ? path.resolve(flags.root) : path.join(path.resolve(flags.root), ".desk"))
    : await findWorkspace(process.cwd());
  if (!ws) throw Object.assign(new Error("no .desk directory found; pass --root"), { status: 2 });
  return ws;
}

const print = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

async function main() {
  const { flags, pos } = parse(process.argv.slice(2));
  const [command, feature, n] = pos;

  if (flags.help || !command) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

  if (command === "page" || command === "serve") {
    const args = [path.join(HERE, "serve.mjs")];
    if (flags.root) args.push("--root", flags.root);
    if (flags.docs) args.push("--docs", flags.docs);
    if (flags.port) args.push("--port", flags.port);
    if (flags.host) args.push("--host", flags.host);
    if (flags.open) args.push("--open");
    if (flags.quiet) args.push("--quiet");
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  if (command === "docs" || command === "doc") {
    const dir = flags.docs || feature || ".";
    const args = [path.join(HERE, "serve.mjs"), "--docs", path.resolve(dir)];
    if (flags.port) args.push("--port", flags.port);
    if (flags.host) args.push("--host", flags.host);
    if (flags.open) args.push("--open");
    if (flags.quiet) args.push("--quiet");
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  if (command === "check" && flags.docs) {
    const root = path.resolve(flags.docs);
    const tree = await scanDocs(root);
    const errors = tree.diagnostics.filter((d) => d.severity === "error").length;
    print({ ok: errors === 0, mode: "docs", root, diagnostics: tree.diagnostics });
    if (errors) process.exitCode = 1;
    return;
  }

  const workspace = await resolveWorkspace(flags);

  if (command === "add") {
    const body = await readBody(flags.body);
    print(await createTicket(workspace, { feature, title: flags.title, status: flags.status, blockedBy: flags["blocked-by"], body }));
    return;
  }

  if (command === "update") {
    const body = await readBody(flags.body);
    print(await updateTicket(workspace, {
      feature,
      n,
      title: flags.title,
      status: flags.status,
      blockedBy: flags["blocked-by"],
      body,
    }));
    return;
  }

  if (command === "done" || command === "complete") {
    print(await completeTicket(workspace, { feature, n }));
    return;
  }

  if (command === "rm" || command === "remove" || command === "delete") {
    print(await removeTicket(workspace, { feature, n, force: Boolean(flags.force) }));
    return;
  }

  if (command === "list" || command === "ls") {
    const tree = await scanWorkspace(workspace);
    print({ ok: true, tickets: listTickets(tree, feature) });
    return;
  }

  if (command === "check") {
    const tree = await scanWorkspace(workspace);
    const errors = tree.diagnostics.filter((d) => d.severity === "error").length;
    print({ ok: errors === 0, workspace, diagnostics: tree.diagnostics });
    if (errors) process.exitCode = 1;
    return;
  }

  throw Object.assign(new Error(`unknown command "${command}"; run desk --help`), { status: 2 });
}

main().catch((err) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: String(err?.message || err) })}\n`);
  process.exit(err?.status && err.status < 10 ? err.status : 1);
});
