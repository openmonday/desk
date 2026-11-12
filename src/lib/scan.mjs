/* desk scanner public API.
 *
 * The implementation lives in focused modules; this facade keeps the original
 * `lib/scan.mjs` imports working for the CLI and server. */
export { proseOnly, headings, firstH1, titleCase } from "./markdown.mjs";
export {
  CONTEXT_DIR, REFERENCE_DIR, findWorkspace, isContextDir, isReferencePath,
  readIfExists, listDir, listSubdirs, resolveDoc, readDoc,
} from "./workspace.mjs";
export { parseTask, detectCycles } from "./tasks/parse.mjs";
export { parseRecord, splitFrontMatter } from "./records/parse.mjs";
export { scanWorkspace, scanIssues } from "./issues/scan.mjs";
