/* Command-line options for the local viewer server.
 *
 * This is the internal server entry point used by `desk open`. Long options
 * are kebab-case, values may be written as `--name value` or `--name=value`,
 * and boolean options never take a value.
 */

export function usage() {
  console.log(`desk page — live Markdown viewer

  node src/serve.mjs [options]

  --root <dir>    .desk workspace root (default: walk up from cwd)
  --docs <dir>    serve a folder as a Markdown library
  --hash <route>  initial hash route, e.g. "#/features/demo/2"
  --port <n>      port to listen on (default: 7777, falls forward)
  --host <addr>   bind address (default: 127.0.0.1)
  --open          open the page in the default browser
  --check         scan once, print a report, exit 1 on errors
  --quiet         suppress the startup report
  -h, --help      show this help`);
}

const VALUE_OPTIONS = new Set(["root", "docs", "hash", "port", "host"]);
const BOOLEAN_OPTIONS = new Set(["open", "check", "quiet"]);

function fail(message) {
  console.error(`desk page: ${message}`);
  usage();
  process.exit(2);
}

export function parseArgs(argv) {
  const opts = {
    root: null, docs: null, hash: "", port: 7777, host: "127.0.0.1",
    open: false, check: false, quiet: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }
    if (!arg.startsWith("--")) fail(`unexpected argument "${arg}"`);

    const eq = arg.indexOf("=");
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    if (!name) fail('missing option name after "--"');

    if (VALUE_OPTIONS.has(name)) {
      const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
      if (value == null || value === "") fail(`--${name} requires a value`);
      if (name === "port") {
        const port = Number(value);
        if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`invalid port "${value}"`);
        opts.port = port;
      } else {
        opts[name] = value;
      }
    } else if (BOOLEAN_OPTIONS.has(name)) {
      if (eq !== -1) fail(`--${name} does not take a value`);
      opts[name] = true;
    } else {
      fail(`unknown option "--${name}"`);
    }
  }
  return opts;
}
