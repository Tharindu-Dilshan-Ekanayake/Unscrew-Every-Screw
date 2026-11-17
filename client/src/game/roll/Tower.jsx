import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Euler,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'

import { mulberry32 } from '@shared/rng'
import { PLAZA } from '@shared/world'

import { sfx } from '../../audio/sfx'
import { getQuality } from '../../store/quality'
import { asToyInstance, BlockSet, createBoxInstances, disposeBlocks, PropBuilder } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { venueOf } from '../sceneStyle'
import { activeWorld } from '../worldLook'
import { spawnDebris } from './debrisPool'
import {
  ceilingY,
  FLOORS,
  FLOORS_ABOVE_GROUND,
  floorY,
  GROUND_Y,
  HOLE_HALF,
  HOTEL,
  ROOF_Y,
  ROOM_HALF,
  SHELL_HALF,
  SKYLIGHT_HALF,
  SLAB,
} from './dropPath'
import { roll } from './rollControl'
import { roomLayout } from './roomThemes'

/**
 * Everything below the lobby's cliff edge: the mountain the lobby stands on, a sea of
 * blocky clouds, the city far below, and the hotel - its walls, its roof with the glass
 * skylight, the red target round it and the big HOTEL sign - all in one InstancedMesh
 * plus one merged prop mesh, built once per world.
 *
 * Inside, the hotel has sixty floors, but only the two or three around the falling phone
 * are ever built: their walls, floors (whole, or broken open where the phone came
 * through) and furniture go into one more InstancedMesh, refilled only when something
 * changes - the phone reaching a new floor, a slab breaking, furniture smashed. Cracks are
 * one more mesh, the glass one more: six draw calls for the whole drop, the same at the
 * first floor or the sixtieth.
 */

const INTERIOR_MAX = 1600
/** A room's inside face of the walls, the panelling's height, and its raised panels' places. */
const IN_EDGE = ROOM_HALF - 0.2
const DADO = 3
const PANELS = [-8.4, -5.6, -2.8, 0, 2.8, 5.6, 8.4]
/** Each wall's slab: offset from the room's middle and size (x, z). */
const WALLS = [
  [0, -ROOM_HALF, (ROOM_HALF + 0.2) * 2, 0.4],
  [0, ROOM_HALF, (ROOM_HALF + 0.2) * 2, 0.4],
  [-ROOM_HALF, 0, 0.4, (ROOM_HALF + 0.2) * 2],
  [ROOM_HALF, 0, 0.4, (ROOM_HALF + 0.2) * 2],
]
/** Wall lights: [wall, along it]. Rooms with windows light only the north wall. */
const SCONCES_NORTH = [['n', -5.2], ['n', 5.2]]
const SCONCES_ALL = [...SCONCES_NORTH, ['w', -4.5], ['w', 4.5], ['e', -4.5], ['e', 4.5]]
const GOLD_TRIM = '#e8b83a'
const SCONCE_GLOW = '#ffe2a0'
/** How long smashed furniture takes to burst apart and land as rubble (ms). */
const BREAK_MS = 520
/** How high its pieces are thrown on the way. */
const BREAK_ARC = 1.1
/** The crack texture's clear middle, as a share of its radius. */
const CRACK_CLEAR = 0.36
/** A crack round a hole: sized so its clear middle is the hole. */
const HOLE_CRACK = (HOLE_HALF * 2.2) / CRACK_CLEAR
const CRACKS = 5
const SHELL_WALL = 0.6

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _c = new Color()
const _e = new Euler()
/** Per room: where its rubble starts in the interior mesh and how many pieces (-1: not drawn). */
const rubbleAt = new Int32Array(FLOORS).fill(-1)
const rubbleCount = new Int32Array(FLOORS)
/** Per room: when its furniture burst (performance.now(); 0 = not this drop). */
const brokeAt = new Float64Array(FLOORS)
const _flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)

/** 5 x 7 pixel letters for the roof sign. */
const LETTERS = {
  H: ['1...1', '1...1', '1...1', '11111', '1...1', '1...1', '1...1'],
  O: ['.111.', '1...1', '1...1', '1...1', '1...1', '1...1', '.111.'],
  T: ['11111', '..1..', '..1..', '..1..', '..1..', '..1..', '..1..'],
  E: ['11111', '1....', '1....', '1111.', '1....', '1....', '11111'],
  L: ['1....', '1....', '1....', '1....', '1....', '1....', '11111'],
  R: ['1111.', '1...1', '1...1', '1111.', '1.1..', '1..1.', '1...1'],
  S: ['.1111', '1....', '1....', '.111.', '....1', '....1', '1111.'],
}

/** Each world's city: ground, roads, the buildings' colours, trees, the hotel's own colours. */
const CITIES = [
  {
    sign: 'HOTEL',
    ground: '#5a6070',
    walk: '#dfe4ec',
    park: '#5fdc4a',
    buildings: ['#ff8fb0', '#7fb8ff', '#5fe0ff', '#c39bff', '#8af0b0', '#ffe9a8', '#ff9a7a', '#a8b8ff', '#ffffff'],
    roofs: ['#ffffff', '#e8edf6', '#ffd0e0'],
    hotel: '#f4f7fb',
    hotelTrim: '#ffd21f',
    sea: false,
    leaves: ['#4fd93a', '#ff8fd0'],
  },
  {
    sign: 'RESORT',
    ground: '#e8d29a',
    walk: '#fbeed0',
    park: '#7fe86a',
    buildings: ['#ffffff', '#16b8c4', '#ff6f61', '#ffd27a', '#7fe8ff', '#ffb8a0', '#bff6ff'],
    roofs: ['#ff6f61', '#16b8c4', '#ffffff'],
    hotel: '#fff6e6',
    hotelTrim: '#16b8c4',
    sea: true,
    leaves: ['#3fcf5a', '#2fae4a'],
  },
]

/**
 * The crack decal: dark jagged lines out from a hole, drawn once on a small canvas. The
 * middle (CRACK_CLEAR of the radius) is left clear: that's where the hole is, or the phone.
 */
function createCrackTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const g = canvas.getContext('2d')
  const r = mulberry32(42)
  g.strokeStyle = 'rgba(20,16,24,0.92)'
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const c = size / 2
  for (let i = 0; i < 14; i += 1) {
    let a = (i / 14) * Math.PI * 2 + r() * 0.3
    let x = c + Math.cos(a) * c * CRACK_CLEAR
    let y = c + Math.sin(a) * c * CRACK_CLEAR
    const len = 40 + r() * 40
    g.lineWidth = 7
    g.beginPath()
    g.moveTo(x, y)
    for (let d = 0; d < len; d += 14) {
      a += (r() - 0.5) * 0.7
      x += Math.cos(a) * 14
      y += Math.sin(a) * 14
      g.lineWidth = Math.max(1.5, 7 * (1 - d / len))
      g.lineTo(x, y)
      // A branch now and then.
      if (r() < 0.25) {
        const b = a + (r() < 0.5 ? 0.8 : -0.8)
        g.moveTo(x, y)
        g.lineTo(x + Math.cos(b) * 18, y + Math.sin(b) * 18)
        g.moveTo(x, y)
      }
    }
    g.stroke()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.generateMipmaps = false
  return texture
}

/** A blocky cloud: a few white boxes round (x, y, z). */
function addCloud(set, r, x, y, z, size) {
  set.add(x, y, z, size * 2.2, size * 0.8, size * 1.4, '#ffffff', STYLE.SMOOTH)
  set.add(x - size * 0.7, y + size * 0.35, z + size * 0.1, size * 1.1, size * 0.9, size * 1.1, '#ffffff', STYLE.SMOOTH)
  set.add(x + size * 0.5, y + size * 0.45, z - size * 0.2, size * 1.2, size * 1.0, size * 1.0, '#f4f8ff', STYLE.SMOOTH)
  if (r() < 0.6) set.add(x + size * 1.2, y + size * 0.1, z + size * 0.3, size * 0.9, size * 0.6, size * 0.9, '#ffffff', STYLE.SMOOTH)
}

/** Pixel letters standing on the roof's north edge, facing south (towards the lobby). */
function addSign(set, text, color, back) {
  const pixel = Math.min(0.85, (SHELL_HALF * 2 - 1) / (text.length * 5 + (text.length - 1)))
  const width = (text.length * 5 + (text.length - 1)) * pixel
  const z = HOTEL.z - SHELL_HALF + 1.2
  const base = ROOF_Y + 2.2
  // A frame for the letters to stand on.
  for (const sx of [-1, 1]) set.add(HOTEL.x + sx * (width / 2 - 1), base - 1, z, 0.5, 2.2, 0.5, back, STYLE.SMOOTH)
  set.add(HOTEL.x, base - 0.1, z, width + 0.8, 0.4, 0.8, back, STYLE.SMOOTH)
  let x0 = HOTEL.x - width / 2
  for (const ch of text) {
    const rows = LETTERS[ch]
    if (rows) {
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          if (rows[row][col] !== '1') continue
          set.add(x0 + (col + 0.5) * pixel, base + (6.5 - row) * pixel + 0.2, z, pixel * 0.92, pixel * 0.92, 0.5, color, STYLE.GLOW)
        }
      }
    }
    x0 += 6 * pixel
  }
}

/**
 * The static scenery for `world`: mountain, clouds, city, hotel. `density` (0-1, the
 * preset's decorDensity) thins the city and clouds; `clouds` is the preset's cloud count.
 */
function buildScenery(world, density, clouds) {
  const city = CITIES[world] ?? CITIES[0]
  const venue = venueOf(world)
  const set = new BlockSet()
  const props = new PropBuilder()
  const r = mulberry32(1234 + world)

  // --- Under the lobby: terraces in the venue's style (towers, or cliffs) widening down. --
  const rock = venue.hills.rock
  const rockStyle = venue.hills.style ?? STYLE.MESA
  const tiers = [
    [0, -34, 0],
    [-34, -90, 10],
    [-90, -170, 24],
    [-170, GROUND_Y - 4, 40],
  ]
  tiers.forEach(([top, bottom, grow], i) => {
    const minX = PLAZA.minX - 14 - grow
    const maxX = PLAZA.maxX + 14 + grow
    const minZ = PLAZA.minZ - 0.5 - grow * 0.6
    const maxZ = PLAZA.maxZ + 30 + grow
    set.add((minX + maxX) / 2, (top + bottom) / 2 - 0.05, (minZ + maxZ) / 2, maxX - minX, top - bottom, maxZ - minZ, rock[i % rock.length], rockStyle)
  })

  // --- Clouds: a sea of them below the lobby, clear over the hotel. ---------------------
  const cloudCount = Math.round(clouds * 3)
  for (let i = 0; i < cloudCount; i += 1) {
    const a = r() * Math.PI * 2
    const dist = 70 + r() * 190
    const x = Math.cos(a) * dist
    const z = -40 + Math.sin(a) * dist * 0.9
    if (Math.hypot(x - HOTEL.x, z - HOTEL.z) < 30) continue
    addCloud(set, r, x, -34 - r() * 18, z, 4 + r() * 5)
  }

  // --- The city: blocks between roads, buildings in pastel colours, parks. -------------
  set.add(0, GROUND_Y - 1, -140, 900, 2, 900, city.ground, STYLE.ROAD)
  const CELL = 34
  for (let i = -7; i <= 7; i += 1) {
    for (let j = 0; j <= 12; j += 1) {
      const cx = HOTEL.x + i * CELL
      const cz = HOTEL.z - (j - 2) * CELL
      // The hotel's own block, and nothing under the mountain.
      const isHotel = Math.abs(cx - HOTEL.x) < CELL / 2 && Math.abs(cz - HOTEL.z) < CELL / 2
      if (cz > -50 && Math.abs(cx) < 110) continue
      if (city.sea && cz < -330) continue
      if (!isHotel && r() > density + 0.25) continue
      set.add(cx, GROUND_Y + 0.15, cz, CELL - 8, 0.3, CELL - 8, city.walk, STYLE.SMOOTH)
      if (isHotel) continue
      if (r() < 0.16) {
        // A park: lawn and blocky trees.
        set.add(cx, GROUND_Y + 0.35, cz, CELL - 11, 0.3, CELL - 11, city.park, STYLE.STUDS)
        for (let t = 0; t < 5; t += 1) {
          const tx = cx + (r() - 0.5) * 18
          const tz = cz + (r() - 0.5) * 18
          set.add(tx, GROUND_Y + 1.6, tz, 0.8, 2.6, 0.8, '#8a5a32', STYLE.SMOOTH)
          set.add(tx, GROUND_Y + 4, tz, 3.2, 2.6, 3.2, city.leaves[t % city.leaves.length], STYLE.SMOOTH)
        }
        continue
      }
      const n = 1 + Math.floor(r() * 3)
      for (let k = 0; k < n; k += 1) {
        const w = 8 + r() * 9
        const d = 8 + r() * 9
        const bx = cx + (n === 1 ? 0 : (k - (n - 1) / 2) * 9) + (r() - 0.5) * 2
        const bz = cz + (r() - 0.5) * 6
        // Taller towards the edges of town, never up to the hotel's roof.
        const far = Math.min(1, Math.hypot(cx - HOTEL.x, cz - HOTEL.z) / 200)
        const h = 12 + r() * (40 + 50 * far)
        const color = city.buildings[Math.floor(r() * city.buildings.length)]
        set.add(bx, GROUND_Y + 0.3 + h / 2, bz, w, h, d, color, STYLE.WINDOWS)
        set.add(bx, GROUND_Y + 0.3 + h + 0.4, bz, w + 0.6, 0.8, d + 0.6, city.roofs[Math.floor(r() * city.roofs.length)], STYLE.SMOOTH)
        if (r() < 0.5) set.add(bx + (r() - 0.5) * w * 0.5, GROUND_Y + 0.3 + h + 1.4, bz + (r() - 0.5) * d * 0.5, 2.4, 1.4, 2.4, r() < 0.5 ? '#ff5a5a' : '#ffffff', STYLE.SMOOTH)
      }
    }
  }
  if (city.sea) set.add(0, GROUND_Y + 0.4, -560, 900, 1, 420, '#2fc6ff', STYLE.WATER)

  // --- The hotel: its walls (with windows) from the street up to the roof. -------------
  const wallH = ROOF_Y - GROUND_Y
  const wallY = GROUND_Y + wallH / 2
  const L = SHELL_HALF * 2
  for (const [dx, dz, sx, sz] of [
    [0, -SHELL_HALF, L, SHELL_WALL],
    [0, SHELL_HALF, L, SHELL_WALL],
    [-SHELL_HALF, 0, SHELL_WALL, L],
    [SHELL_HALF, 0, SHELL_WALL, L],
  ]) {
    set.add(HOTEL.x + dx, wallY, HOTEL.z + dz, sx, wallH, sz, city.hotel, STYLE.WINDOWS)
  }
  // Coloured bands round the outside every few floors, and a glowing one round the top:
  // four strips each, never a slab across (the phone and the camera come down inside).
  const band = (y, h, out, color, style) => {
    for (const [dx, dz, sx, sz] of [
      [0, -(SHELL_HALF + out / 2), L + out * 2, out],
      [0, SHELL_HALF + out / 2, L + out * 2, out],
      [-(SHELL_HALF + out / 2), 0, out, L],
      [SHELL_HALF + out / 2, 0, out, L],
    ]) {
      set.add(HOTEL.x + dx, y, HOTEL.z + dz, sx, h, sz, color, style)
    }
  }
  for (let f = 2; f < 10; f += 3) band(floorY(f) - SLAB / 2, 0.7, 0.4, city.hotelTrim, STYLE.SMOOTH)
  band(ROOF_Y - 0.6, 1.0, 0.5, city.hotelTrim, STYLE.GLOW)
  // The roof around the skylight, the parapet round its edge.
  const rim = (SHELL_HALF - SKYLIGHT_HALF) / 2
  const roofTop = ROOF_Y
  set.add(HOTEL.x, roofTop - 0.25, HOTEL.z - SKYLIGHT_HALF - rim, L, 0.5, rim * 2, '#e8edf6', STYLE.STUDS)
  set.add(HOTEL.x, roofTop - 0.25, HOTEL.z + SKYLIGHT_HALF + rim, L, 0.5, rim * 2, '#e8edf6', STYLE.STUDS)
  set.add(HOTEL.x - SKYLIGHT_HALF - rim, roofTop - 0.25, HOTEL.z, rim * 2, 0.5, SKYLIGHT_HALF * 2, '#e8edf6', STYLE.STUDS)
  set.add(HOTEL.x + SKYLIGHT_HALF + rim, roofTop - 0.25, HOTEL.z, rim * 2, 0.5, SKYLIGHT_HALF * 2, '#e8edf6', STYLE.STUDS)
  for (const [dx, dz, sx, sz] of [
    [0, -SHELL_HALF + 0.3, L, 0.6],
    [0, SHELL_HALF - 0.3, L, 0.6],
    [-SHELL_HALF + 0.3, 0, 0.6, L],
    [SHELL_HALF - 0.3, 0, 0.6, L],
  ]) {
    set.add(HOTEL.x + dx, roofTop + 0.6, HOTEL.z + dz, sx, 1.2, sz, city.hotelTrim, STYLE.SMOOTH)
  }
  // The skylight's frame: a white rim with a cross of glazing bars.
  for (const s of [-1, 1]) {
    set.add(HOTEL.x, roofTop + 0.15, HOTEL.z + s * SKYLIGHT_HALF, SKYLIGHT_HALF * 2 + 0.6, 0.5, 0.4, '#ffffff', STYLE.SMOOTH)
    set.add(HOTEL.x + s * SKYLIGHT_HALF, roofTop + 0.15, HOTEL.z, 0.4, 0.5, SKYLIGHT_HALF * 2 + 0.6, '#ffffff', STYLE.SMOOTH)
  }
  // Rooftop clutter: air conditioners, a water tank.
  for (const [dx, dz] of [
    [-9.5, 9.5],
    [9.5, 9.5],
    [9.5, -6],
  ]) {
    set.add(HOTEL.x + dx, roofTop + 0.9, HOTEL.z + dz, 2.4, 1.8, 2.4, '#c9d2de', STYLE.PLATE)
    set.add(HOTEL.x + dx, roofTop + 1.85, HOTEL.z + dz, 1.4, 0.1, 1.4, '#3a3f4a', STYLE.SMOOTH)
  }
  set.add(HOTEL.x - 9.5, roofTop + 2.2, HOTEL.z - 7, 2.6, 4.4, 2.6, '#7fb8ff', STYLE.SMOOTH)
  addSign(set, city.sign, city.hotelTrim, '#1f2a5c')

  // The target painted round the skylight: a red ring and a white one.
  const ring = new TorusGeometry(1, 0.11, 4, 48)
  props.add(ring, { position: [HOTEL.x, roofTop + 0.04, HOTEL.z], rotation: [Math.PI / 2, 0, 0], scale: [8.6, 8.6, 1], color: '#ff3b5c', style: STYLE.SMOOTH })
  props.add(ring, { position: [HOTEL.x, roofTop + 0.05, HOTEL.z], rotation: [Math.PI / 2, 0, 0], scale: [7.2, 7.2, 0.6], color: '#ffffff', style: STYLE.SMOOTH })
  ring.dispose()

  return { blocks: set.build(sharedMaterials().blocks), props: asToyInstance(props.build(), sharedMaterials().toy) }
}

/**
 * Piece `chunk` of room `room`'s rubble as instance `i`, `t` (0-1) of the way from bursting
 * out of the furniture to lying where it lands: thrown in an arc, tumbling as it goes.
 */
function placeChunk(mesh, i, room, chunk, t) {
  const k = Math.min(1, Math.max(0, t))
  const y0 = floorY(room)
  _p.set(
    HOTEL.x + chunk.fromX + (chunk.x - chunk.fromX) * k,
    y0 + chunk.fromY + (chunk.y - chunk.fromY) * k + BREAK_ARC * chunk.arc * 4 * k * (1 - k),
    HOTEL.z + chunk.fromZ + (chunk.z - chunk.fromZ) * k,
  )
  _q.setFromEuler(_e.set(chunk.rotX * k, chunk.rotY * k + (1 - k) * 2.5 * chunk.arc, chunk.rotZ * k))
  // A puddle spreads out from nothing; everything else keeps its size.
  const grow = chunk.spill ? Math.max(0.02, k) : 1
  _s.set(chunk.w * grow, chunk.h, chunk.d * grow)
  mesh.setMatrixAt(i, _m.compose(_p, _q, _s))
}

/** How far through its burst room `room`'s furniture is at `now` (1: landed, or never). */
const breakProgress = (room, now) => (brokeAt[room] ? (now - brokeAt[room]) / BREAK_MS : 1)

/** Writes box `i` of the interior: centre, size, colour, surface style. */
function writeBox(mesh, styles, i, x, y, z, sx, sy, sz, color, style) {
  _p.set(x, y, z)
  _s.set(sx, sy, sz)
  mesh.setMatrixAt(i, _m.compose(_p, _q.identity(), _s))
  mesh.setColorAt(i, _c.set(color))
  styles[i] = style
}

/**
 * Fills the interior with rooms `from`-`to`: walls, floors (broken open where the phone
 * went through), and furniture - what it smashed lying broken in pieces round the hole
 * (still flying out, if it burst a moment ago). Returns the box count.
 */
function fillInterior(mesh, world, from, to, state) {
  rubbleAt.fill(-1)
  const now = performance.now()
  const styles = mesh.geometry.getAttribute('aStyle').array
  let n = 0
  const add = (x, y, z, sx, sy, sz, color, style) => {
    if (n >= INTERIOR_MAX) return
    writeBox(mesh, styles, n, x, y, z, sx, sy, sz, color, style)
    n += 1
  }
  const half = ROOM_HALF + 0.2
  for (let room = from; room <= to; room += 1) {
    const { palette, boxes, rubble } = roomLayout(world, room)
    const y0 = floorY(room)
    const top = ceilingY(room)
    const h = top - y0
    // The floor slab under the room: whole, or four pieces round the hole.
    const slabY = y0 - SLAB / 2
    if (room < state.slabs) {
      const inner = HOLE_HALF
      const side = half - inner
      add(HOTEL.x, slabY, HOTEL.z - inner - side / 2, half * 2, SLAB, side, palette.floorA, palette.floorStyle)
      add(HOTEL.x, slabY, HOTEL.z + inner + side / 2, half * 2, SLAB, side, palette.floorA, palette.floorStyle)
      add(HOTEL.x - inner - side / 2, slabY, HOTEL.z, side, SLAB, inner * 2, palette.floorA, palette.floorStyle)
      add(HOTEL.x + inner + side / 2, slabY, HOTEL.z, side, SLAB, inner * 2, palette.floorA, palette.floorStyle)
      // Jagged broken edges standing up round the hole.
      for (const [dx, dz, sx, sz] of [
        [-inner + 0.3, -0.8, 0.5, 1.6],
        [inner - 0.3, 0.9, 0.5, 1.4],
        [0.7, -inner + 0.3, 1.8, 0.5],
        [-0.9, inner - 0.3, 1.2, 0.5],
      ]) {
        add(HOTEL.x + dx, y0 + 0.15, HOTEL.z + dz, sx, 0.5, sz, palette.floorB, STYLE.SMOOTH)
      }
    } else {
      add(HOTEL.x, slabY, HOTEL.z, half * 2, SLAB, half * 2, palette.floorA, palette.floorStyle)
    }
    // A border of the darker floor colour inlaid round the edge of the room.
    const inlay = IN_EDGE - 0.75
    add(HOTEL.x, y0 + 0.025, HOTEL.z - inlay, inlay * 2 + 0.6, 0.05, 0.6, palette.floorB, STYLE.SMOOTH)
    add(HOTEL.x, y0 + 0.025, HOTEL.z + inlay, inlay * 2 + 0.6, 0.05, 0.6, palette.floorB, STYLE.SMOOTH)
    add(HOTEL.x - inlay, y0 + 0.025, HOTEL.z, 0.6, 0.05, inlay * 2 - 0.6, palette.floorB, STYLE.SMOOTH)
    add(HOTEL.x + inlay, y0 + 0.025, HOTEL.z, 0.6, 0.05, inlay * 2 - 0.6, palette.floorB, STYLE.SMOOTH)
    // Four walls: wallpaper above, panelling below under a chair rail.
    const paper = h - DADO
    const { rail, raised } = palette
    for (const [wx, wz, sx, sz] of WALLS) {
      add(HOTEL.x + wx, y0 + DADO / 2, HOTEL.z + wz, sx, DADO, sz, palette.wainscot, STYLE.SMOOTH)
      add(HOTEL.x + wx, y0 + DADO + paper / 2, HOTEL.z + wz, sx, paper, sz, palette.wall, STYLE.PAPER)
    }
    add(HOTEL.x, y0 + DADO, HOTEL.z - IN_EDGE + 0.09, half * 2, 0.22, 0.18, rail, STYLE.SMOOTH)
    add(HOTEL.x - IN_EDGE + 0.09, y0 + DADO, HOTEL.z, 0.18, 0.22, half * 2, rail, STYLE.SMOOTH)
    add(HOTEL.x + IN_EDGE - 0.09, y0 + DADO, HOTEL.z, 0.18, 0.22, half * 2, rail, STYLE.SMOOTH)
    // Raised panels in the panelling, on the three walls in view.
    for (const at of PANELS) {
      add(HOTEL.x + at, y0 + 1.5, HOTEL.z - IN_EDGE + 0.05, 2.3, 1.9, 0.1, raised, STYLE.SMOOTH)
      add(HOTEL.x - IN_EDGE + 0.05, y0 + 1.5, HOTEL.z + at, 0.1, 1.9, 2.3, raised, STYLE.SMOOTH)
      add(HOTEL.x + IN_EDGE - 0.05, y0 + 1.5, HOTEL.z + at, 0.1, 1.9, 2.3, raised, STYLE.SMOOTH)
    }
    // Warm sconces: a pair on the north wall, and down the sides where there are no windows.
    const sconces = room < FLOORS_ABOVE_GROUND ? SCONCES_NORTH : SCONCES_ALL
    for (const [side, at] of sconces) {
      const [px, pz, ox, oz] = side === 'n' ? [at, -IN_EDGE, 0, 1] : side === 'w' ? [-IN_EDGE, at, 1, 0] : [IN_EDGE, at, -1, 0]
      const along = side === 'n'
      add(HOTEL.x + px + ox * 0.04, y0 + 6.1, HOTEL.z + pz + oz * 0.04, along ? 0.45 : 0.08, 0.8, along ? 0.08 : 0.45, GOLD_TRIM, STYLE.SMOOTH)
      add(HOTEL.x + px + ox * 0.32, y0 + 6.55, HOTEL.z + pz + oz * 0.32, along ? 0.7 : 0.5, 0.55, along ? 0.5 : 0.7, SCONCE_GLOW, STYLE.GLOW)
    }
    const trimStyle = palette.trimGlow ? STYLE.GLOW : STYLE.SMOOTH
    add(HOTEL.x, y0 + 0.25, HOTEL.z - ROOM_HALF + 0.25, half * 2, 0.5, 0.2, palette.trim, STYLE.SMOOTH)
    add(HOTEL.x - ROOM_HALF + 0.25, y0 + 0.25, HOTEL.z, 0.2, 0.5, half * 2, palette.trim, STYLE.SMOOTH)
    add(HOTEL.x + ROOM_HALF - 0.25, y0 + 0.25, HOTEL.z, 0.2, 0.5, half * 2, palette.trim, STYLE.SMOOTH)
    add(HOTEL.x, top - 0.3, HOTEL.z - ROOM_HALF + 0.25, half * 2, 0.4, 0.2, palette.trim, trimStyle)
    add(HOTEL.x - ROOM_HALF + 0.25, top - 0.3, HOTEL.z, 0.2, 0.4, half * 2, palette.trim, trimStyle)
    add(HOTEL.x + ROOM_HALF - 0.25, top - 0.3, HOTEL.z, 0.2, 0.4, half * 2, palette.trim, trimStyle)
    // The furniture; what the phone has smashed lies in pieces instead.
    const smashed = room < state.smashed
    for (const b of boxes) {
      if (b.smash && smashed) continue
      add(HOTEL.x + b.x, y0 + b.y + b.h / 2, HOTEL.z + b.z, b.w, b.h, b.d, b.color, b.style)
    }
    if (smashed && rubble.length && n + rubble.length <= INTERIOR_MAX) {
      rubbleAt[room] = n
      rubbleCount[room] = rubble.length
      const t = breakProgress(room, now)
      for (const chunk of rubble) {
        placeChunk(mesh, n, room, chunk, t)
        mesh.setColorAt(n, _c.set(chunk.color))
        styles[n] = chunk.style
        n += 1
      }
    }
    // The top floor's ceiling is the roof: once broken, shards of glass round the skylight.
    if (room === 0 && state.roofBroken) {
      for (let k = 0; k < 10; k += 1) {
        const a = (k / 10) * Math.PI * 2
        const rr = SKYLIGHT_HALF - 0.6
        add(HOTEL.x + Math.cos(a) * rr, ROOF_Y - 0.1, HOTEL.z + Math.sin(a) * rr, 1.6, 0.12, 0.9, '#bff3ff', STYLE.GLOW)
      }
    }
  }
  mesh.count = n
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.geometry.getAttribute('aStyle').needsUpdate = true
  return n
}

/** The furniture boxes the phone smashes in `room` (for their debris). */
function smashColors(world, room) {
  const colors = []
  for (const b of roomLayout(world, room).boxes) if (b.smash) colors.push(b.color)
  return colors.length ? colors : ['#ffffff']
}

export default function Tower() {
  const world = activeWorld()
  const glassRef = useRef(null)
  const crackRef = useRef(null)
  const interiorRef = useRef(null)
  /** What the interior was last filled for, so it's only refilled when something changed. */
  const filled = useRef('')
  /** Rooms whose furniture has been smashed this drop, and the drop it was for. */
  const smashedRef = useRef({ startedAt: -1, smashed: 0, roof: false, landed: false })

  const scenery = useMemo(() => {
    const { decorDensity, cloudCount } = getQuality()
    // Every floor's room laid out now, at mount, so a drop never builds one mid-frame.
    for (let floor = 0; floor < FLOORS; floor += 1) roomLayout(world, floor)
    return buildScenery(world, decorDensity, cloudCount)
  }, [world])

  const interior = useMemo(() => {
    const mesh = createBoxInstances(INTERIOR_MAX, sharedMaterials().toy, STYLE.SMOOTH)
    mesh.count = 0
    return mesh
  }, [])

  const glass = useMemo(() => {
    const material = new MeshLambertMaterial({ color: '#bff3ff', transparent: true, opacity: 0.5, emissive: '#5fb8d8', emissiveIntensity: 0.25, depthWrite: false })
    const geometry = new BoxGeometry(SKYLIGHT_HALF * 2, 0.2, SKYLIGHT_HALF * 2)
    const mesh = new Mesh(geometry, material)
    mesh.position.set(HOTEL.x, ROOF_Y - 0.05, HOTEL.z)
    mesh.renderOrder = 2
    return mesh
  }, [])

  const cracks = useMemo(() => {
    const texture = createCrackTexture()
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: DoubleSide,
    })
    const mesh = new InstancedMesh(new PlaneGeometry(1, 1), material, CRACKS)
    mesh.count = 0
    mesh.frustumCulled = false
    mesh.renderOrder = 1
    return { mesh, texture, material }
  }, [])

  useEffect(
    () => () => {
      disposeBlocks(scenery.blocks)
      scenery.props.geometry?.dispose()
      scenery.props.dispose()
    },
    [scenery],
  )
  useEffect(
    () => () => {
      disposeBlocks(interior)
      glass.geometry.dispose()
      glass.material.dispose()
      cracks.mesh.geometry.dispose()
      cracks.material.dispose()
      cracks.texture.dispose()
      cracks.mesh.dispose()
    },
    [interior, glass, cracks],
  )

  useFrame(() => {
    const active = roll.active
    const glassMesh = glassRef.current
    const interiorMesh = interiorRef.current
    const crackMesh = crackRef.current
    if (!interiorMesh || !crackMesh) return
    if (!active) {
      if (filled.current !== '') {
        interiorMesh.count = 0
        crackMesh.count = 0
        filled.current = ''
      }
      if (glassMesh) glassMesh.visible = true
      return
    }
    const st = smashedRef.current
    if (st.startedAt !== roll.startedAt) {
      st.startedAt = roll.startedAt
      st.smashed = 0
      st.roof = false
      st.landed = false
      brokeAt.fill(0)
    }
    const end = roll.end
    const y = roll.position.y
    // Furniture under the path bursts as the phone gets down to it.
    let smashed = roll.floor < 0 ? 0 : roll.floor
    if (roll.floor >= 0 && y < floorY(roll.floor) + 2.4) smashed = roll.floor + 1
    if (smashed > st.smashed) {
      sfx.furnitureSmash()
      for (let room = st.smashed; room < smashed; room += 1) {
        // It bursts apart now: its pieces fly out and land as rubble (fillInterior).
        brokeAt[room] = performance.now()
        spawnDebris({
          x: HOTEL.x,
          y: floorY(room) + 1.6,
          z: HOTEL.z,
          count: 14,
          colors: smashColors(world, room),
          speed: 10,
          up: 5,
          size: 0.42,
          floor: floorY(room),
          spread: 1.8,
        })
      }
      st.smashed = smashed
    }
    if (roll.roofBroken && !st.roof) {
      st.roof = true
      spawnDebris({ x: HOTEL.x, y: ROOF_Y, z: HOTEL.z, count: 26, colors: ['#bff3ff', '#e8fbff', '#7fd8ff'], speed: 13, up: 6, size: 0.6, floor: floorY(0), flat: true, spread: SKYLIGHT_HALF - 1 })
    }
    if (glassMesh) glassMesh.visible = !roll.roofBroken

    // Which rooms to build: the one the phone's in, the one above (the camera's) and,
    // before the roof, the top floor seen through the glass.
    const cur = Math.max(0, roll.floor)
    const from = Math.max(0, cur - 1)
    const to = Math.min(end, Math.max(cur + 1, roll.roofBroken ? cur : 1), FLOORS - 1)
    const key = `${world}|${from}|${to}|${roll.slabs}|${st.smashed}|${roll.roofBroken ? 1 : 0}|${roll.landed ? 1 : 0}`
    if (key !== filled.current) {
      filled.current = key
      fillInterior(interiorMesh, world, from, to, { slabs: roll.slabs, smashed: st.smashed, roofBroken: roll.roofBroken })
      // Cracks round every hole in view, and where the phone lies once it has stopped.
      let c = 0
      for (let room = from; room <= to && c < CRACKS; room += 1) {
        if (room < roll.slabs) {
          _p.set(HOTEL.x, floorY(room) + 0.03, HOTEL.z)
          crackMesh.setMatrixAt(c, _m.compose(_p, _flat, _s.set(HOLE_CRACK, HOLE_CRACK, 1)))
          c += 1
        }
      }
      if (roll.landed && c < CRACKS) {
        const f = Math.min(1, Math.max(0.2, roll.landFraction ?? 0.5))
        _p.set(HOTEL.x, floorY(end) + 0.03, HOTEL.z)
        crackMesh.setMatrixAt(c, _m.compose(_p, _flat, _s.set(8 + 12 * f, 8 + 12 * f, 1)))
        c += 1
      }
      crackMesh.count = c
      crackMesh.instanceMatrix.needsUpdate = true
    }

    // Furniture still bursting apart: its pieces flying out to where they land.
    const now = performance.now()
    let moved = false
    for (let room = from; room <= to; room += 1) {
      const start = rubbleAt[room]
      if (start < 0 || !brokeAt[room]) continue
      const t = breakProgress(room, now)
      const { rubble } = roomLayout(world, room)
      for (let k = 0; k < rubbleCount[room]; k += 1) placeChunk(interiorMesh, start + k, room, rubble[k], t)
      moved = true
      // Landed: from now on it's just rubble, written once by fillInterior.
      if (t >= 1) brokeAt[room] = 0
    }
    if (moved) interiorMesh.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <primitive object={scenery.blocks} />
      <primitive object={scenery.props} />
      <primitive ref={interiorRef} object={interior} />
      <primitive ref={glassRef} object={glass} />
      <primitive ref={crackRef} object={cracks.mesh} />
    </group>
  )
}
