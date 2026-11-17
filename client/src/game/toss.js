import { actions } from '../net/actions'
import { getGame } from '../store/game'
import { isPulling } from './launch'
import { TOSS_TIME } from './practice'
import { runtime } from './runtime'

/**
 * Your throws, the only way to earn Skill: a click or tap on the game, THROW (on touch
 * screens) or F throws your phone - on a throw pad down its lane at the target, anywhere
 * else a few metres ahead - and the server pays the Skill for it (session.toss). Standing
 * on a throw pad throws by itself as well (Player.jsx). Player.jsx plays each throw; `seq`
 * alternates the anim other players see ('toss0'/'toss1'), so every throw shows as new.
 *
 * Pressing again mid-throw lines up one more straight after it, so quick clicking throws
 * as fast as the arm can go - one throw per click, never more.
 */
export const toss = {
  /** performance.now() the current (or last) throw started. */
  at: -Infinity,
  /** Another throw waiting for this one to finish. */
  queued: false,
  /** Throws so far. */
  seq: 0,
}

/** Whether a throw can go now: on your feet in the lobby, not at the drop zone, mid-drop or in a panel. */
export function canToss() {
  const game = getGame()
  return !runtime.player.frozen && !isPulling() && !game.zone.rollZone && !game.roll && !game.rollResult && !game.panel
}

/** A click, a tap or THROW: throws now, or straight after the throw already going. */
export function requestToss(now = performance.now()) {
  if (!canToss()) return false
  const t = (now - toss.at) / 1000
  if (t < TOSS_TIME) {
    // Late in a throw: the next follows on. (A double tap right at its start doesn't count twice.)
    if (t > TOSS_TIME * 0.3) toss.queued = true
    return true
  }
  startToss(now)
  return true
}

/** Starts a throw: the server hears straight away (it pays the Skill) and your avatar throws. */
export function startToss(now) {
  toss.at = now
  toss.queued = false
  toss.seq += 1
  actions.toss()
}
