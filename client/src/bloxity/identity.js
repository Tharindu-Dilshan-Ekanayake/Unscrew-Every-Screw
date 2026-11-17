import { getSDK, safeCall } from './sdk'

/**
 * Who this player is, for the game server: the single source of the player id, the
 * game slug and the Boxity token every join sends.
 */

/**
 * The game slug from the Boxity developer dashboard: `1-phone-drop`. The deploy
 * workflow passes it as VITE_GAME_SLUG; local builds fall back to it.
 */
export const GAME_SLUG = import.meta.env.VITE_GAME_SLUG || '1-phone-drop'

const GUEST_KEY = 'pp.guestId'
/** This browser's save tickets from the server, newest first. */
const TICKETS_KEY = 'pp.saveTickets'
const MAX_TICKETS = 5

const readLocal = (key) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode / storage blocked: nothing to remember with.
  }
}
const isTabGuest = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('tabguest')

/**
 * The server's save tickets this browser holds (server saveTickets.js): a guest's save
 * is under an id the server made, and its signed ticket is how the browser gets back
 * into it next time - and how its progress follows the player into an account when
 * they sign in. Sent with every join, newest first. `?tabguest` keeps the tab's own.
 */
function readTickets() {
  try {
    return isTabGuest() ? sessionStorage.getItem(TICKETS_KEY) : readLocal(TICKETS_KEY)
  } catch {
    return null
  }
}

export function saveTickets() {
  try {
    const list = JSON.parse(readTickets() || '[]')
    return Array.isArray(list) ? list.filter((t) => typeof t === 'string').slice(0, MAX_TICKETS) : []
  } catch {
    return []
  }
}

/** Keeps a ticket the server sent for the save we're playing (newest first). */
export function rememberSaveTicket(ticket) {
  if (typeof ticket !== 'string' || !ticket || ticket.length > 300) return
  const list = JSON.stringify([ticket, ...saveTickets().filter((t) => t !== ticket)].slice(0, MAX_TICKETS))
  if (!isTabGuest()) return writeLocal(TICKETS_KEY, list)
  try {
    sessionStorage.setItem(TICKETS_KEY, list)
  } catch {
    // Storage blocked: this tab is a new guest each time.
  }
}

/**
 * A stable per-browser id for players with no Boxity identity at all (the SDK never
 * loaded) - so every tab of one browser is the same guest, and a new tab takes over
 * from the last. `?tabguest` in the URL gives the tab a guest of its own instead (kept
 * across its reloads), for trying several players from one browser.
 */
function localGuestId() {
  try {
    const storage = new URLSearchParams(window.location.search).has('tabguest') ? sessionStorage : localStorage
    let id = storage.getItem(GUEST_KEY)
    if (!id) {
      id = `guest-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
      storage.setItem(GUEST_KEY, id)
    }
    return id
  } catch {
    return `guest-${Math.random().toString(36).slice(2)}`
  }
}

/**
 * Who is playing, as far as this page knows: the signed-in Boxity user's `_id`, else
 * the Boxity guest's `_id`, else this browser's own local guest id (`?tabguest`: the
 * tab's). A change of it (signing in or out) reconnects, and offline play saves under
 * it. The game server never takes it on trust: an account is whoever Boxity verifies
 * the token as, and a guest is whoever their save ticket says (saveTickets()).
 */
export function playerIdFor(user, guest) {
  if (user?._id) return String(user._id)
  if (!isTabGuest() && guest?._id) return String(guest._id)
  return localGuestId()
}

/**
 * The SDK's game token for the server to verify - only while someone is signed in, read
 * fresh each join (never a cached user). Null for guests and without the SDK: a guest is
 * who their save ticket says.
 */
export function joinToken() {
  const auth = getSDK()?.auth
  if (!safeCall(auth?.getUser?.bind(auth))) return null
  return safeCall(auth?.getToken?.bind(auth)) || null
}

/** Strips the 'legion_' prefix Boxity puts on some user ids (chat messages). */
export function bareUserId(id) {
  return typeof id === 'string' ? id.replace(/^legion_/, '') : ''
}
