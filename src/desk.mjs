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

const HERE = path.dirname(fileURLToPath(import.meta.url));

const HELP = `Usage:
  desk [path] [options]

Open a Markdown file or folder in the live page. A path inside .desk, or a
folder that contains .desk, opens the workspace view. Anything else opens as a
Markdown library. With a file, the browser opens that document.

Options:
  --port <n>     Port to listen on (default 7777, falls forward)
  --host <addr>  Bind address (default 127.0.0.1)
  --open         Open the browser (default when path is a file)
  --no-open      Keep the browser closed
  --quiet        Suppress the startup report
  -h, --help     Show this help`;

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
  if (pos.length > 1) throw new Error(`expected one path, got ${pos.length}`);
  return { flags, target: pos[0] };
}

async function main() {
  const { flags, target } = parse(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(`${HELP}\n`);
    return;
  }

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
