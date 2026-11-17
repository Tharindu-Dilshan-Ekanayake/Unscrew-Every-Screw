import { PropBuilder } from './blocks'
import { addPhone } from './phoneStyles'

/** How big a phone is in someone's hand: a chunky toy phone. */
export const HAND_PHONE_SCALE = 0.42

const cache = new Map()

/**
 * The merged geometry of phone `id` at hand size, held upright in the palm with its
 * screen facing forward. One geometry per phone, shared by every hand holding one.
 */
export function handPhoneGeometry(id) {
  let geometry = cache.get(id)
  if (!geometry) {
    const p = new PropBuilder()
    // Upright (its top end up, screen forward), its lower half in the palm.
    addPhone(p, id, { position: [0, -0.1, 0.05], rotation: [Math.PI / 2, 0, 0], scale: HAND_PHONE_SCALE })
    geometry = p.build()
    cache.set(id, geometry)
  }
  return geometry
}

/** How big a practice phone is in flight: a little bigger than in the hand, to read from afar. */
export const THROW_PHONE_SCALE = 0.8
const throwCache = new Map()

/**
 * The merged geometry of phone `id` as it flies off a throw pad: lying flat (screen up),
 * centred on its middle. One per phone, shared by every practice throw.
 */
export function throwPhoneGeometry(id) {
  let geometry = throwCache.get(id)
  if (!geometry) {
    const p = new PropBuilder()
    addPhone(p, id, { scale: THROW_PHONE_SCALE })
    geometry = p.build()
    throwCache.set(id, geometry)
  }
  return geometry
}
