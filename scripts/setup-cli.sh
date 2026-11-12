#!/usr/bin/env bash
set -euo pipefail

# Resolve the checkout from this script, regardless of the caller's directory.
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

# Colors only when writing to a terminal and NO_COLOR is unset.
if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'
  GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; BLUE=''; RESET=''
fi

step() { printf '\n%s==>%s %s%s%s\n' "$BLUE" "$RESET" "$BOLD" "$1" "$RESET"; }
ok()   { printf '  %s✔%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
info() { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
die()  { printf '%s✖ Error:%s %s\n' "$RED" "$RESET" "$1" >&2; exit 1; }

command -v npm >/dev/null 2>&1 || die "npm is required. Install Node.js and try again."

PKG_NAME="$(node -p "require('$PROJECT_DIR/package.json').name" 2>/dev/null || echo leaf)"
GLOBAL_PREFIX="$(npm prefix --global)"
CLI_PATH="$GLOBAL_PREFIX/bin/$PKG_NAME"

step "Cleaning up stale links"
removed=0
for link in "$GLOBAL_PREFIX/lib/node_modules/$PKG_NAME" "$CLI_PATH"; do
  # Remove only symlinks whose target no longer exists (e.g. after moving the project).
  if [[ -L "$link" && ! -e "$link" ]]; then
    warn "Removing broken link: $link"
    info "-> $(readlink "$link")"
    rm -- "$link"
    removed=$((removed + 1))
  fi
done
if (( removed == 0 )); then ok "No stale links found"; else ok "Removed $removed stale link(s)"; fi

step "Linking $PKG_NAME"
info "Project: $PROJECT_DIR"
cd "$PROJECT_DIR"
npm link --no-audit --no-fund >/dev/null
ok "Linked $CLI_PATH"

step "Verifying"
"$CLI_PATH" --help >/dev/null
ok "$PKG_NAME runs correctly"

printf '\n%s%sDone.%s\n' "$GREEN" "$BOLD" "$RESET"
case ":$PATH:" in
  *":$GLOBAL_PREFIX/bin:"*) ;;
  *) warn "Add $GLOBAL_PREFIX/bin to your shell PATH to run $PKG_NAME globally." ;;
esac
