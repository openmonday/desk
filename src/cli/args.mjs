/* Command-line grammar for the desk CLI.
 *
 * Grammar: `desk <command> [arguments] [options]`. `open` is the default
 * command, so `desk path` and `desk open path` mean the same thing. The first
 * positional token is a command only when it is not escaped by `--`; this is
 * how a path literally named `list` or `kill` stays reachable.
 */

const VALUE_OPTIONS = new Set(["port", "host"]);

const BOOLEAN_OPTIONS = new Map([
  ["open", ["open", true]],
  ["no-open", ["open", false]],
  ["quiet", ["quiet", true]],
  ["json", ["json", true]],
  ["all", ["all", true]],
  ["force", ["force", true]],
  ["help", ["help", true]],
]);

export const COMMANDS = new Set(["open", "list", "kill", "config", "help"]);

const ALLOWED_OPTIONS = {
  open: new Set(["port", "host", "open", "quiet", "help"]),
  list: new Set(["json", "help"]),
  kill: new Set(["all", "force", "help"]),
  config: new Set(["help"]),
  help: new Set(["help"]),
};

const OPTION_LABELS = {
  open: "--open or --no-open",
  quiet: "--quiet",
  json: "--json",
  all: "--all",
  force: "--force",
  help: "--help",
  port: "--port",
  host: "--host",
};

/** Parse options and positionals. `--` makes every later token a positional. */
export function parseArgv(argv) {
  const options = {};
  const positionals = [];
  let literal = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (!literal && arg === "--") {
      literal = true;
      continue;
    }
    if (!literal && arg === "-h") {
      options.help = true;
      continue;
    }
    if (!literal && arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = arg.slice(2, eq === -1 ? undefined : eq);
      if (!name) throw new Error('missing option name after "--"');

      if (VALUE_OPTIONS.has(name)) {
        const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
        if (value == null || value === "") throw new Error(`--${name} requires a value`);
        options[name] = value;
      } else if (BOOLEAN_OPTIONS.has(name)) {
        if (eq !== -1) throw new Error(`--${name} does not take a value`);
        const [key, value] = BOOLEAN_OPTIONS.get(name);
        options[key] = value;
      } else {
        throw new Error(`unknown option "--${name}"`);
      }
      continue;
    }
    if (!literal && arg.startsWith("-") && arg !== "-") {
      throw new Error(`unknown option "${arg}"`);
    }

    positionals.push({ value: arg, literal });
  }

  return { options, positionals };
}

/** Split positionals into a command and its arguments. */
export function routeArgv(positionals) {
  const first = positionals[0];
  const explicit = Boolean(first && !first.literal && COMMANDS.has(first.value));
  const command = explicit ? first.value : "open";
  const args = explicit ? positionals.slice(1) : positionals;
  return { command, args: args.map((item) => item.value), explicit };
}

export function validateOptions(command, options) {
  const allowed = ALLOWED_OPTIONS[command];
  for (const key of Object.keys(options)) {
    if (!allowed.has(key)) {
      const label = OPTION_LABELS[key] || `--${key}`;
      throw new Error(`${label} is not valid for "desk ${command}"`);
    }
  }
}
