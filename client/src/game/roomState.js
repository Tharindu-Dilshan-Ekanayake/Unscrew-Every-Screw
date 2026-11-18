import { clearBit, decodeBits, getBit, setBit } from '@shared/bits'
import { getLayout, screwKinds } from '@shared/layout'
import { chapterIndex, luckOf } from '@shared/logic'

/**
 * The client's copy of the current room's screws: which are out (predicted - a screw
 * comes out the moment you finish turning it, before the server agrees) and what kind
 * each is. Mutable and outside React: the screw renderer reads it every frame.
 *
 * The authority answers every batch ('unscrewed'): screws it refused go back in
 * (`restored`, drained by the renderer). A whole new room (or a resync) bumps `version`,
 * and the renderer rebuilds every screw from scratch.
 */
export const roomState = {
  /** Which room of which run this is: `${chapter}:${room}:${seed}` ('' = none). */
  key: '',
  layout: null,
  kinds: null,
  bits: null,
  /** Unconfirmed screws we've taken: id -> 1 (non-crystal ones use bag space). */
  pending: new Map(),
  /** Of those, how many need bag space. */
  pendingBag: 0,
  /** Bumped when every screw must be redrawn. */
  version: 0,
  /** Screws the server put back, waiting for the renderer. */
  restored: [],
  /** How many screws are out (predicted). */
  removedCount: 0,
}

/** The room key for a profile's run, or '' outside one. */
export const roomKeyOf = (profile) => {
  const run = profile.run
  return run?.active ? `${run.runId || ''}:${run.chapter}:${run.room}:${run.seed}` : ''
}

/**
 * Brings the room in step with the profile: a different room (or `force`) rebuilds it
 * from the saved bits. Same room: nothing (our predictions stay).
 */
export function syncRoom(profile, force = false) {
  const key = roomKeyOf(profile)
  if (!force && key === roomState.key) return false
  roomState.key = key
  roomState.pending.clear()
  roomState.pendingBag = 0
  roomState.restored.length = 0
  if (!key) {
    roomState.layout = null
    roomState.kinds = null
    roomState.bits = null
    roomState.removedCount = 0
  } else {
    const run = profile.run
    const layout = getLayout(chapterIndex(run.chapter), run.room)
    roomState.layout = layout
    // The run's luck (its host's, for a party), so everyone sees the same gold and crystals.
    roomState.kinds = screwKinds(layout, run.seed, run.luck || luckOf(profile))
    roomState.bits = decodeBits(run.removed, layout.count)
    let removed = 0
    for (let i = 0; i < layout.count; i += 1) removed += getBit(roomState.bits, i)
    roomState.removedCount = removed
  }
  roomState.version += 1
  return true
}

export const isOut = (i) => Boolean(roomState.bits) && getBit(roomState.bits, i) === 1

/** We took screw `i` (predicted): out of the room, awaiting the server. */
export function takeScrew(i, needsBag) {
  setBit(roomState.bits, i)
  roomState.removedCount += 1
  roomState.pending.set(i, needsBag ? 1 : 0)
  if (needsBag) roomState.pendingBag += 1
}

/**
 * Screws a teammate took: out of the room for us too (holes, no fly-to-bag - they went
 * in someone else's). Any we'd also taken (and sent) settle here.
 * @returns {number[]} the ones that were still in for us
 */
export function teammateTook(ids) {
  const fresh = []
  if (!roomState.bits) return fresh
  for (const i of ids) {
    const bag = roomState.pending.get(i)
    if (bag !== undefined) {
      roomState.pending.delete(i)
      if (bag) roomState.pendingBag -= 1
      continue
    }
    if (getBit(roomState.bits, i)) continue
    setBit(roomState.bits, i)
    roomState.removedCount += 1
    fresh.push(i)
  }
  return fresh
}

/** The server's answer for screws we sent: confirmed ones settle, refused ones go back. */
export function settleScrews(ok, bad, taken = []) {
  // A teammate got there first: it's out, just not in our bag.
  for (const i of taken) {
    const bag = roomState.pending.get(i)
    if (bag === undefined) continue
    roomState.pending.delete(i)
    if (bag) roomState.pendingBag -= 1
  }
  for (const i of ok) {
    const bag = roomState.pending.get(i)
    if (bag === undefined) continue
    roomState.pending.delete(i)
    if (bag) roomState.pendingBag -= 1
  }
  for (const i of bad) {
    const bag = roomState.pending.get(i)
    if (bag === undefined) continue
    roomState.pending.delete(i)
    if (bag) roomState.pendingBag -= 1
    if (roomState.bits && getBit(roomState.bits, i)) {
      clearBit(roomState.bits, i)
      roomState.removedCount -= 1
      roomState.restored.push(i)
    }
  }
}
