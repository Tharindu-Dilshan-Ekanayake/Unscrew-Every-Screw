import { CHARGE_TIME, twangAt } from '@shared/balance'

/**
 * Your throw, before the authority hears about it. Hold DROP in the DROP ZONE and you wind
 * up (`gripping`): the meter charges from empty to full over CHARGE_TIME, and once full it
 * wobbles off the top (shared/balance.js twangAt). Let go and the throw is sent
 * (net/actions.roll) with the meter as it stood; the wind-up pose holds until the server's
 * answer starts the drop (roll/rollControl.beginRoll). Plain module state, written by the
 * DROP button and read every frame by the camera, the avatar and the meter - never React
 * state, never per-frame network traffic. (The function names are the template's.)
 */
export const launch = {
  /** Winding up the throw (holding DROP). */
  gripping: false,
  /** Charged and thrown by itself (Auto Drop). */
  auto: false,
  /** Set when you start: the player steps you up to the edge on its next frame. */
  snap: false,
  /** performance.now() the wind-up started. */
  startedAt: 0,
  /** The meter now (0-1), and whether it's full (wobbling). */
  charge: 0,
  full: false,
  /** performance.now() it filled up. */
  fullSince: 0,
  /** Let go and waiting for the authority: when. */
  released: false,
  releasedAt: 0,
}

/** No answer this long after letting go (out of the zone, busy): give the throw up. */
const RELEASE_TIMEOUT_MS = 1500

/** Starts winding up a throw (`auto`: Auto Drop, which lets go by itself). */
export function grab(auto = false, now = performance.now()) {
  launch.gripping = true
  launch.auto = auto
  launch.snap = true
  launch.released = false
  launch.startedAt = now
  launch.charge = 0
  launch.full = false
}

/** The meter at `now`. Called every frame while winding up. Returns the meter (0-1). */
export function updatePull(now) {
  if (launch.released && now - launch.releasedAt > RELEASE_TIMEOUT_MS) cancelPull()
  if (!launch.gripping) return launch.charge
  const t = (now - launch.startedAt) / 1000
  const full = t >= CHARGE_TIME
  if (full && !launch.full) launch.fullSince = now
  launch.full = full
  launch.charge = full ? twangAt((now - launch.fullSince) / 1000) : Math.min(1, t / CHARGE_TIME)
  return launch.charge
}

/** Lets go: returns the meter at that moment (what the throw is graded on). */
export function letGo(now = performance.now()) {
  updatePull(now)
  const charge = launch.charge
  launch.gripping = false
  launch.auto = false
  launch.released = true
  launch.releasedAt = now
  return charge
}

/** The authority's drop has started from the throw: it takes it from here. */
export function consumePull() {
  launch.gripping = false
  launch.auto = false
  launch.released = false
  launch.charge = 0
  launch.full = false
}

/** Gives the throw up (jumped, walked out of the zone, a panel opened, no answer came). */
export function cancelPull() {
  launch.gripping = false
  launch.auto = false
  launch.released = false
  launch.charge = 0
  launch.full = false
}

/** Whether you're throwing at all: winding up, or let go and waiting. */
export const isPulling = () => launch.gripping || launch.released
