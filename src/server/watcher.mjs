/* Watch the workspace and signal the page on every real content change. */
import fs from "node:fs";

export function watchWorkspace(workspace, onChange) {
  try {
    return fs.watch(workspace, { recursive: true }, (_event, file) => {
      if (!file) return onChange();
      const name = String(file);
      if (name.startsWith(".git") || name.includes("node_modules") || name.endsWith("~") || name.endsWith(".swp")) return;
      onChange();
    });
  } catch (err) {
    console.error(`leaf page: live reload unavailable (${err.message}); the page still reads on demand.`);
    return null;
  }
}
