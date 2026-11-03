/* desk scanner public API.
 *
 * The implementation lives in focused modules; this facade keeps the original
 * `lib/scan.mjs` imports working for the CLI and server. */
export { proseOnly, headings, firstH1, titleCase } from "./markdown.mjs";
export {
  findWorkspace, readIfExists, listDir, listSubdirs, resolveDoc, readDoc,
} from "./workspace.mjs";
export { parseTicket, detectCycles } from "./tickets/parse.mjs";
export { scanWorkspace } from "./tickets/scan.mjs";
