/* Command-line options for the local viewer server. */

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
  --help`);
}

export function parseArgs(argv) {
  const opts = { root: null, docs: null, hash: "", port: 7777, host: "127.0.0.1", open: false, check: false, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") opts.root = argv[++i];
    else if (a === "--docs") opts.docs = argv[++i];
    else if (a === "--hash") opts.hash = argv[++i];
    else if (a === "--port") opts.port = Number(argv[++i]);
    else if (a === "--host") opts.host = argv[++i];
    else if (a === "--open") opts.open = true;
    else if (a === "--check") opts.check = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--help" || a === "-h") { usage(); process.exit(0); }
    else { console.error(`unknown option: ${a}`); usage(); process.exit(2); }
  }
  return opts;
}
