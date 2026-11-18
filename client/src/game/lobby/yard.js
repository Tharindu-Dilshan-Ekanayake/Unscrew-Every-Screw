import { ConeGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry, TorusGeometry } from 'three'

import { BELTS, BENCHES, CRATES, CROSSROADS, ELEVATOR, FACTORY, LEADERBOARDS, PAD_SECTIONS, padPosts, PICNICS, PLANTERS, PLAY_PADS, PLAY_PLAZA, PLAZA, SECTION_SIGN_Z, sectionSpan, SOLO_PAD, STATIONS } from '@shared/world'

import { PropBuilder } from '../blocks'
import { STYLE } from '../materials'
import { PALETTE } from '../sceneStyle'
import { buildGarage } from './garage'

/**
 * The lobby's static scenery, built once into one merged toy mesh (one draw call): the
 * yard and its paths, the play pads, the factory front, the stations, benches, screw
 * bins - and the giant screw garage round it all (garage.js).
 *
 * Surfaces that lie on one another are kept at distinct heights (lawn -0.1, paving 0,
 * plaza 0.02, paths 0.03, borders 0.045, pads 0.05+) and nothing shares a face, so
 * nothing z-fights at any distance.
 */

const CYL = new CylinderGeometry(1, 1, 1, 24)
const CYL8 = new CylinderGeometry(1, 1, 1, 8)
const CYL48 = new CylinderGeometry(1, 1, 1, 48)
const CONE = new ConeGeometry(1, 1, 8)
const PAWN_BODY = new CylinderGeometry(0.55, 1, 1, 12)
const RING = new TorusGeometry(1, 0.08, 6, 48)
const RING_THIN = new TorusGeometry(1, 0.025, 4, 72)
const BALL = new SphereGeometry(1, 10, 6)
const PUFF = new IcosahedronGeometry(1, 1)
const GEM = new IcosahedronGeometry(1, 0)
const CUP = new CylinderGeometry(1, 0.55, 1, 16)

/** Paths from A to B (on the ground), `width` wide, top at `top`. */
function path(b, ax, az, bx, bz, width, color, top = 0.03, style = STYLE.TILES) {
  const dx = bx - ax
  const dz = bz - az
  const length = Math.hypot(dx, dz)
  b.box((ax + bx) / 2, top - 0.015, (az + bz) / 2, length, 0.03, width, color, style, [0, -Math.atan2(dz, dx), 0])
}

/** A person, painted flat on a pad (head to the north, so it reads upright as you walk up). */
function paintedPerson(b, x, z, s, y, color) {
  b.add(CYL, { position: [x, y, z - 0.36 * s], scale: [0.27 * s, 0.02, 0.27 * s], color, style: STYLE.GLOW })
  b.add(CYL, { position: [x, y, z + 0.36 * s], scale: [0.48 * s, 0.02, 0.34 * s], color, style: STYLE.GLOW })
}

/** The pads' colours - SOLO's, and each chapter's team section: deck, glow and trim. */
export const PAD_LOOKS = {
  solo: { deck: '#2fbf6e', glow: '#7dffb4', trim: '#14532d' },
  workshop: { deck: '#e08a2e', glow: '#ffd08a', trim: '#5a3410' },
  boiler: { deck: '#d8432b', glow: '#ffa08a', trim: '#4a1208' },
  lab: { deck: '#24a8d8', glow: '#a6efff', trim: '#0b3a4d' },
}
export const padLook = (pad) => PAD_LOOKS[pad.size === 1 ? 'solo' : pad.chapter]

/** Where each seat on a team pad is: `[x, z]`, one per player it seats. */
export function seatSpots(pad) {
  const n = pad.size
  const r = pad.radius * (n === 4 ? 0.52 : 0.5)
  const start = n === 2 ? Math.PI : n === 3 ? -Math.PI / 2 : Math.PI / 4
  return Array.from({ length: n }, (_, k) => {
    const a = start + (k / n) * Math.PI * 2
    return [pad.x + Math.cos(a) * r, pad.z + Math.sin(a) * r]
  })
}

/** A little pawn standing at (x, y, z): base, tapered body, round head. */
export function pawn(b, x, y, z, size, color, style = STYLE.GLOW) {
  b.add(CYL, { position: [x, y + 0.05 * size, z], scale: [0.36 * size, 0.1 * size, 0.36 * size], color, style })
  b.add(PAWN_BODY, { position: [x, y + 0.42 * size, z], scale: [0.28 * size, 0.64 * size, 0.28 * size], color, style })
  b.add(BALL, { position: [x, y + 0.93 * size, z], scale: [0.24 * size, 0.24 * size, 0.24 * size], color, style })
}

/**
 * A play pad: a round stepped plinth with lights round its edge, a glowing rim and a
 * coloured deck. SOLO's has a ring painted on it (its name is written inside: Lobby.jsx);
 * a team pad has its seats painted on (they light up as players take them) and a board
 * behind it with a pawn on top per seat.
 * Every layer sits at its own height (plinth 0.08, trim 0.095, deck 0.12, paint 0.14).
 */
function playPad(b, pad) {
  const { x, z, radius: r } = pad
  const look = padLook(pad)
  const solo = pad.size === 1
  b.add(CYL48, { position: [x, 0.04, z], scale: [r + 0.5, 0.08, r + 0.5], color: PALETTE.trim })
  b.add(CYL48, { position: [x, 0.0875, z], scale: [r + 0.2, 0.015, r + 0.2], color: '#ffffff' })
  b.add(CYL48, { position: [x, 0.1075, z], scale: [r, 0.025, r], color: look.deck, style: STYLE.PLATE })
  b.add(RING, { position: [x, 0.12, z], rotation: [Math.PI / 2, 0, 0], scale: [r + 0.08, r + 0.08, 1], color: look.glow, style: STYLE.GLOW })
  const studs = solo ? 26 : 10
  for (let k = 0; k < studs; k += 1) {
    const a = (k / studs) * Math.PI * 2
    b.box(x + Math.cos(a) * (r + 0.36), 0.07, z + Math.sin(a) * (r + 0.36), 0.2, 0.08, 0.2, look.glow, STYLE.GLOW, [0, -a, 0])
  }
  if (solo) {
    b.add(RING_THIN, { position: [x, 0.12, z], rotation: [Math.PI / 2, 0, 0], scale: [r * 0.78, r * 0.78, 1], color: look.glow, style: STYLE.GLOW })
    return
  }
  const [[lx, pz], [rx]] = padPosts(pad)
  for (const [sx, sz] of seatSpots(pad)) paintedPerson(b, sx, sz, 0.62, 0.13, '#ffffff')
  // The board on two legs, with a pawn on top for each seat.
  for (const px of [lx, rx]) {
    b.box(px, 0.12, pz, 0.5, 0.24, 0.5, PALETTE.trim, STYLE.SMOOTH)
    b.box(px, 1.55, pz, 0.24, 3.1, 0.24, look.deck, STYLE.PLATE)
    b.add(BALL, { position: [px, 3.25, pz], scale: [0.17, 0.17, 0.17], color: look.glow, style: STYLE.GLOW })
  }
  const w = rx - lx - 0.3
  b.box(x, 2.35, pz, w, 1.2, 0.14, look.trim, STYLE.SMOOTH)
  b.box(x, 2.35, pz - 0.035, w + 0.2, 1.36, 0.08, look.glow, STYLE.GLOW)
  b.box(x, 3.02, pz, w + 0.1, 0.12, 0.3, '#ffffff', STYLE.SMOOTH)
  for (let k = 0; k < pad.size; k += 1) pawn(b, x + (k - (pad.size - 1) / 2) * 0.55, 3.08, pz, 0.55, look.glow)
}

/**
 * A team section's banner, high over its pads' boards: two tall posts in the chapter's
 * colour with glowing knobs, and the board the chapter's name hangs on (Lobby.jsx).
 */
function sectionBanner(b, chapter) {
  const look = PAD_LOOKS[chapter]
  const { minX, maxX } = sectionSpan(chapter)
  const z = SECTION_SIGN_Z
  for (const x of [minX, maxX]) {
    b.box(x, 0.15, z, 0.8, 0.3, 0.8, PALETTE.trim, STYLE.SMOOTH)
    b.box(x, 3.0, z, 0.46, 6.0, 0.46, look.deck, STYLE.PLATE)
    b.box(x, 6.06, z, 0.66, 0.14, 0.66, '#ffffff', STYLE.SMOOTH)
    b.add(BALL, { position: [x, 6.38, z], scale: [0.3, 0.3, 0.3], color: look.glow, style: STYLE.GLOW })
  }
  const w = maxX - minX
  b.box((minX + maxX) / 2, 5.0, z, w - 0.5, 1.5, 0.18, look.trim, STYLE.SMOOTH)
  b.box((minX + maxX) / 2, 5.0, z - 0.045, w - 0.3, 1.68, 0.1, look.glow, STYLE.GLOW)
}

function bench(b, { x, z, yaw }) {
  const t = [0, yaw, 0]
  // Built facing +X, then turned: seat, back and four legs.
  const at = (lx, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz]
  const [sx, sz] = at(0, 0)
  b.box(sx, 0.48, sz, 0.55, 0.1, 1.9, PALETTE.wood, STYLE.PARQUET, t)
  const [bx, bz] = at(-0.27, 0)
  b.box(bx, 0.85, bz, 0.08, 0.5, 1.9, PALETTE.wood, STYLE.PARQUET, t)
  for (const [lx, lz] of [
    [0.2, 0.8],
    [0.2, -0.8],
    [-0.2, 0.8],
    [-0.2, -0.8],
  ]) {
    const [px, pz] = at(lx, lz)
    b.box(px, 0.22, pz, 0.08, 0.44, 0.08, PALETTE.trim, STYLE.SMOOTH, t)
  }
}

/** A big metal bin heaped with brass screws, a giant one standing in it. */
function screwBin(b, x, z, size) {
  b.box(x, 0.45, z, size, 0.9, size, '#3a6fd8', STYLE.PLATE)
  b.box(x, 0.92, z, size + 0.12, 0.08, size + 0.12, PALETTE.trim, STYLE.SMOOTH)
  for (let k = 0; k < 14; k += 1) {
    const a = k * 2.399
    const r = (size / 2 - 0.35) * Math.sqrt((k + 0.5) / 14)
    b.add(GEM, { position: [x + Math.cos(a) * r, 0.95 + (k % 3) * 0.06, z + Math.sin(a) * r], scale: [0.26, 0.12, 0.26], color: k % 5 ? PALETTE.brass : '#c9d2dc' })
  }
  b.add(CYL, { position: [x, 2.0, z], scale: [0.16, 2.2, 0.16], color: PALETTE.brass })
  b.add(CYL, { position: [x, 3.2, z], scale: [0.45, 0.2, 0.45], color: PALETTE.brass })
  b.box(x, 3.31, z, 0.6, 0.04, 0.12, '#5a4214', STYLE.SMOOTH)
  b.box(x, 3.31, z, 0.12, 0.034, 0.6, '#5a4214', STYLE.SMOOTH)
}

/** A round table under a striped parasol, with four stools. */
function picnic(b, x, z, color) {
  b.add(CYL, { position: [x, 0.74, z], scale: [0.8, 0.08, 0.8], color: '#ffffff' })
  b.add(CYL8, { position: [x, 0.37, z], scale: [0.08, 0.74, 0.08], color: PALETTE.trim })
  b.add(CYL8, { position: [x, 1.6, z], scale: [0.05, 2.4, 0.05], color: '#e8edf2' })
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    b.add(CYL, { position: [x + Math.cos(a) * 1.1, 0.24, z + Math.sin(a) * 1.1], scale: [0.26, 0.48, 0.26], color })
  }
  // The parasol: a faceted canopy with a white cap.
  b.add(CONE, { position: [x, 2.62, z], scale: [1.75, 0.62, 1.75], color })
  b.add(CONE, { position: [x, 2.98, z], scale: [0.55, 0.2, 0.55], color: '#ffffff' })
  b.add(CYL8, { position: [x, 3.12, z], scale: [0.06, 0.1, 0.06], color: PALETTE.trim })
}

export function buildYard() {
  const b = new PropBuilder()

  // --- Ground ----------------------------------------------------------------------
  // Outside the garage (seen over its walls from high up): asphalt.
  b.box(0, -0.6, 0, 420, 1, 420, '#5d6168', STYLE.SMOOTH)
  buildGarage(b)
  const yw = PLAZA.maxX - PLAZA.minX + 6
  const yd = PLAZA.maxZ - PLAZA.minZ + 6
  const ycx = (PLAZA.maxX + PLAZA.minX) / 2
  const ycz = (PLAZA.maxZ + PLAZA.minZ) / 2
  b.box(ycx, -0.1, ycz, yw, 0.2, yd, PALETTE.paving, STYLE.TILES)
  // A yellow safety kerb round the yard.
  b.box(ycx, 0.06, PLAZA.maxZ + 3, yw + 0.6, 0.32, 0.6, '#ffc21a', STYLE.SMOOTH)
  b.box(PLAZA.minX - 3, 0.06, ycz, 0.6, 0.32, yd, '#ffc21a', STYLE.SMOOTH)
  b.box(PLAZA.maxX + 3, 0.06, ycz, 0.6, 0.32, yd, '#ffc21a', STYLE.SMOOTH)

  // The crossroads: where the side paths to the stations leave the main one (nothing on
  // it: the way to the play pads is clear).
  const cz0 = CROSSROADS.z
  // The main path: straight from the spawn to the SOLO pad, with borders (its glowing
  // arrows are in Lobby.jsx); then on past it to the play plaza and its team sections.
  const pathColor = '#f3c98b'
  const edge = '#d9a35a'
  const soloFront = SOLO_PAD.z + SOLO_PAD.radius + 0.5
  path(b, 0, 26, 0, SOLO_PAD.z + SOLO_PAD.radius - 0.5, 6, pathColor, 0.04)
  for (const x of [-3.1, 3.1]) b.box(x, 0.0275, (26 + soloFront) / 2, 0.22, 0.055, 26 - soloFront, edge, STYLE.SMOOTH)
  path(b, 0, SOLO_PAD.z - SOLO_PAD.radius + 0.5, 0, PLAY_PLAZA.maxZ - 0.3, 4, pathColor, 0.04)
  // The play plaza: a tiled deck with a navy kerb, the team sections in a row on it.
  const pw = PLAY_PLAZA.maxX - PLAY_PLAZA.minX
  const pd = PLAY_PLAZA.maxZ - PLAY_PLAZA.minZ
  const pcx = (PLAY_PLAZA.maxX + PLAY_PLAZA.minX) / 2
  const pcz = (PLAY_PLAZA.maxZ + PLAY_PLAZA.minZ) / 2
  b.box(pcx, 0.01, pcz, pw, 0.02, pd, '#d3dceb', STYLE.TILES)
  for (const kz of [PLAY_PLAZA.minZ, PLAY_PLAZA.maxZ]) b.box(pcx, 0.0175, kz, pw + 0.3, 0.035, 0.3, PALETTE.trim, STYLE.SMOOTH)
  for (const kx of [PLAY_PLAZA.minX, PLAY_PLAZA.maxX]) b.box(kx, 0.0175, pcz, 0.3, 0.035, pd, PALETTE.trim, STYLE.SMOOTH)
  for (const pad of PLAY_PADS) playPad(b, pad)
  for (const { chapter } of PAD_SECTIONS) sectionBanner(b, chapter)
  for (const s of STATIONS) {
    if (s.id === 'quests') {
      path(b, -3.25, s.z, s.x + s.radius - 0.2, s.z, 2.4, pathColor)
      continue
    }
    const dir = Math.sign(s.x)
    path(b, dir * 3.2, cz0, s.x - dir * (s.radius - 0.3), s.z, 2.8, pathColor)
  }

  // --- The factory ------------------------------------------------------------------
  const fw = FACTORY.maxX - FACTORY.minX
  const fd = FACTORY.maxZ - FACTORY.minZ
  const fcz = (FACTORY.maxZ + FACTORY.minZ) / 2
  const fh = FACTORY.height
  const door = ELEVATOR.maxX - ELEVATOR.minX
  const side = (fw - door) / 2
  const front = FACTORY.maxZ
  b.box(-(door / 2 + side / 2), fh / 2, fcz, side, fh, fd, PALETTE.factory, STYLE.WINDOWS)
  b.box(door / 2 + side / 2, fh / 2, fcz, side, fh, fd, PALETTE.factory, STYLE.WINDOWS)
  b.box(0, (5.5 + fh) / 2, fcz, door, fh - 5.5, fd, PALETTE.factory, STYLE.SMOOTH)
  b.box(0, fh + 0.3, fcz, fw + 0.8, 0.6, fd + 0.8, PALETTE.trim, STYLE.SMOOTH)
  for (let k = 0; k < 4; k += 1) b.box(-fw / 2 + 4 + k * 8, fh + 1.7, fcz, 6, 2.2, fd - 2, PALETTE.factoryDark, STYLE.PLATE, [0, 0, 0.35])
  for (const x of [-11, 11]) {
    b.add(CYL, { position: [x, fh + 4, fcz - 3], scale: [1.1, 7, 1.1], color: PALETTE.accent })
    b.add(CYL, { position: [x, fh + 5.5, fcz - 3], scale: [1.16, 0.5, 1.16], color: '#ffffff' })
    b.add(CYL, { position: [x, fh + 7.6, fcz - 3], scale: [1.3, 0.4, 1.3], color: PALETTE.trim })
  }
  for (const x of [FACTORY.minX, FACTORY.maxX]) b.box(x, fh / 2, front + 0.1, 1.2, fh, 1.2, PALETTE.trim, STYLE.SMOOTH)
  // A navy band across the front, and the board the title hangs on: an orange frame
  // studded with bulbs round a navy back.
  b.box(0, 5.9, front + 0.12, fw - 1.4, 0.7, 0.24, PALETTE.trim, STYLE.SMOOTH)
  b.box(0, 9.6, front + 0.3, 18.4, 5, 0.3, PALETTE.trim, STYLE.SMOOTH)
  b.box(0, 9.6, front + 0.2, 19, 5.8, 0.3, PALETTE.accent, STYLE.SMOOTH)
  let bulb = 0
  const addBulb = (x, y) => {
    b.add(GEM, { position: [x, y, front + 0.38], scale: [0.11, 0.11, 0.11], color: bulb % 2 ? '#ffd23a' : '#fff3b8', style: STYLE.GLOW })
    bulb += 1
  }
  for (let x = -9.0; x <= 9.01; x += 0.6) {
    addBulb(x, 12.3)
    addBulb(x, 6.9)
  }
  for (let y = 7.5; y <= 11.71; y += 0.6) {
    addBulb(-9.35, y)
    addBulb(9.35, y)
  }
  // The goods elevator, its doors shut (the play pads are how you start), a hazard-striped
  // apron in front and an awning over it.
  for (const dir of [-1, 1]) b.box((dir * door) / 4, 2.75, front - 0.3, door / 2 - 0.04, 5.5, 0.24, PALETTE.metal, STYLE.PLATE)
  b.box(0, 2.75, front - 0.32, 0.08, 5.5, 0.22, '#1b2030', STYLE.SMOOTH)
  b.box(0, 0.02, front + 0.7, door + 0.8, 0.04, 1.2, '#ffc21a', STYLE.STRIPES)
  b.box(0, 5.25, front + 1.15, door + 2.6, 0.22, 2.3, PALETTE.accent, STYLE.SMOOTH, [-0.12, 0, 0])
  b.box(0, 5.06, front + 2.27, door + 2.6, 0.3, 0.12, '#ffffff', STYLE.SMOOTH, [-0.12, 0, 0])
  for (const x of [-door / 2 - 1.1, door / 2 + 1.1]) b.add(CYL8, { position: [x, 2.5, front + 2.1], scale: [0.1, 5, 0.1], color: PALETTE.trim })
  // Conveyor belts and the machines they run into.
  for (const belt of BELTS) {
    const cx = (belt.minX + belt.maxX) / 2
    const len = belt.maxX - belt.minX - 1.6
    b.box(cx, 0.4, belt.z, len, 0.8, 1.3, '#3a3f4a', STYLE.SMOOTH)
    b.box(cx, 0.83, belt.z, len, 0.06, 1.1, '#23262d', STYLE.BELT)
    for (const x of [belt.minX + 0.8, belt.maxX - 0.8]) {
      b.box(x, 1.0, belt.z, 1.5, 2.0, 1.6, PALETTE.accent, STYLE.PLATE)
      b.box(x, 1.05, belt.z, 1.52, 0.9, 1.0, '#101218', STYLE.SMOOTH)
      b.box(x, 2.1, belt.z, 1.7, 0.2, 1.8, PALETTE.trim, STYLE.SMOOTH)
    }
  }

  // --- Stations -----------------------------------------------------------------
  for (const s of STATIONS) {
    const color = PALETTE[s.id]
    b.add(RING, { position: [s.x, 0.06, s.z], rotation: [Math.PI / 2, 0, 0], scale: [s.radius, s.radius, 1], color, style: STYLE.GLOW })
    if (s.id === 'quests') {
      // A notice board with notes pinned to it.
      const z = s.z + 1.8
      b.box(s.x - 1.75, 1.45, z, 0.2, 2.9, 0.2, PALETTE.wood, STYLE.SMOOTH)
      b.box(s.x + 1.75, 1.45, z, 0.2, 2.9, 0.2, PALETTE.wood, STYLE.SMOOTH)
      b.box(s.x, 2.1, z, 3.6, 1.9, 0.14, '#c99a62', STYLE.PARQUET)
      b.box(s.x, 3.12, z, 3.9, 0.18, 0.4, PALETTE.trim, STYLE.SMOOTH)
      const notes = [
        [-1.1, 2.55, 0.1, '#fff4d6'],
        [-0.35, 2.4, -0.08, '#ffe27a'],
        [0.45, 2.6, 0.06, '#ffffff'],
        [1.15, 2.35, -0.12, '#bfe8ff'],
        [-0.8, 1.6, -0.05, '#ffd6e2'],
        [0.9, 1.65, 0.1, '#fff4d6'],
      ]
      for (const [nx, ny, rot, c] of notes) {
        b.box(s.x + nx, ny, z - 0.09, 0.55, 0.65, 0.02, c, STYLE.SMOOTH, [0, 0, rot])
        b.add(CYL8, { position: [s.x + nx, ny + 0.24, z - 0.11], rotation: [Math.PI / 2, 0, 0], scale: [0.04, 0.03, 0.04], color: '#e8323a' })
      }
      continue
    }
    const dir = Math.sign(s.x)
    const cx = s.x + dir * 4.25
    b.box(cx, 0.6, s.z, 2.5, 1.2, 8, PALETTE.wood, STYLE.PARQUET)
    b.box(cx, 1.26, s.z, 2.7, 0.1, 8.2, color, STYLE.SMOOTH)
    // The back wall behind the counter, and a canopy on posts.
    b.box(cx + dir * 1.55, 2.2, s.z, 0.3, 4.4, 8.6, color, STYLE.PLATE)
    for (const z of [s.z - 3.9, s.z + 3.9]) b.box(cx - dir * 0.9, 2.1, z, 0.22, 4.2, 0.22, PALETTE.trim, STYLE.SMOOTH)
    b.box(cx + dir * 0.25, 4.45, s.z, 3.5, 0.25, 8.9, color, STYLE.SMOOTH, [0, 0, dir * 0.12])
    b.box(cx - dir * 1.45, 4.25, s.z, 0.12, 0.45, 8.9, '#ffffff', STYLE.SMOOTH)
    if (s.id === 'skins') {
      for (let k = 0; k < 5; k += 1) {
        const c = ['#ff3b55', '#2fa8ff', '#5df0b0', '#ffd24a', '#8b5cff'][k]
        b.add(CYL, { position: [cx, 1.62, s.z - 3 + k * 1.5], scale: [0.35, 0.62, 0.35], color: c })
        b.add(CYL, { position: [cx, 1.95, s.z - 3 + k * 1.5], scale: [0.36, 0.05, 0.36], color: '#d7dbe0' })
        // Paint splats on the back wall.
        b.add(CYL, { position: [cx + dir * 1.37, 2.4 + (k % 2) * 0.9, s.z - 3.2 + k * 1.6], rotation: [0, 0, Math.PI / 2], scale: [0.4 + (k % 3) * 0.12, 0.04, 0.4 + (k % 3) * 0.12], color: c })
      }
    } else {
      // A workbench: tool chests on the counter, tools hung on the back wall.
      for (let k = 0; k < 3; k += 1) b.box(cx, 1.58, s.z - 2.5 + k * 2.5, 0.9, 0.55, 1.4, ['#e8323a', '#2a2e35', '#ffcc22'][k], STYLE.SMOOTH)
      for (let k = 0; k < 6; k += 1) {
        const z = s.z - 3.2 + k * 1.3
        b.box(cx + dir * 1.36, 2.6 + (k % 2) * 0.5, z, 0.06, 0.9, 0.14, '#cdd5de', STYLE.SMOOTH, [k * 0.3, 0, 0])
        b.box(cx + dir * 1.36, 3.0 + (k % 2) * 0.5, z, 0.08, 0.22, 0.34, ['#ffcc22', '#ff5a4a', '#2fa8ff'][k % 3], STYLE.SMOOTH)
      }
    }
  }

  // --- Leaderboard frames -------------------------------------------------------
  // Each: posts with glowing knobs, a gold frame round the board, an orange bar on top and
  // a trophy crowning it.
  for (const board of LEADERBOARDS) {
    const dir = board.x < 0 ? -1 : 1
    const bx = board.x + dir * 0.35
    for (const dz of [-4.0, 4.0]) {
      b.box(board.x + dir * 0.3, 0.2, board.z + dz, 0.7, 0.4, 0.7, PALETTE.trim, STYLE.SMOOTH)
      b.box(board.x + dir * 0.3, 3.3, board.z + dz, 0.4, 6.6, 0.4, PALETTE.trim, STYLE.SMOOTH)
      b.add(GEM, { position: [board.x + dir * 0.3, 6.85, board.z + dz], scale: [0.26, 0.26, 0.26], color: '#ffd23a', style: STYLE.GLOW })
    }
    b.box(bx, 3.6, board.z, 0.3, 4.8, 7.2, PALETTE.trim, STYLE.SMOOTH)
    b.box(board.x + dir * 0.42, 3.6, board.z, 0.3, 5.2, 7.6, '#ffc21a', STYLE.SMOOTH)
    b.box(bx, 6.36, board.z, 0.5, 0.3, 8.2, PALETTE.accent, STYLE.SMOOTH)
    b.box(bx, 6.6, board.z, 0.8, 0.2, 0.9, '#d99a12', STYLE.SMOOTH)
    b.add(CYL8, { position: [bx, 6.9, board.z], scale: [0.1, 0.4, 0.1], color: '#ffc21a' })
    b.add(CUP, { position: [bx, 7.38, board.z], scale: [0.5, 0.6, 0.5], color: '#ffc21a' })
    for (const side of [-1, 1]) b.add(RING, { position: [bx, 7.45, board.z + side * 0.5], rotation: [0, Math.PI / 2, 0], scale: [0.24, 0.24, 2], color: '#ffc21a' })
    b.add(GEM, { position: [bx, 7.95, board.z], scale: [0.16, 0.16, 0.16], color: '#fff3b8', style: STYLE.GLOW })
  }

  // --- Benches, crates, screw bins -------------------------------------------------------
  for (const seat of BENCHES) bench(b, seat)
  for (const [x, z, s] of CRATES) b.box(x, s / 2 + 0.001, z, s, s, s, '#d39a5a', STYLE.PARQUET)
  for (const [x, z, s] of PLANTERS) screwBin(b, x, z, s)
  PICNICS.forEach(([x, z], i) => picnic(b, x, z, ['#ff5a4a', '#25b5a8', '#ff8a2a'][i % 3]))

  return b.build()
}

/** A few puffy clouds high above, in one mesh (the caller turns it slowly). */
export function buildClouds() {
  const b = new PropBuilder()
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2 + 0.4
    const r = 70 + (k % 3) * 25
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const y = 42 + (k % 4) * 6
    for (let p = 0; p < 5; p += 1) {
      b.add(PUFF, { position: [x + (p - 2) * 3.2, y + Math.sin(p * 1.7) * 1.2, z + Math.cos(p * 2.3) * 1.5], scale: [4 - Math.abs(p - 2) * 0.7, 2.6 - Math.abs(p - 2) * 0.4, 3.2], color: '#ffffff', style: STYLE.SMOOTH })
    }
  }
  return b.build()
}
