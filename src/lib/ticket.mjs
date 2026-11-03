/* desk ticket writer public API.
 *
 * The implementation lives in focused modules; this facade keeps the original
 * `lib/ticket.mjs` imports working for the CLI and server. */
export {
  badRequest, notFound, conflict, canonicalStatus, normalizeN, slugify, normalizeBlockedBy,
} from "./tickets/schema.mjs";
export {
  createTicket, updateTicket, completeTicket, removeTicket, listTickets,
} from "./tickets/operations.mjs";
