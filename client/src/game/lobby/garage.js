import { CylinderGeometry, IcosahedronGeometry, TorusGeometry } from 'three'

import { GARAGE } from '@shared/world'

import { STYLE } from '../materials'
import { PALETTE } from '../sceneStyle'

/**
 * The giant screw garage the yard stands in: corrugated walls on steel columns with a
 * hazard band and a strip of high windows, a big roll-up door, roof trusses with metal
 * panels down the sides (open down the middle, for the sky), industrial lamps, and the
 * clutter of a garage along the walls - tyre stacks, oil drums, a tool wall, shelving,
 * giant screws and a nut and bolt. Built into the yard's one merged mesh (yard.js).
 */

const CYL = new CylinderGeometry(1, 1, 1, 20)
const CYL6 = new CylinderGeometry(1, 1, 1, 6)
const CYL8 = new CylinderGeometry(1, 1, 1, 8)
const CONE_SHADE = new CylinderGeometry(0.25, 1, 1, 12, 1, true)
const TIRE = new TorusGeometry(1, 0.42, 8, 18)
const RIM = new TorusGeometry(1, 0.12, 6, 18)
const GEM = new IcosahedronGeometry(1, 0)

const WALL = '#9cb0c6'
const WALL_DARK = '#6f7d8e'
const CONCRETE = '#7d838c'
const STEEL = PALETTE.trim
const HAZARD = '#ffc21a'

/**
 * One wall, from (ax, az) to (bx, bz), its inside facing `inward` (a unit [x, z]):
 * concrete footing, a hazard band, corrugated sheets, a strip of windows, and a column
 * every 10 m (but not across `gaps`: `[from, to]` along the wall, where doors are).
 */
function wall(b, ax, az, bx, bz, inward, gaps = []) {
  const length = Math.hypot(bx - ax, bz - az)
  const cx = (ax + bx) / 2
  const cz = (az + bz) / 2
  const yaw = -Math.atan2(bz - az, bx - ax)
  const h = GARAGE.height
  const t = 0.6
  const at = (y, height, color, style, inset = 0) => b.box(cx + inward[0] * inset, y, cz + inward[1] * inset, length, height, t, color, style, [0, yaw, 0])
  at(1.2, 2.4, CONCRETE, STYLE.SMOOTH)
  // The hazard band: yellow and black blocks, just proud of the wall.
  const n = Math.round(length / 1.2)
  const ux = (bx - ax) / length
  const uz = (bz - az) / length
  const inGap = (s, pad) => gaps.some(([from, to]) => s > from - pad && s < to + pad)
  for (let k = 0; k < n; k += 1) {
    const s = (k + 0.5) * (length / n) - length / 2
    if (inGap(s, 0.6)) continue
    b.box(cx + ux * s + inward[0] * 0.33, 2.6, cz + uz * s + inward[1] * 0.33, length / n, 0.4, 0.08, k % 2 ? '#1b1d22' : HAZARD, STYLE.SMOOTH, [0, yaw, 0])
  }
  at((2.8 + 10) / 2, 10 - 2.8, WALL, STYLE.PLATE)
  at(11.2, 2.4, '#4d6688', STYLE.WINDOWS)
  at((12.4 + h) / 2, h - 12.4, WALL_DARK, STYLE.PLATE)
  // Columns: steel I-beams standing proud of the wall.
  for (let s = -length / 2; s <= length / 2 + 0.01; s += 10) {
    if (inGap(s, 1)) continue
    const px = cx + ux * s + inward[0] * 0.5
    const pz = cz + uz * s + inward[1] * 0.5
    b.box(px, (h + 0.06) / 2, pz, 0.9, h + 0.06, 0.5, STEEL, STYLE.SMOOTH, [0, yaw, 0])
    b.box(px, 0.3, pz, 1.2, 0.6, 0.8, CONCRETE, STYLE.SMOOTH, [0, yaw, 0])
  }
}

/** A roll-up garage door in the south wall, slats and all, in a hazard-striped frame. */
function rollUpDoor(b, x, z, width, height) {
  b.box(x, height / 2, z - 0.35, width, height, 0.12, '#c4ccd6', STYLE.STRIPES)
  for (const side of [-1, 1]) b.box(x + side * (width / 2 + 0.35), height / 2, z - 0.4, 0.7, height, 0.3, HAZARD, STYLE.SMOOTH)
  b.box(x, height + 0.49, z - 0.6, width + 1.4, 0.96, 0.5, STEEL, STYLE.SMOOTH)
  b.box(x, 0.06, z - 1.4, width, 0.04, 1.6, HAZARD, STYLE.STRIPES)
}

/** A truss across the garage at `z`: top and bottom chords, posts, and a lamp every 16 m. */
function truss(b, z) {
  const w = GARAGE.maxX - GARAGE.minX
  const top = GARAGE.height + 0.4
  b.box(0, top, z, w, 0.5, 0.5, STEEL, STYLE.SMOOTH)
  b.box(0, top - 1.6, z, w, 0.35, 0.35, STEEL, STYLE.SMOOTH)
  for (let x = GARAGE.minX + 4; x < GARAGE.maxX; x += 4) b.box(x, top - 0.8, z, 0.22, 1.6, 0.22, STEEL, STYLE.SMOOTH, [0, 0, (x / 4) % 2 ? 0.5 : -0.5])
  for (const x of [-24, -8, 8, 24]) {
    b.add(CYL8, { position: [x, top - 3.2, z], scale: [0.04, 3.2, 0.04], color: '#2a2e35' })
    b.add(CONE_SHADE, { position: [x, top - 5, z], scale: [0.75, 0.5, 0.75], color: '#3d7a6e' })
    b.add(GEM, { position: [x, top - 5.3, z], scale: [0.28, 0.28, 0.28], color: '#fff3c4', style: STYLE.GLOW })
  }
}

/** A stack of `n` tyres at (x, z). */
function tyres(b, x, z, n) {
  for (let k = 0; k < n; k += 1) {
    const y = 0.32 + k * 0.62
    const dx = (k % 2) * 0.08
    b.add(TIRE, { position: [x + dx, y, z], rotation: [Math.PI / 2, 0, 0], scale: [0.62, 0.62, 0.75], color: '#22252b' })
    b.add(RIM, { position: [x + dx, y, z], rotation: [Math.PI / 2, 0, 0], scale: [0.36, 0.36, 1.2], color: '#c9d2dc' })
  }
}

/** An oil drum at (x, z) in `color`, with its rings and lid. */
function drum(b, x, z, color) {
  b.add(CYL, { position: [x, 0.65, z], scale: [0.45, 1.3, 0.45], color })
  for (const y of [0.35, 0.95]) b.add(CYL, { position: [x, y, z], scale: [0.465, 0.06, 0.465], color: '#2a2e35' })
  b.add(CYL, { position: [x, 1.32, z], scale: [0.42, 0.04, 0.42], color: '#c9d2dc' })
}

/** A giant screw standing on its point's base, head up (h: how tall). */
function giantScrew(b, x, z, h, color = PALETTE.brass) {
  b.add(CYL, { position: [x, h * 0.42, z], scale: [h * 0.09, h * 0.84, h * 0.09], color })
  for (let y = h * 0.08; y < h * 0.8; y += h * 0.07) b.add(CYL, { position: [x, y, z], scale: [h * 0.125, h * 0.022, h * 0.125], color: '#c99a3a' })
  b.add(CYL, { position: [x, h * 0.88, z], scale: [h * 0.24, h * 0.1, h * 0.24], color })
  b.box(x, h * 0.935, z, h * 0.36, h * 0.03, h * 0.07, '#5a4214', STYLE.SMOOTH)
  b.box(x, h * 0.935, z, h * 0.07, h * 0.026, h * 0.36, '#5a4214', STYLE.SMOOTH)
}

/** A big hex nut lying flat at (x, z). */
function nut(b, x, z, r) {
  b.add(CYL6, { position: [x, r * 0.35, z], scale: [r, r * 0.7, r], color: '#aeb8c4' })
  b.add(CYL, { position: [x, r * 0.36, z], scale: [r * 0.5, r * 0.72, r * 0.5], color: '#2a2e35' })
}

/** A pegboard tool wall against the west wall: a giant wrench, screwdriver and hammer. */
function toolWall(b, z) {
  const x = GARAGE.minX + 0.45
  b.box(x, 4.4, z, 0.12, 4.4, 9, '#c99a62', STYLE.STUDS)
  b.box(x + 0.08, 6.7, z, 0.1, 0.25, 9.2, STEEL, STYLE.SMOOTH)
  // Wrench: a handle with open jaws.
  b.box(x + 0.2, 4.4, z - 2.8, 0.12, 2.6, 0.38, '#c9d2dc', STYLE.SMOOTH, [0.4, 0, 0])
  b.add(RIM, { position: [x + 0.2, 5.6, z - 3.3], rotation: [0, Math.PI / 2, 0], scale: [0.5, 0.5, 1.4], color: '#c9d2dc' })
  // Screwdriver: red handle, steel shaft.
  b.add(CYL, { position: [x + 0.25, 5.2, z], scale: [0.22, 1.2, 0.22], color: '#e8323a' })
  b.add(CYL8, { position: [x + 0.25, 3.8, z], scale: [0.07, 1.8, 0.07], color: '#c9d2dc' })
  // Hammer: a wooden handle and a dark head.
  b.box(x + 0.22, 4.2, z + 2.9, 0.16, 2.6, 0.2, PALETTE.wood, STYLE.SMOOTH)
  b.box(x + 0.3, 5.5, z + 2.9, 0.4, 0.45, 1.1, '#2a2e35', STYLE.SMOOTH)
}

/** Shelving against the east wall, crates on its shelves. */
function shelving(b, z, length) {
  const x = GARAGE.maxX - 1.1
  for (const dz of [-length / 2, 0, length / 2]) b.box(x, 2.6, z + dz, 0.16, 5.2, 0.16, '#3a6fd8', STYLE.SMOOTH)
  const colors = ['#d39a5a', '#ffcc22', '#e8323a', '#25b5a8', '#8b5cff']
  for (const [k, y] of [0.5, 2.1, 3.7].entries()) {
    b.box(x, y, z, 1.4, 0.12, length, '#ff8a2a', STYLE.SMOOTH)
    for (let i = 0; i < Math.floor(length / 1.4); i += 1) {
      const s = 0.5 + ((i * 7 + k * 3) % 5) * 0.08
      b.box(x, y + 0.06 + s / 2, z - length / 2 + 0.8 + i * 1.4, 0.9, s, 0.9, colors[(i + k) % colors.length], i % 2 ? STYLE.PARQUET : STYLE.SMOOTH)
    }
  }
}

/** The garage round the yard: floor, walls, door, roof and everything along the walls. */
export function buildGarage(b) {
  const { minX, maxX, minZ, maxZ, height } = GARAGE
  const w = maxX - minX
  const d = maxZ - minZ
  // The garage floor (concrete, a touch under the yard's paving).
  b.box((minX + maxX) / 2, -0.13, (minZ + maxZ) / 2, w, 0.2, d, '#a3a7ae', STYLE.TILES)
  // Walls: west, east, north (behind the factory), south (with the roll-up door).
  wall(b, minX, minZ, minX, maxZ, [1, 0])
  wall(b, maxX, minZ, maxX, maxZ, [-1, 0])
  // North and south fit between the side walls (whose columns stand in the corners).
  const ends = [
    [-w / 2 - 1, -w / 2 + 1],
    [w / 2 - 1, w / 2 + 1],
  ]
  wall(b, minX + 0.3, minZ, maxX - 0.3, minZ, [0, 1], ends)
  wall(b, minX + 0.3, maxZ, maxX - 0.3, maxZ, [0, -1], [
    ...ends,
    [-9.7, 9.7],
    [-30.7, -21.3],
    [21.3, 30.7],
  ])
  rollUpDoor(b, 0, maxZ, 18, 9)
  for (const side of [-1, 1]) rollUpDoor(b, side * 26, maxZ, 8, 6)
  // Roof: trusses across, metal panels down each side, open to the sky in the middle.
  for (let z = maxZ - 6; z > minZ + 2; z -= 14) truss(b, z)
  for (const side of [-1, 1]) {
    const x = side * (maxX - 8)
    b.box(x, height + 0.9, (minZ + maxZ) / 2, 16, 0.25, d, '#7f8fa3', STYLE.PLATE, [0, 0, side * -0.12])
  }
  // Along the walls: tyres, drums, giant screws, a nut, the tool wall and shelving.
  for (const [x, z, n] of [
    [minX + 2, maxZ - 2.5, 5],
    [minX + 3.4, maxZ - 2, 3],
    [maxX - 2, maxZ - 2.5, 4],
    [maxX - 3.4, maxZ - 2.2, 2],
    [minX + 2, minZ + 9, 4],
    [maxX - 2, minZ + 9, 5],
  ]) {
    tyres(b, x, z, n)
  }
  const drumColors = ['#e8323a', '#2f7fe8', '#ffcc22', '#25b5a8']
  for (const [k, [x, z]] of [
    [minX + 1.6, 20],
    [minX + 2.6, 21],
    [minX + 1.6, 22],
    [maxX - 1.6, 26],
    [maxX - 2.6, 27],
    [maxX - 1.6, 28],
    [minX + 1.6, -20],
    [maxX - 1.6, -18],
  ].entries()) {
    drum(b, x, z, drumColors[k % drumColors.length])
  }
  giantScrew(b, minX + 2.6, -4, 7)
  giantScrew(b, maxX - 2.6, 6, 8, '#c9d2dc')
  giantScrew(b, minX + 3, 32, 5.5, '#c9d2dc')
  giantScrew(b, maxX - 3, -30, 6)
  nut(b, maxX - 3, 16, 1.4)
  nut(b, minX + 3, -32, 1.1)
  toolWall(b, 8)
  shelving(b, -6, 12)
}
