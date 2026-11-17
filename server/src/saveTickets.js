import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Save tickets: proof that this browser really played a guest save.
 *
 * A guest's save is keyed by the id they join with, and that id can change under them:
 * the Boxity SDK can hand the browser a fresh guest identity, or fail to load one day so
 * the game falls back to its own local id. With nothing else, the player would land in a
 * brand-new save and their progress would look wiped.
 *
 * So every guest session is sent a ticket for its save: the save id, signed with a
 * secret only the server knows (kept in the database, the same for every pod and every
 * deploy). The browser keeps its last few tickets and shows them on every join. When the
 * id it joins with has no save yet, the newest ticket whose save exists is carried over
 * into it, once (db.js carryOverGuest marks the old save used).
 *
 * A ticket can't be made up or edited without the secret, so no one can claim another
 * player's save by naming its id: only saves this browser itself played are carried.
 * Tickets are only issued for guest saves, never for a signed-in account's.
 */

const MAX_TICKET = 300
/** Tickets a join may present; the browser keeps no more than this either. */
export const MAX_TICKETS = 5

let secret = null

/** Set once by db.js from the database, before any room opens. */
export function setSaveTicketSecret(value) {
  secret = typeof value === 'string' && value.length >= 32 ? value : null
}

const sign = (id) => createHmac('sha256', secret).update(`save:${id}`).digest('base64url')

/** The ticket for guest save `id`, or null when no secret is set. */
export function issueSaveTicket(id) {
  if (!secret || !id) return null
  return `${Buffer.from(String(id)).toString('base64url')}.${sign(String(id))}`
}

/** The save id a genuine ticket stands for, else null. */
export function readSaveTicket(ticket) {
  if (!secret || typeof ticket !== 'string' || ticket.length > MAX_TICKET) return null
  const dot = ticket.indexOf('.')
  if (dot <= 0) return null
  let id
  try {
    id = Buffer.from(ticket.slice(0, dot), 'base64url').toString()
  } catch {
    return null
  }
  // Tickets are only ever made for guests' ids.
  if (!id.startsWith('guest-')) return null
  const given = Buffer.from(ticket.slice(dot + 1))
  const expected = Buffer.from(sign(id))
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null
}

/** The save ids of the genuine tickets in `tickets` (join options), newest first. */
export function saveIdsFromTickets(tickets) {
  if (!Array.isArray(tickets)) return []
  const ids = []
  for (const t of tickets.slice(0, MAX_TICKETS)) {
    const id = readSaveTicket(t)
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}
