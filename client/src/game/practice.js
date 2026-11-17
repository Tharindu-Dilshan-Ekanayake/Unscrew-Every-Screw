import { Vector3 } from 'three'

import { clampToWalkable, groundHeightAt, PAD_X, PAD_YAW, padCenterZ } from '@shared/world'

/**
 * Throwing your phone for Skill (toss.js starts a throw; the Skill comes from the
 * authority): on a throw pad down its lane at the target, anywhere else a few metres
 * ahead. Shared by the pads' scenery (structures.js), the throwers (Player,
 * RemoteAvatars) and the phones in flight (PracticeThrows.jsx).
 */

/** The target's middle down each pad's lane (x), and the height of its top. */
export const THROW_TARGET_X = PAD_X + 7.6
export const THROW_TARGET_TOP = 0.15
/** Where pad `index`'s target is. */
export const throwTargetZ = (index) => padCenterZ(index)

/** Seconds one throw takes, reaching back to straightening up again. */
export const TOSS_TIME = 0.45
/** How far through a throw (0-1) the phone leaves the hand. */
export const THROW_RELEASE = 0.6
/** How far ahead a throw off the pads lands (m). */
export const TOSS_REACH = 7
/** Seconds a practice phone flies, lies on the target, and shrinks away. */
export const THROW_FLIGHT = 0.5
export const THROW_LIE = 0.5
export const THROW_FADE = 0.15

/** The phones in flight: a fixed pool, the oldest reused once it's full. */
export const MAX_THROWS = 10
export const throws = Array.from({ length: MAX_THROWS }, () => ({
  active: false,
  start: 0,
  from: new Vector3(),
  to: new Vector3(),
  phoneId: 'bicycle',
  /** Which way it tumbles and how much it turns, so no two throws look the same. */
  spin: 1,
  turn: 0,
  /** Whether its landing has been heard yet. */
  landed: false,
}))
let next = 0

/**
 * Throws phone `phoneId` from (x, y, z) - the thrower's hand - to land at (toX, toY, toZ).
 * Allocation-free: safe to call from a frame loop.
 */
export function spawnThrow(x, y, z, toX, toZ, phoneId, toY = THROW_TARGET_TOP) {
  const t = throws[next]
  next = (next + 1) % MAX_THROWS
  t.active = true
  t.start = performance.now()
  t.from.set(x, y, z)
  // Not dead centre every time: a little scatter round the bullseye.
  t.to.set(toX + (Math.random() - 0.5) * 0.9, toY, toZ + (Math.random() - 0.5) * 0.9)
  t.phoneId = phoneId
  t.spin = Math.random() < 0.5 ? 1 : -1
  t.turn = (Math.random() - 0.5) * 1.6
  t.landed = false
}

/**
 * Where the phone leaves a thrower's right hand, standing at `pos` facing `yaw` (down a
 * pad's lane by default): up over the shoulder and a little forward.
 */
export function releasePoint(pos, out, yaw = PAD_YAW) {
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  return out.set(pos.x + fx * 0.55 - fz * 0.35, pos.y + 2.25, pos.z + fz * 0.55 + fx * 0.35)
}

const _land = { x: 0, z: 0 }

/**
 * Where a throw lands: on throw pad `pad`, its target down the lane; anywhere else
 * (`pad` -1) TOSS_REACH ahead along `yaw`, on the ground (kept on the plaza).
 */
export function tossTarget(pos, yaw, pad, out) {
  if (pad >= 0) return out.set(THROW_TARGET_X, THROW_TARGET_TOP, throwTargetZ(pad))
  clampToWalkable(pos.x + Math.sin(yaw) * TOSS_REACH, pos.z + Math.cos(yaw) * TOSS_REACH, _land)
  return out.set(_land.x, groundHeightAt(_land.x, _land.z) + 0.02, _land.z)
}
