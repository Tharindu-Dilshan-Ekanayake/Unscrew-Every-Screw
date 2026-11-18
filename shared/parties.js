import { CHAPTERS, DIFFICULTIES, MAX_PARTY, PARTY_START_MS, PARTY_WAIT_MS } from './balance.js'

let nextParty = 1

/**
 * Parties forming in a lobby: a host picks a chapter, a difficulty and a size (1-4) and
 * friends join until it's full - or the wait runs out, or the host says go - and then
 * they all start the same run together (session.startParty).
 *
 * Players are keyed by whatever the host uses (a Colyseus session id; offline, 'local').
 * Transport-agnostic, like the sessions: `onStart(party)` starts the run, `onChange()`
 * lets the host tell clients (see `view`).
 */
export class PartyManager {
  /**
   * @param {{ onStart: (party: object) => void, onChange?: () => void, maxSize?: number }} hooks
   *   `maxSize` caps parties (offline play: 1).
   */
  constructor({ onStart, onChange, maxSize = MAX_PARTY }) {
    this.parties = new Map()
    this.onStart = onStart
    this.onChange = onChange
    this.maxSize = maxSize
  }

  /** The party `key` is in, or null. */
  partyOf(key) {
    for (const party of this.parties.values()) if (party.members.includes(key)) return party
    return null
  }

  /**
   * `key` (shown as `name`) starts a party. `action` 'start' (a new run of
   * `chapter`/`diff`) or 'load' (the host's saved run, whose chapter and difficulty the
   * caller fills in). The caller has checked the host may.
   */
  create(key, name, { chapter, diff, size, action }, now) {
    if (this.partyOf(key)) return null
    if (!CHAPTERS.some((c) => c.id === chapter) || !DIFFICULTIES[diff]) return null
    const seats = Math.min(this.maxSize, Math.max(1, Math.floor(Number(size) || 1)))
    const party = {
      id: `p${nextParty++}`,
      host: key,
      names: { [key]: name },
      chapter,
      diff,
      size: seats,
      action: action === 'load' ? 'load' : 'start',
      members: [key],
      // Alone, it goes straight to the countdown; with seats to fill, it waits for friends.
      startsAt: now + (seats === 1 ? PARTY_START_MS : PARTY_WAIT_MS),
    }
    this.parties.set(party.id, party)
    this.onChange?.()
    return party
  }

  /** `key` (shown as `name`) joins party `id`, if there's a seat. */
  join(key, name, id, now) {
    const party = this.parties.get(String(id))
    if (!party || this.partyOf(key) || party.members.length >= party.size) return null
    party.members.push(key)
    party.names[key] = name
    if (party.members.length >= party.size) party.startsAt = Math.min(party.startsAt, now + PARTY_START_MS)
    this.onChange?.()
    return party
  }

  /** `key` leaves their party; the host leaving calls it off for everyone. */
  leave(key) {
    const party = this.partyOf(key)
    if (!party) return
    if (party.host === key) this.parties.delete(party.id)
    else {
      party.members = party.members.filter((m) => m !== key)
      delete party.names[key]
    }
    this.onChange?.()
  }

  /** The host says go: the countdown starts now. */
  go(key, now) {
    const party = this.partyOf(key)
    if (!party || party.host !== key) return
    party.startsAt = Math.min(party.startsAt, now + PARTY_START_MS)
    this.onChange?.()
  }

  /** Starts every party whose time has come. Call at a steady rate. */
  tick(now) {
    let changed = false
    for (const party of [...this.parties.values()]) {
      if (now < party.startsAt) continue
      this.parties.delete(party.id)
      changed = true
      this.onStart(party)
    }
    if (changed) this.onChange?.()
  }

  /**
   * What client `key` is shown: the open parties it could join and its own party (with
   * `startsIn` ms, so clocks needn't agree).
   */
  view(key, now) {
    const show = (p) => ({
      id: p.id,
      host: p.names[p.host],
      hostIsYou: p.host === key,
      chapter: p.chapter,
      diff: p.diff,
      size: p.size,
      action: p.action,
      names: p.members.map((m) => p.names[m]),
      startsIn: Math.max(0, p.startsAt - now),
    })
    const mine = this.partyOf(key)
    const open = [...this.parties.values()].filter((p) => p !== mine && p.members.length < p.size).map(show)
    return { open, mine: mine ? show(mine) : null }
  }
}
