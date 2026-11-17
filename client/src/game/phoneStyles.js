import { BoxGeometry, CylinderGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three'

import { TIRES } from '@shared/balance'

import { STYLE } from './materials'

/**
 * How each phone looks, by phone id (the ids are the template's tire ids, kept for saves;
 * names and stats live in shared/balance.js TIRES). The line-up runs through the history
 * of the mobile phone, from an old button phone to the 18 Pro Max:
 *
 *   keypad  - a chunky button phone: a little green screen over a keypad (an aerial on the first)
 *   flip    - opened out flat: the screen half, the hinge, the keypad half
 *   slider  - the screen slid up over a keypad
 *   qwerty  - a wide screen over a tiny full keyboard
 *   home    - the first touch phones: bezels top and bottom, a round home button
 *   notch   - edge to edge, with a notch at the top
 *   island  - edge to edge, with the pill-shaped island, in a titanium frame
 *
 * `size` is [width, thickness, length] before scaling (about twice as long as wide, chunky
 * for a toy); `body` the frame and front, `back` the back panel, `accent` the buttons and
 * camera module, `keys` the keypad, `screen` the wallpaper top to bottom, `cams` the lenses
 * on the back (0-3), `style` the frame's surface (materials STYLE), and `trail` the colour
 * of its streaks and glow as it falls.
 */
const KEYPAD_SCREEN = ['#c8e8a8', '#b4dc90', '#9fcf78']
export const PHONE_STYLES = {
  bicycle: { kind: 'keypad', size: [0.44, 0.18, 0.9], body: '#2b3242', back: '#22283a', accent: '#8a93a6', keys: '#d8dee8', screen: KEYPAD_SCREEN, cams: 0, antenna: true, trail: '#cfe8ff' },
  mountain: { kind: 'flip', size: [0.42, 0.15, 1.0], body: '#b7bdc8', back: '#9aa2b0', accent: '#4a5060', keys: '#eef2f8', screen: ['#9fd8ff', '#5fb4ff', '#3a6bff'], cams: 1, trail: '#dfe8f5' },
  wood: { kind: 'slider', size: [0.46, 0.16, 0.92], body: '#1d1f22', back: '#26292e', accent: '#e8323c', keys: '#4a4f5a', screen: ['#ffd0a0', '#ff8a5a', '#d83a4a'], cams: 1, trail: '#ff6a6a' },
  stone: { kind: 'qwerty', size: [0.52, 0.14, 0.94], body: '#22252b', back: '#1d1f22', accent: '#c9d2de', keys: '#5a6070', screen: ['#d6ecff', '#7fb8ff', '#2f6fd8'], cams: 1, trail: '#c9d2de' },
  cookie: { kind: 'home', size: [0.46, 0.12, 0.98], body: '#1d1f22', back: '#c9ced6', accent: '#8a8f99', screen: ['#bff6ff', '#5fd6ff', '#2f6fd8'], cams: 1, trail: '#e0e6ee' },
  pizza: { kind: 'home', size: [0.46, 0.12, 0.98], body: '#1d1f22', back: '#f4f7fb', accent: '#c9ced6', screen: ['#e0ffe8', '#6ff0a8', '#1fa86a'], cams: 1, trail: '#ffffff' },
  donut: { kind: 'home', size: [0.46, 0.105, 0.98], body: '#14161a', back: '#1d1f22', accent: '#c9d2de', screen: ['#ffe0f0', '#ff8fc8', '#c83a8a'], cams: 1, trail: '#c9d2de' },
  watermelon: { kind: 'home', size: [0.45, 0.1, 1.02], body: '#f4f7fb', back: '#dfe4ec', accent: '#c9ced6', screen: ['#fff3c8', '#ffc85a', '#ff8a2a'], cams: 1, trail: '#f4f7fb' },
  monster: { kind: 'home', size: [0.52, 0.1, 1.06], body: '#f4f7fb', back: '#e8c89a', accent: '#d8b07a', screen: ['#e8d8ff', '#b08aff', '#6a3ad8'], cams: 1, trail: '#ffe0a8' },
  mint: { kind: 'home', size: [0.48, 0.1, 1.02], body: '#0e1014', back: '#14161a', accent: '#3a3f4a', screen: ['#bff6ff', '#3fd8ff', '#1f6fd0'], cams: 1, trail: '#5fd6ff' },
  silver: { kind: 'home', size: [0.48, 0.1, 1.02], body: '#14161a', back: '#c8102e', accent: '#e8323c', screen: ['#ffe0d0', '#ff7a5a', '#c8102e'], cams: 1, trail: '#ff5a5a' },
  ice: { kind: 'notch', size: [0.48, 0.1, 1.0], body: '#c9d2de', back: '#eef2f8', accent: '#dfe4ec', screen: ['#3a1a6a', '#7a3ad8', '#ff7ad9'], cams: 2, trail: '#e8f0ff' },
  gold: { kind: 'notch', size: [0.54, 0.1, 1.07], body: '#d8b07a', back: '#f0d4a8', accent: '#e8c89a', screen: ['#fff0c8', '#ffb85a', '#d86a1a'], cams: 2, trail: '#ffe27a' },
  lava: { kind: 'notch', size: [0.5, 0.1, 1.0], body: '#5a6a5a', back: '#3c4b40', accent: '#4a5a4c', screen: ['#d0ffe0', '#5fd88a', '#1f7a4a'], cams: 3, trail: '#8ae0a8' },
  platinum: { kind: 'notch', size: [0.5, 0.1, 1.0], body: '#5a7896', back: '#2f4e6a', accent: '#3a5a7a', screen: ['#bfe6ff', '#4fa8e8', '#1f4e8a'], cams: 3, trail: '#7fc8ff' },
  emerald: { kind: 'notch', size: [0.55, 0.1, 1.07], body: '#b8cce0', back: '#9db8d8', accent: '#a8c0dc', screen: ['#e0f0ff', '#8ab8ff', '#3a6bd8'], cams: 3, trail: '#bfe0ff' },
  ruby: { kind: 'island', size: [0.5, 0.1, 1.0], body: '#7a6a8a', back: '#5a4a6a', accent: '#6a5a7a', screen: ['#f0d8ff', '#a87aff', '#4a2a9a'], cams: 3, trail: '#c8a8ff' },
  diamond: { kind: 'island', size: [0.55, 0.1, 1.07], body: '#9a948a', back: '#b5aea2', accent: '#a8a294', screen: ['#fff3e0', '#e8c8a0', '#a8865a'], cams: 3, trail: '#e8dcc8' },
  rainbow: { kind: 'island', size: [0.5, 0.1, 1.01], body: '#b09478', back: '#c8a888', accent: '#bc9e80', screen: ['#ffe8d0', '#ffb07a', '#c86a3a'], cams: 3, trail: '#ffd0a8' },
  unicorn: { kind: 'island', size: [0.55, 0.1, 1.08], body: '#4a4a4e', back: '#3a3a3c', accent: '#444448', screen: ['#d8e0ff', '#7a8aff', '#2a2a8a'], cams: 3, trail: '#a8b0ff' },
  galaxy: { kind: 'island', size: [0.5, 0.1, 1.01], body: '#e86a1a', back: '#ff7a2a', accent: '#ff8a3a', screen: ['#fff0d0', '#ffb04a', '#e85a1a'], cams: 3, trail: '#ff9a4a' },
  dragon: { kind: 'island', size: [0.55, 0.1, 1.08], body: '#2a4a80', back: '#1f3a6a', accent: '#244476', screen: ['#d0e8ff', '#4a8aff', '#14287a'], cams: 3, trail: '#5f9aff' },
  cosmic: { kind: 'island', size: [0.5, 0.1, 1.01], body: '#9fe0ff', back: '#bfe6ff', accent: '#aee2ff', screen: ['#ffffff', '#9fe8ff', '#3a8aff'], cams: 3, trail: '#cff4ff', style: STYLE.GLOW },
  infinity: { kind: 'island', size: [0.56, 0.1, 1.09], body: '#ffc21a', back: '#ffd86a', accent: '#ffcf3a', screen: ['#ff9aff', '#9b6bff', '#3fd6ff'], cams: 3, trail: '#ffe27a', style: STYLE.GLOW },
}

const FALLBACK = PHONE_STYLES.bicycle
export const phoneStyle = (id) => PHONE_STYLES[id] ?? FALLBACK
/** The colour a phone's streaks and glow take as it falls. */
export const phoneTrail = (id) => phoneStyle(id).trail
/** Its back's colour, for anything tinted to match (labels, stands). */
export const phoneCase = (id) => phoneStyle(id).back

export const PHONE_IDS = TIRES.map((t) => t.id)

/** The phones' usual size before scaling (each one's own is PHONE_STYLES[id].size). */
export const PHONE_SIZE = { width: 0.52, thickness: 0.12, length: 1 }
/** Phone `id`'s size before scaling: { width, thickness, length }. */
export function phoneDims(id) {
  const [width, thickness, length] = phoneStyle(id).size
  return { width, thickness, length }
}

const BOX = new BoxGeometry(1, 1, 1)
const LENS = new CylinderGeometry(0.5, 0.5, 1, 12)
const ROUND = new CylinderGeometry(0.5, 0.5, 1, 16)
/** The app icons on a touch phone's home screen. */
const APP_COLORS = ['#ffffff', '#ff5a7a', '#ffd21f', '#4ef05a', '#2fc6ff', '#b15cff', '#ff9a2e', '#ffffff', '#3fd6e8']
const INK = '#141820'
const GLASS = '#0e1118'

const _q = new Quaternion()
const _e = new Euler()
const _p = new Vector3()
const _one = new Vector3(1, 1, 1)

/**
 * Adds one phone of `id` to a PropBuilder, centred on `position` and turned by `rotation`
 * (Euler XYZ), at `scale`. In the phone's own frame its screen faces +Y and its top end is
 * towards -Z.
 */
export function addPhone(builder, id, { position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 } = {}) {
  const s = phoneStyle(id)
  const [w, t, l] = s.size
  const saved = builder.transform
  _q.setFromEuler(_e.set(rotation[0], rotation[1], rotation[2]))
  const placed = new Matrix4().compose(_p.fromArray(position), _q, _one)
  builder.transform = saved ? new Matrix4().copy(saved).multiply(placed) : placed
  /** One part in the phone's frame: centre (x, y, z), size (sx, sy, sz). */
  const part = (geometry, x, y, z, sx, sy, sz, color, style = STYLE.SMOOTH, rot = [0, 0, 0]) => {
    builder.add(geometry, { position: [x * scale, y * scale, z * scale], rotation: rot, scale: [sx * scale, sy * scale, sz * scale], color, style })
  }
  const front = t / 2
  const frame = s.style ?? STYLE.SMOOTH

  // The body: two overlapping boxes, so its corners read rounded; the back panel on it.
  part(BOX, 0, 0, 0, w, t, l - 0.08, s.body, frame)
  part(BOX, 0, 0, 0, w - 0.08, t, l, s.body, frame)
  part(BOX, 0, -front - 0.004, 0, w - 0.05, 0.01, l - 0.05, s.back, frame === STYLE.GLOW ? STYLE.GLOW : STYLE.SMOOTH)

  /** The wallpaper: a dark panel and three glowing bands, from z0 to z1, `sw` wide. */
  const screen = (z0, z1, sw, y = front) => {
    const len = z1 - z0
    part(BOX, 0, y + 0.004, (z0 + z1) / 2, sw + 0.02, 0.008, len + 0.02, GLASS)
    const band = len / 3
    for (let i = 0; i < 3; i += 1) part(BOX, 0, y + 0.011, z0 + band * (i + 0.5), sw, 0.006, band + 0.002, s.screen[i], STYLE.GLOW)
  }
  /** A touch phone's home screen: a clock and a grid of app icons, starting at z0. */
  const apps = (z0, y = front) => {
    part(BOX, 0, y + 0.016, z0, 0.22, 0.004, 0.06, '#ffffff', STYLE.GLOW)
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        part(BOX, (col - 1) * 0.13, y + 0.017, z0 + 0.16 + row * 0.14, 0.085, 0.004, 0.085, APP_COLORS[(row * 3 + col) % APP_COLORS.length], STYLE.GLOW)
      }
    }
  }
  /** A keypad: `rows` x 3 keys from z0, `pitch` apart, plus call and end keys above. */
  const keypad = (z0, rows, pitch, y = front) => {
    part(ROUND, 0, y + 0.012, z0, 0.12, 0.02, 0.09, s.accent)
    part(BOX, -0.13, y + 0.012, z0, 0.09, 0.02, 0.05, '#3fbf4a')
    part(BOX, 0.13, y + 0.012, z0, 0.09, 0.02, 0.05, '#e8323c')
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < 3; col += 1) part(BOX, (col - 1) * 0.12, y + 0.012, z0 + 0.1 + row * pitch, 0.1, 0.02, pitch - 0.018, s.keys)
    }
  }

  if (s.kind === 'keypad') {
    part(BOX, 0, front + 0.006, -l / 2 + 0.05, 0.12, 0.01, 0.02, INK)
    screen(-l / 2 + 0.09, -l / 2 + 0.35, w - 0.13)
    // Signal bars and a battery on the little screen.
    part(BOX, -0.11, front + 0.016, -l / 2 + 0.12, 0.04, 0.004, 0.02, '#4a6a3a')
    part(BOX, 0.11, front + 0.016, -l / 2 + 0.12, 0.05, 0.004, 0.02, '#4a6a3a')
    keypad(-l / 2 + 0.43, 4, 0.08)
    if (s.antenna) part(LENS, w / 2 - 0.09, 0, -l / 2 - 0.05, 0.07, 0.14, 0.07, s.accent, STYLE.SMOOTH, [Math.PI / 2, 0, 0])
  } else if (s.kind === 'flip') {
    // The lid (the screen half) in its own colour, a chunky hinge across the middle with
    // a gap either side of it, and the keypad half below.
    part(BOX, 0, front + 0.012, -l / 4 - 0.02, w + 0.01, 0.024, l / 2 - 0.06, s.accent)
    screen(-l / 2 + 0.07, -0.09, w - 0.1, front + 0.024)
    part(BOX, 0, front + 0.002, 0, w + 0.02, 0.006, 0.07, INK)
    part(LENS, 0, front + 0.02, 0, 0.11, w + 0.04, 0.11, s.accent, STYLE.SMOOTH, [0, 0, Math.PI / 2])
    part(LENS, 0, front + 0.02, 0, 0.115, w * 0.4, 0.115, '#dfe4ec', STYLE.SMOOTH, [0, 0, Math.PI / 2])
    keypad(0.11, 3, 0.085)
  } else if (s.kind === 'slider') {
    // The screen plate slid up, the keypad showing below it.
    const plate = l * 0.62
    part(BOX, 0, front + 0.02, -l / 2 + plate / 2, w - 0.02, 0.04, plate, s.body)
    screen(-l / 2 + 0.06, -l / 2 + plate - 0.12, w - 0.1, front + 0.04)
    part(BOX, 0, front + 0.05, -l / 2 + plate - 0.06, 0.16, 0.012, 0.05, s.accent)
    keypad(-l / 2 + plate + 0.06, 2, 0.08)
  } else if (s.kind === 'qwerty') {
    screen(-l / 2 + 0.06, -l / 2 + 0.44, w - 0.08)
    part(BOX, 0, front + 0.012, -l / 2 + 0.5, 0.1, 0.02, 0.05, s.accent)
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 8; col += 1) part(BOX, (col - 3.5) * 0.054, front + 0.01, -l / 2 + 0.58 + row * 0.07, 0.044, 0.016, 0.052, s.keys)
    }
  } else if (s.kind === 'home') {
    // Bezels top and bottom, an earpiece and camera, the round home button.
    part(BOX, 0, front + 0.006, -l / 2 + 0.07, 0.12, 0.01, 0.02, '#3a3f4a')
    part(LENS, -0.1, front + 0.006, -l / 2 + 0.07, 0.025, 0.01, 0.025, '#3a3f4a')
    screen(-l / 2 + 0.15, l / 2 - 0.17, w - 0.06)
    apps(-l / 2 + 0.22)
    part(ROUND, 0, front + 0.006, l / 2 - 0.085, 0.1, 0.01, 0.1, s.accent)
    part(ROUND, 0, front + 0.009, l / 2 - 0.085, 0.075, 0.01, 0.075, INK)
  } else {
    // Edge to edge: the notch, or the island, and the home bar.
    screen(-l / 2 + 0.03, l / 2 - 0.03, w - 0.04)
    if (s.kind === 'notch') {
      part(BOX, 0, front + 0.018, -l / 2 + 0.05, 0.2, 0.008, 0.05, INK)
    } else {
      part(BOX, 0, front + 0.018, -l / 2 + 0.07, 0.08, 0.008, 0.04, INK)
      for (const side of [-1, 1]) part(ROUND, side * 0.04, front + 0.018, -l / 2 + 0.07, 0.04, 0.008, 0.04, INK)
    }
    apps(-l / 2 + 0.17)
    part(BOX, 0, front + 0.018, l / 2 - 0.05, 0.16, 0.004, 0.012, '#ffffff', STYLE.GLOW)
  }

  // Buttons down the side.
  part(BOX, w / 2 + 0.01, 0, -l / 2 + 0.3, 0.022, t * 0.4, 0.12, s.accent)
  if (s.kind !== 'keypad') part(BOX, -w / 2 - 0.01, 0, -l / 2 + 0.26, 0.022, t * 0.4, 0.09, s.accent)

  // The cameras on the back: one lens, a pill of two, or a square module of three.
  const back = -front - 0.01
  const cx = -w / 2 + (s.cams >= 3 ? 0.15 : 0.11)
  const cz = -l / 2 + (s.cams >= 3 ? 0.17 : 0.12)
  if (s.cams === 1) {
    part(LENS, cx, back - 0.012, cz, 0.07, 0.025, 0.07, INK)
    part(LENS, cx + 0.08, back - 0.006, cz, 0.03, 0.012, 0.03, '#fff6c8', STYLE.GLOW)
  } else if (s.cams === 2) {
    part(BOX, cx, back - 0.012, cz + 0.05, 0.1, 0.024, 0.2, s.accent)
    for (const dz of [0, 0.1]) part(LENS, cx, back - 0.03, cz + dz, 0.07, 0.02, 0.07, INK)
  } else if (s.cams >= 3) {
    part(BOX, cx, back - 0.012, cz, 0.24, 0.024, 0.24, s.accent)
    for (const [dx, dz] of [
      [-0.055, -0.055],
      [-0.055, 0.055],
      [0.055, 0],
    ]) {
      part(LENS, cx + dx, back - 0.03, cz + dz, 0.085, 0.024, 0.085, INK)
      part(LENS, cx + dx, back - 0.044, cz + dz, 0.04, 0.006, 0.04, '#3a5aa8')
    }
    part(LENS, cx + 0.06, back - 0.026, cz + 0.08, 0.03, 0.01, 0.03, '#fff6c8', STYLE.GLOW)
  }

  builder.transform = saved
  return builder
}
