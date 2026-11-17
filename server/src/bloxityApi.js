import { randomUUID } from 'node:crypto'

import { apiUrl, bloxity } from './bloxityEnv.js'
import { saveIdsFromTickets } from './saveTickets.js'

/**
 * The Boxity platform calls the server makes on a player's behalf: who a joining
 * player really is, and whether a rewarded ad was really watched. Both go to the API
 * from bloxityEnv.js with a short timeout, so a slow platform can delay a join or a
 * reward by a few seconds at most, never hang it.
 *
 * `fetchImpl` and `settings` are parameters so tests can stand in for the network.
 */

const TIMEOUT_MS = 5000
/** Ids are database keys and travel in every save; keep them short. */
const MAX_ID = 80

/**
 * POSTs JSON and returns `{ status, body }` (body null if it isn't JSON). Throws only
 * for a network failure or timeout, so callers can tell "Boxity said no" from "Boxity
 * didn't answer".
 */
export async function postJson(url, payload, { headers = {}, fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = {}) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

/** A new guest's id, made here: never one a client names. */
export const newGuestId = () => `guest-${randomUUID()}`

let warnedNoApi = false

/**
 * Who a joining player is, from their join options `{ token, tickets, name }`.
 * Resolves `{ playerId, verified, name?, carriedFrom, ticketed }`.
 *
 * - With a token (a signed-in Boxity player) that Boxity verifies, the account id in
 *   Boxity's answer is the save key - and nothing else is, ever: any userId/playerId in
 *   the join options is ignored, and the token is never decoded here.
 * - Everyone else is a guest, under an id this server made: the one in the newest
 *   genuine save ticket the browser shows (saveTickets.js: signed by this server when it
 *   made that guest), else a brand-new one. So a guest keeps their save for as long as
 *   their browser keeps its tickets, whatever the SDK's own guest identity does.
 *   That covers no token, a token Boxity refuses (expired: the player keeps playing,
 *   as a guest), and Boxity being unreachable (an outage never locks anyone out).
 *
 * `ticketed` lists every save the browser proved it played (newest first), for carrying
 * progress into an id with no save yet (GameRoom.onJoin). Only `verified` players count
 * for Boxity leaderboards and receive Gems purchases.
 */
export async function resolveIdentity(options, { fetchImpl = fetch, settings = bloxity, makeGuestId = newGuestId } = {}) {
  const token = typeof options?.token === 'string' && options.token ? options.token : null
  const ticketed = saveIdsFromTickets(options?.tickets)
  const guest = () => ({ playerId: ticketed[0] || makeGuestId(), verified: false, carriedFrom: [], ticketed })

  if (!token) return guest()
  const url = apiUrl('/v1/auth/game-token/verify', settings)
  if (!url) {
    if (!warnedNoApi) console.warn('[auth] no BLOXITY_API_URL: signed-in players join as guests')
    warnedNoApi = true
    return guest()
  }

  let answer
  try {
    answer = await postJson(url, { gameSlug: settings.gameSlug }, { headers: { Authorization: `Bearer ${token}` }, fetchImpl })
  } catch (err) {
    console.warn('[auth] Boxity unreachable, joining as a guest:', err?.message || err)
    return guest()
  }
  // A platform error isn't a verdict on the player.
  if (answer.status >= 500) {
    console.warn(`[auth] Boxity answered ${answer.status}, joining as a guest`)
    return guest()
  }
  const { valid, user, carriedFrom } = answer.body || {}
  if (!valid || !user?._id) return guest()
  return {
    playerId: String(user._id).slice(0, MAX_ID),
    verified: true,
    // The account's own name beats what the client says it is.
    name: user.displayName || user.username || undefined,
    carriedFrom: Array.isArray(carriedFrom) ? carriedFrom.map(String).filter(Boolean).slice(0, 10) : [],
    ticketed,
  }
}

/**
 * Whether Boxity confirms `rewardToken` as a rewarded ad watched to the end. Any
 * failure counts as no: an unconfirmed ad never pays.
 */
export async function verifyAdReward(rewardToken, { fetchImpl = fetch, settings = bloxity } = {}) {
  const url = apiUrl('/v1/ads/reward/verify', settings)
  if (!url) return false
  try {
    const { body } = await postJson(
      url,
      { gameSlug: settings.gameSlug, rewardToken },
      { fetchImpl },
    )
    return body?.valid === true
  } catch (err) {
    console.warn('[ads] reward verify failed', err?.message || err)
    return false
  }
}
