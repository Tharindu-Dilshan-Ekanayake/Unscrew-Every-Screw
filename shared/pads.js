import { PARTY_START_MS, TEAM_DIFF } from './balance.js'
import { TEAM_PADS } from './world.js'

/**
 * The lobby's team pads, a section of them per chapter. Each seats 2 or 4 players:
 * whoever stands on one takes a seat, in the order they arrived (anyone stepping onto a
 * full pad just stands there). Its section decides what it plays - that chapter, on
 * TEAM_DIFF, always a new run - so there's nothing to pick: the moment every seat is
 * taken a short countdown starts, stepping off calls it off, and when it runs out
 * everyone on the pad starts the same run together (`onStart` -> session.startParty).
 *
 * A team carries players who haven't reached its chapter yet, but someone on the pad
 * must have: the first such player in line is the run's host, and with nobody who has,
 * a full pad waits (its view says `ready: false`).
 *
 * Driven by positions, never by what a client says it's standing on: the host of the
 * game (the Colyseus room; offline, the local server) calls `sync` at a steady rate with
 * who stands where. Transport-agnostic, like PartyManager. Players are keyed by whatever
 * the host uses.
 */
export class PadManager {
  /**
   * @param {{
   *   onStart: (party: object) => void,
   *   onChange?: () => void,
   *   canHost: (key: string, config: object) => boolean,
   *   pads?: Array<{ id: string, size: number, chapter: string }>,
   *   startMs?: number,
   * }} hooks `canHost` says whether a player may play a pad's run (has reached it).
   */
  constructor({ onStart, onChange, canHost, pads = TEAM_PADS, startMs = PARTY_START_MS }) {
    this.onStart = onStart
    this.onChange = onChange
    this.canHost = canHost
    this.startMs = startMs
    this.pads = new Map(
      pads.map((pad) => [pad.id, { pad, config: { chapter: pad.chapter, diff: TEAM_DIFF, action: 'start' }, members: [], names: {}, carrier: null, startsAt: null }]),
    )
  }

  /** The pad `key` has a seat on, or null. */
  padOf(key) {
    for (const slot of this.pads.values()) if (slot.members.includes(key)) return slot
    return null
  }

  /**
   * Who stands on a team pad right now: `standing` maps each such player's key to
   * `{ pad, name }` (players in a run, or anywhere else, are simply left out). Seats the
   * newcomers, lets go of anyone who stepped off, and starts or calls off the countdown.
   */
  sync(standing, now) {
    let changed = false
    for (const slot of this.pads.values()) {
      const before = slot.members.join('\n')
      slot.members = slot.members.filter((key) => standing.get(key)?.pad === slot.pad.id)
      for (const [key, info] of standing) {
        if (info.pad !== slot.pad.id || slot.members.includes(key) || slot.members.length >= slot.pad.size) continue
        slot.members.push(key)
        slot.names[key] = String(info.name || 'Player')
      }
      for (const key of Object.keys(slot.names)) if (!slot.members.includes(key)) delete slot.names[key]

      const moved = slot.members.join('\n') !== before
      const carrierBefore = slot.carrier
      slot.carrier = slot.members.find((key) => this.canHost(key, slot.config)) ?? null
      const startsBefore = slot.startsAt
      const ready = slot.carrier !== null && slot.members.length === slot.pad.size
      // Someone new in a seat gets the whole countdown too.
      if (!ready) slot.startsAt = null
      else if (slot.startsAt === null || moved) slot.startsAt = now + this.startMs
      if (moved || slot.carrier !== carrierBefore || slot.startsAt !== startsBefore) changed = true
    }
    if (changed) this.onChange?.()
  }

  /** Starts every full pad whose countdown has run out. Call at a steady rate. */
  tick(now) {
    let changed = false
    for (const slot of this.pads.values()) {
      if (slot.startsAt === null || now < slot.startsAt) continue
      const ready = slot.carrier !== null && slot.members.length === slot.pad.size
      const party = ready ? { id: `pad:${slot.pad.id}`, pad: slot.pad.id, host: slot.carrier, members: [...slot.members], size: slot.pad.size, ...slot.config } : null
      // The pad is free again (its players are in their run by the next sync).
      slot.members = []
      slot.names = {}
      slot.carrier = null
      slot.startsAt = null
      changed = true
      if (party) this.onStart(party)
    }
    if (changed) this.onChange?.()
  }

  /**
   * What client `key` is shown: every team pad with who's on it, what it plays, your seat
   * on it (-1: none), whether someone on it has reached its chapter (`ready`) and
   * `startsIn` ms (null: not counting down).
   */
  view(key, now) {
    return [...this.pads.values()].map((slot) => ({
      id: slot.pad.id,
      size: slot.pad.size,
      chapter: slot.config.chapter,
      diff: slot.config.diff,
      names: slot.members.map((m) => slot.names[m]),
      seat: slot.members.indexOf(key),
      ready: slot.carrier !== null,
      startsIn: slot.startsAt === null ? null : Math.max(0, slot.startsAt - now),
    }))
  }
}

/** Who of `players` stands on a team pad: `[key, { pad, name }]` for each, for `sync`. */
export function standingOn(padAt, players) {
  const standing = new Map()
  for (const { key, x, z, name } of players) {
    const pad = padAt(x, z)
    if (pad && pad !== 'solo') standing.set(key, { pad, name })
  }
  return standing
}
