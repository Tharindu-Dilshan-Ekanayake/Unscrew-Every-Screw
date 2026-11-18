import { ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three'

import { skinById } from '@shared/balance'

import { PropBuilder } from './blocks'
import { STYLE } from './materials'

/**
 * The tools as toy props, built from primitives and merged (one draw call each, through
 * the shared toy material): coloured by the player's skin. Each is two parts - the
 * `body` you hold and the `bit` that spins - pointing down -Z from a grip at the origin.
 */

const CYL = new CylinderGeometry(1, 1, 1, 14)
const CYL6 = new CylinderGeometry(1, 1, 1, 6)
const CONE = new ConeGeometry(1, 1, 10)
const TORUS = new TorusGeometry(1, 0.28, 8, 18)
/** Half a ring: the magnet's horseshoe. */
const HORSESHOE = new TorusGeometry(1, 0.34, 8, 16, Math.PI)
const BALL = new SphereGeometry(1, 12, 8)
/** Tapering towards -Z once laid along it: the drill's nose, the screwdriver's neck. */
const TAPER = new CylinderGeometry(0.6, 1, 1, 14)
/** Lying along Z (cylinders are made along Y). */
const ALONG_Z = [Math.PI / 2, 0, 0]

const METAL = '#cdd5de'
const METAL_DARK = '#7d8896'
const DARK = '#2a2e35'

/** Six rubber ribs along a grip of radius `r`, `length` long, centred at `z`. */
function ribs(b, y, z, r, length, color, style) {
  for (let k = 0; k < 6; k += 1) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6
    b.box(Math.cos(a) * r, y + Math.sin(a) * r, z, 0.012, 0.012, length, color, style, [0, 0, a])
  }
}

function screwdriver(b, bit, skin, accentStyle) {
  // The handle: a chunky grip with rubber ribs, a rounded butt and a band at each end.
  b.add(CYL, { position: [0, 0, 0.03], rotation: ALONG_Z, scale: [0.035, 0.16, 0.035], color: skin.grip })
  ribs(b, 0, 0.03, 0.034, 0.12, skin.accent, accentStyle)
  b.add(BALL, { position: [0, 0, 0.11], scale: [0.035, 0.035, 0.028], color: skin.accent, style: accentStyle })
  b.add(CYL, { position: [0, 0, 0.088], rotation: ALONG_Z, scale: [0.038, 0.018, 0.038], color: skin.accent, style: accentStyle })
  b.add(CYL, { position: [0, 0, -0.05], rotation: ALONG_Z, scale: [0.039, 0.022, 0.039], color: skin.accent, style: accentStyle })
  // Its neck, tapering into a steel collar.
  b.add(TAPER, { position: [0, 0, -0.075], rotation: [-Math.PI / 2, 0, 0], scale: [0.03, 0.03, 0.03], color: skin.grip })
  b.add(CYL, { position: [0, 0, -0.095], rotation: ALONG_Z, scale: [0.013, 0.014, 0.013], color: METAL })
  // The shaft and a Phillips tip.
  bit.add(CYL6, { position: [0, 0, -0.2], rotation: ALONG_Z, scale: [0.0085, 0.21, 0.0085], color: METAL })
  bit.add(CONE, { position: [0, 0, -0.318], rotation: [-Math.PI / 2, 0, 0], scale: [0.0105, 0.026, 0.0105], color: METAL })
  bit.box(0, 0, -0.312, 0.022, 0.004, 0.016, METAL_DARK, STYLE.SMOOTH)
  bit.box(0, 0, -0.312, 0.004, 0.022, 0.016, METAL_DARK, STYLE.SMOOTH)
}

function drill(b, bit, skin, accentStyle) {
  // The motor housing: a barrel along Z with a rounded back, a stripe and vents.
  b.add(CYL, { position: [0, 0.02, -0.035], rotation: ALONG_Z, scale: [0.044, 0.18, 0.044], color: skin.grip })
  b.add(BALL, { position: [0, 0.02, 0.055], scale: [0.044, 0.044, 0.03], color: skin.grip })
  b.add(TAPER, { position: [0, 0.02, -0.137], rotation: [-Math.PI / 2, 0, 0], scale: [0.04, 0.03, 0.04], color: skin.grip })
  b.box(0, 0.064, -0.03, 0.026, 0.012, 0.16, skin.accent, accentStyle)
  for (let k = 0; k < 3; k += 1) {
    for (const side of [-1, 1]) b.box(side * 0.043, 0.02, 0.0 + k * 0.02, 0.006, 0.034, 0.008, DARK, STYLE.SMOOTH)
  }
  // The pistol grip, its trigger, and the battery pack under it (with a charge gauge).
  b.box(0, -0.055, 0.025, 0.046, 0.13, 0.058, DARK, STYLE.SMOOTH, [0.22, 0, 0])
  b.box(0, -0.022, -0.016, 0.018, 0.034, 0.02, skin.accent, accentStyle, [0.22, 0, 0])
  b.box(0, -0.13, 0.042, 0.082, 0.046, 0.11, skin.accent, accentStyle)
  b.box(0, -0.106, 0.042, 0.084, 0.008, 0.112, DARK, STYLE.SMOOTH)
  b.box(0, -0.13, -0.0145, 0.05, 0.016, 0.004, '#6dff9a', STYLE.GLOW)
  // A work light under the nose, and the chuck: a dark ribbed collar with a steel tip.
  b.box(0, -0.027, -0.11, 0.018, 0.01, 0.012, '#fff4c0', STYLE.GLOW)
  b.add(CYL, { position: [0, 0.02, -0.165], rotation: ALONG_Z, scale: [0.03, 0.04, 0.03], color: DARK })
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2
    b.box(Math.cos(a) * 0.03, 0.02 + Math.sin(a) * 0.03, -0.165, 0.006, 0.006, 0.036, METAL_DARK, STYLE.SMOOTH, [0, 0, a])
  }
  bit.add(CYL, { position: [0, 0.02, -0.195], rotation: ALONG_Z, scale: [0.02, 0.022, 0.02], color: METAL })
  bit.add(CYL6, { position: [0, 0.02, -0.25], rotation: ALONG_Z, scale: [0.008, 0.1, 0.008], color: METAL })
  bit.add(CONE, { position: [0, 0.02, -0.31], rotation: [-Math.PI / 2, 0, 0], scale: [0.01, 0.022, 0.01], color: METAL })
}

function ratchet(b, bit, skin, accentStyle) {
  // A long handle in a grip sleeve, a steel neck, and the round head with its lever.
  b.add(CYL, { position: [0, 0.02, 0.02], rotation: ALONG_Z, scale: [0.042, 0.16, 0.042], color: skin.grip })
  ribs(b, 0.02, 0.02, 0.041, 0.12, skin.accent, accentStyle)
  b.add(BALL, { position: [0, 0.02, 0.1], scale: [0.042, 0.042, 0.03], color: skin.accent, style: accentStyle })
  b.add(TAPER, { position: [0, 0.02, -0.075], rotation: [-Math.PI / 2, 0, 0], scale: [0.04, 0.05, 0.04], color: METAL })
  b.box(0, -0.07, 0.05, 0.045, 0.12, 0.05, DARK, STYLE.SMOOTH, [0.2, 0, 0])
  b.add(CYL, { position: [0, 0.02, -0.12], rotation: ALONG_Z, scale: [0.078, 0.034, 0.078], color: METAL })
  b.add(CYL, { position: [0, 0.02, -0.1], rotation: ALONG_Z, scale: [0.05, 0.008, 0.05], color: skin.accent, style: accentStyle })
  b.box(0, 0.105, -0.12, 0.02, 0.02, 0.03, skin.accent, accentStyle)
  // The spinning socket: a ring of teeth and an hex drive.
  bit.add(CYL, { position: [0, 0.02, -0.145], rotation: ALONG_Z, scale: [0.07, 0.02, 0.07], color: METAL_DARK })
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2
    bit.box(Math.cos(a) * 0.068, 0.02 + Math.sin(a) * 0.068, -0.145, 0.016, 0.016, 0.022, METAL, STYLE.SMOOTH, [0, 0, a])
  }
  bit.add(CYL6, { position: [0, 0.02, -0.19], rotation: ALONG_Z, scale: [0.022, 0.07, 0.022], color: METAL })
  bit.add(CYL6, { position: [0, 0.02, -0.23], rotation: ALONG_Z, scale: [0.012, 0.03, 0.012], color: skin.accent })
}

function magnet(b, bit, skin, accentStyle) {
  // The handle: a ribbed grip into a dark block.
  b.add(CYL, { position: [0, -0.02, 0.06], rotation: ALONG_Z, scale: [0.034, 0.13, 0.034], color: skin.grip })
  ribs(b, -0.02, 0.06, 0.033, 0.1, skin.accent, accentStyle)
  b.add(BALL, { position: [0, -0.02, 0.125], scale: [0.034, 0.034, 0.025], color: skin.accent, style: accentStyle })
  b.box(0, -0.02, -0.02, 0.07, 0.07, 0.05, DARK, STYLE.SMOOTH)
  // The horseshoe: a red half-ring opening forwards, with steel poles.
  b.add(HORSESHOE, { position: [0, -0.02, -0.105], rotation: [Math.PI / 2, 0, 0], scale: [0.072, 0.072, 0.072], color: '#e8323a' })
  for (const side of [-1, 1]) {
    b.add(CYL, { position: [side * 0.072, -0.02, -0.14], rotation: ALONG_Z, scale: [0.025, 0.07, 0.025], color: '#e8323a' })
    b.add(CYL, { position: [side * 0.072, -0.02, -0.19], rotation: ALONG_Z, scale: [0.0255, 0.03, 0.0255], color: METAL })
  }
  // Its pull: glowing rings between the poles.
  bit.add(TORUS, { position: [0, -0.02, -0.235], scale: [0.05, 0.05, 0.05], color: skin.accent, style: STYLE.GLOW })
  bit.add(TORUS, { position: [0, -0.02, -0.235], rotation: [0, Math.PI / 2, 0], scale: [0.035, 0.035, 0.035], color: skin.accent, style: accentStyle })
}

const BUILDERS = { driver: screwdriver, drill, ratchet, magnet }

/** `{ body, bit }` geometries for tool `id` in skin `skinId`. The caller disposes them. */
export function buildToolGeometry(id, skinId) {
  const skin = skinById(skinId)
  const accentStyle = skin.glow ? STYLE.GLOW : STYLE.SMOOTH
  const body = new PropBuilder()
  const bit = new PropBuilder()
  ;(BUILDERS[id] || screwdriver)(body, bit, skin, accentStyle)
  return { body: body.build(), bit: bit.build() }
}

/** The blocky forearm and hand that hold the tool in first person. */
export function buildArmGeometry(skinTone = '#f3c48e', sleeve = '#3a6fd8') {
  const b = new PropBuilder()
  b.box(0.0, -0.03, 0.05, 0.075, 0.07, 0.09, skinTone, STYLE.SMOOTH)
  b.box(0.01, -0.06, 0.22, 0.09, 0.09, 0.26, skinTone, STYLE.SMOOTH)
  b.box(0.012, -0.07, 0.4, 0.11, 0.11, 0.14, sleeve, STYLE.SMOOTH)
  return b.build()
}
