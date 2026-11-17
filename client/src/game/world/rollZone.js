import { CylinderGeometry, SphereGeometry } from 'three'

import { DROP_SPOT, ROLL_ARCH, ROLL_ZONE } from '@shared/world'

import { STYLE } from '../materials'
import { addPhone } from '../phoneStyles'
import { venueOf } from '../sceneStyle'

/** The DROP ZONE strip: the one gameplay yellow, the same in every world. */
const STRIP = '#ffd21f'
const RAIL = '#ffffff'

const DISC = new CylinderGeometry(1, 1, 1, 28)
const BALL = new SphereGeometry(1, 16, 12)

/** Height of the arch's beam, and the sign hung on its face. */
const ARCH_TOP = 11
export const ARCH_SIGN = { width: 12, height: 3, y: ARCH_TOP - 1.6, faceZ: ROLL_ARCH.z + 1.05 }

/** A lightning bolt in three slanted bars, on the arch's face at (x, y). */
function addBolt(blocks, x, y, z, flip, color) {
  blocks.add(x + 0.35 * flip, y + 0.75, z, 0.7, 0.2, 0.18, color, STYLE.GLOW, 0, 0, 0.9 * flip)
  blocks.add(x, y, z, 1.4, 0.2, 0.18, color, STYLE.GLOW, 0, 0, 0)
  blocks.add(x - 0.35 * flip, y - 0.75, z, 0.7, 0.2, 0.18, color, STYLE.GLOW, 0, 0, 0.9 * flip)
}

/**
 * The DROP ZONE at the cliff edge: the yellow strip across the end of the plaza (painted
 * with its name, see signs.js) with navy chevrons pointing out over the edge, a glowing
 * pad at each end, a railing along the edge with a gap in the middle where a little
 * platform juts out over the drop (the spot you throw from, DROP_SPOT), and a big
 * yellow-and-navy arch over it all with its sign between lightning bolts, crowned by a
 * giant phone - in the venue's colours (turquoise and teal with coral at Palm Beach); the
 * strip itself is the same yellow everywhere.
 *
 * Boxes go into the world's block set and the round parts into its props, so the whole
 * thing rides in those two draw calls. `detail` (off on LOW) adds the bulbs.
 *
 * No two faces here share a plane: every layer stands a clear step proud of what it
 * sits on (flush faces flicker, worst on phones' coarser depth buffers).
 */
export function buildRollZone(blocks, props, { detail = true, world = 0 } = {}) {
  const c = venueOf(world).arch
  const { minX, maxX, minZ, maxZ } = ROLL_ZONE
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const w = maxX - minX
  const d = maxZ - minZ

  // The strip: a navy border with the yellow fill raised on it, running right up to the
  // field's edge.
  blocks.addOn(cx, 0, cz + 0.3, w + 1.2, 0.05, d + 0.6, c.base)
  blocks.addOn(cx, 0.05, cz + 0.3, w, 0.05, d - 0.2, STRIP)
  // Chevrons on the strip, pointing down the runway.
  for (const x of [-9, 9]) {
    for (const side of [-1, 1]) {
      blocks.add(x + side * 0.7, 0.12, cz, 2.2, 0.04, 0.6, c.base, STYLE.SMOOTH, side * 0.75)
    }
  }
  // Glowing pads at both ends.
  for (const side of [-1, 1]) {
    const x = side * (w / 2 + 2.2)
    props.add(DISC, { position: [x, 0.08, cz + 0.3], scale: [2, 0.12, 2.6], color: '#ffffff' })
    props.add(DISC, { position: [x, 0.15, cz + 0.3], scale: [1.6, 0.06, 2.2], color: STRIP, style: STYLE.GLOW })
  }

  // The cliff edge: a railing along it with a gap in the middle, and there a little
  // platform jutting out over the drop with a glowing ring where you stand to throw.
  const edgeZ = minZ + 0.3
  for (const side of [-1, 1]) {
    const from = side * 2.6
    const to = side * (w / 2 + 3)
    const mid = (from + to) / 2
    const len = Math.abs(to - from)
    blocks.addOn(mid, 0.1, edgeZ, len, 0.12, 0.5, c.base, STYLE.SMOOTH)
    blocks.addOn(mid, 1.05, edgeZ, len, 0.16, 0.24, RAIL, STYLE.SMOOTH)
    blocks.addOn(mid, 0.55, edgeZ, len, 0.08, 0.14, RAIL, STYLE.SMOOTH)
    for (let x = Math.min(from, to); x <= Math.max(from, to) + 0.01; x += 2.2) blocks.addOn(x, 0.1, edgeZ, 0.22, 1.0, 0.22, RAIL, STYLE.SMOOTH)
    blocks.addOn(from, 0.1, edgeZ, 0.5, 1.6, 0.5, STRIP, STYLE.STRIPES)
    props.add(BALL, { position: [from, 1.95, edgeZ], scale: [0.4, 0.4, 0.4], color: c.crest, style: STYLE.GLOW })
  }
  blocks.addOn(DROP_SPOT.x, -0.4, minZ - 1.2, 4.6, 0.55, 3.4, c.base, STYLE.SMOOTH)
  blocks.addOn(DROP_SPOT.x, 0.15, minZ - 1.1, 4.2, 0.06, 3.0, STRIP, STYLE.PLATE)
  props.add(DISC, { position: [DROP_SPOT.x, 0.13, DROP_SPOT.z], scale: [1.2, 0.04, 1.2], color: '#ffffff' })
  props.add(DISC, { position: [DROP_SPOT.x, 0.17, DROP_SPOT.z], scale: [0.95, 0.04, 0.95], color: c.crest, style: STYLE.GLOW })
  // Arrows on the strip pointing out over the edge.
  const ARROWS = ['#ff4a4a', '#ff9a1e', '#ffe23a']
  for (let i = 0; i < 3; i += 1) {
    const z = DROP_SPOT.z + 3 + i * 2.6
    for (const side of [-1, 1]) blocks.add(DROP_SPOT.x + side * 0.6, 0.15, z, 1.6, 0.06, 0.36, ARROWS[i], STYLE.GLOW, -side * 0.75)
  }

  // The start arch: striped pillars either side, a beam across the top carrying the
  // sign and a gold crest, and a glowing orb on each pillar.
  const archZ = ROLL_ARCH.z
  const span = ROLL_ARCH.x * 2
  for (const side of [-1, 1]) {
    const x = side * ROLL_ARCH.x
    blocks.addOn(x, 0, archZ, 2.2, 0.8, 2.2, c.base)
    blocks.addOn(x, 0.8, archZ, 1.6, ARCH_TOP - 0.8, 1.6, c.pillar, STYLE.STRIPES)
    blocks.addOn(x, ARCH_TOP + 1.3, archZ, 2.1, 2.1, 2.1, c.crest, STYLE.GLOW)
    if (detail) {
      for (let y = 1.8; y < ARCH_TOP - 0.6; y += 1.1) {
        blocks.add(x, y, archZ + 0.88, 0.3, 0.3, 0.16, Math.round(y) % 2 ? '#ffffff' : c.base, STYLE.GLOW)
      }
    }
  }
  blocks.addOn(0, ARCH_TOP - 0.2, archZ, span + 1, 1.5, 1.3, c.pillar, STYLE.STRIPES)
  blocks.addOn(0, ARCH_TOP - 0.45, archZ, span - 1.4, 0.25, 1.4, c.glow, STYLE.GLOW)
  blocks.addOn(0, ARCH_TOP + 1.3, archZ, span - 4, 0.3, 1, c.base, STYLE.SMOOTH)
  // The sign: a gold-framed navy panel, lettering painted on (signs.js), a lightning bolt
  // either side.
  blocks.addOn(0, ARCH_SIGN.y - ARCH_SIGN.height / 2 - 0.15, archZ + 0.75, ARCH_SIGN.width + 0.6, ARCH_SIGN.height + 0.3, 0.3, c.crest)
  blocks.addOn(0, ARCH_SIGN.y - ARCH_SIGN.height / 2, archZ + 0.8, ARCH_SIGN.width, ARCH_SIGN.height, 0.3, c.base, STYLE.SMOOTH)
  for (const side of [-1, 1]) addBolt(blocks, side * (ARCH_SIGN.width / 2 + 2.1), ARCH_SIGN.y - ARCH_SIGN.height / 2, archZ + 0.78, side, c.crest)
  if (detail) {
    for (let x = -ROLL_ARCH.x + 1.5; x <= ROLL_ARCH.x - 1.49; x += 1) {
      if (Math.abs(x) < ARCH_SIGN.width / 2 + 0.7) continue
      blocks.add(x, ARCH_TOP + 0.95, archZ + 0.73, 0.3, 0.3, 0.16, Math.round(x) % 2 ? c.crest : '#ffffff', STYLE.GLOW)
      blocks.add(x + 0.5, ARCH_TOP + 0.15, archZ + 0.73, 0.3, 0.3, 0.16, Math.round(x) % 2 ? '#ffffff' : c.crest, STYLE.GLOW)
    }
  }

  // The crown: a giant phone standing on the beam, tipping over the edge, a gold ring
  // glowing behind it.
  const baseY = ARCH_TOP + 1.4
  addPhone(props, 'infinity', { position: [0, baseY + 3.6, archZ], rotation: [Math.PI / 2 - 0.25, 0, 0.2], scale: 7 })
  props.add(DISC, { position: [0, baseY + 3.8, archZ - 1.4], rotation: [Math.PI / 2, 0, 0], scale: [4.6, 0.3, 4.6], color: c.crest, style: STYLE.GLOW })
}
