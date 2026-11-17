import { Color, Vector3 } from 'three'

import { getQuality } from '../../store/quality'

/**
 * The debris pool (Debris.jsx draws it): a fixed set of pieces, each a point with a
 * velocity, a spin and one floor to bounce on. Module state, mutated by spawnDebris and
 * by the frame loop; nothing allocated after start-up.
 */
export const POOL = 140
export const GRAVITY = 34
const LIFE = 2.2

export const pieces = Array.from({ length: POOL }, () => ({
  life: 0,
  max: LIFE,
  pos: new Vector3(),
  vel: new Vector3(),
  rot: new Vector3(),
  spin: new Vector3(),
  size: new Vector3(1, 1, 1),
  floor: 0,
  color: new Color(),
}))
let next = 0
/** Set when pieces were spawned: their colours are uploaded next frame. */
export const poolState = { colorsDirty: false }

/**
 * Throws out `count` pieces from (x, y, z), each coloured from `colors` (hex strings),
 * flying outwards at up to `speed` and upwards at up to `up`, sized about `size`, and
 * bouncing on `floor` (a height). `flat` makes thin shards (glass, tiles).
 */
export function spawnDebris({ x, y, z, count = 12, colors = ['#ffffff'], speed = 10, up = 8, size = 0.6, floor = y - 20, flat = false, spread = 1.5 }) {
  if (!getQuality().particles) return
  for (let n = 0; n < count; n += 1) {
    const p = pieces[next]
    next = (next + 1) % POOL
    const a = Math.random() * Math.PI * 2
    const r = Math.random()
    p.pos.set(x + Math.cos(a) * r * spread, y + (Math.random() - 0.3) * 0.6, z + Math.sin(a) * r * spread)
    const out = speed * (0.35 + Math.random() * 0.65)
    p.vel.set(Math.cos(a) * out, up * (0.3 + Math.random() * 0.9), Math.sin(a) * out)
    p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)
    p.spin.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16)
    const k = size * (0.5 + Math.random() * 0.8)
    if (flat) p.size.set(k * 1.4, 0.06, k)
    else p.size.set(k, k * (0.5 + Math.random() * 0.6), k * (0.6 + Math.random() * 0.5))
    p.floor = floor
    p.max = LIFE * (0.7 + Math.random() * 0.5)
    p.life = p.max
    p.color.set(colors[n % colors.length])
  }
  poolState.colorsDirty = true
}

/** Clears every piece (a new drop starts clean). */
export function clearDebris() {
  for (const p of pieces) p.life = 0
}

