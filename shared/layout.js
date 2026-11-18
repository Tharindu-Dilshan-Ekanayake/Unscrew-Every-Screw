import { CHAPTERS, CRYSTAL_CHANCE, GOLD_CHANCE, SCREW_CRYSTAL, SCREW_GOLD, SCREW_PLAIN, SELL_RADIUS, TOOLS } from './balance.js'
import { hash2 } from './rng.js'

/**
 * Room layouts: where every screw, station and wall of a room is. Pure and deterministic,
 * so the client draws exactly the screws the server validates against.
 *
 * Coordinates are the room's own (see balance.js): floor at y = 0, centred on the origin,
 * the exit door in the north wall (-Z), the start by the south wall.
 *
 * Every screw lives on a surface, in a grid: the floor, the four walls, the ceiling (rooms
 * with a low one) and each face of each pillar. A surface maps its own 2D coordinates
 * (u, v), in metres, to the room: `origin + u * uAxis + v * vAxis`, with `normal`
 * pointing into the room and `uMin..vMax` its extent. Screw indices run surface by
 * surface.
 *
 * For drawing, surfaces are gathered into a fixed set of buckets (BUCKETS: one mesh each,
 * however many pillars a room has): `bucket[i]` and `local[i]` say where screw i is drawn.
 */

/** How far a screw head stands proud of its surface. */
export const HEAD_HEIGHT = 0.07
/** Screw head radius. */
export const HEAD_RADIUS = 0.2
/** No screw closer than this to a wall corner or edge. */
const EDGE = 0.38
/** Lowest and highest wall screws, from the floor / the ceiling. */
const WALL_LOW = 0.42
const WALL_TOP = 0.34

export const DOOR_WIDTH = 2.2
export const DOOR_HEIGHT = 2.7
/** Player collision radius in rooms. */
export const ROOM_PLAYER_RADIUS = 0.35
/** Half the side of a tool pedestal's collision box. */
export const PEDESTAL_HALF = 0.55
/** Stand within this of a pedestal to buy its tool. */
export const PEDESTAL_REACH = 1.55
/** The SELL hopper's visual radius. */
export const HOPPER_RADIUS = 1.2

/** Draw buckets: one mesh each in the renderer. */
export const BUCKETS = ['floor', 'north', 'south', 'west', 'east', 'ceiling', 'pillars']
/** No pillar screw closer than this to a pillar's edge. */
const PILLAR_EDGE = 0.22
/** Floor/ceiling screws keep this far from a pillar's faces (head radius + a gap). */
const PILLAR_CLEAR = 0.42

const cache = new Map()

/** The layout of room `roomIndex` of chapter `chapterIndex` (cached; never mutate it). */
export function getLayout(chapterIndex, roomIndex) {
  const key = `${chapterIndex}:${roomIndex}`
  let layout = cache.get(key)
  if (!layout) {
    layout = buildLayout(chapterIndex, roomIndex)
    cache.set(key, layout)
  }
  return layout
}

function buildLayout(chapterIndex, roomIndex) {
  const chapter = CHAPTERS[chapterIndex]
  const def = chapter.rooms[roomIndex]
  const { w, d, h, spacing: s } = def
  const hw = w / 2
  const hd = d / 2

  const sell = { x: hw - 2.1, z: hd - 2.3 }
  const pedestals = TOOLS.slice(1).map((tool, k) => ({ tool: tool.id, x: -hw + 1.35, z: (k - 1) * d * 0.27 }))
  const spawn = { x: -0.6, z: hd - 1.4, yaw: Math.PI }
  const door = { x: 0, z: -hd, width: DOOR_WIDTH, height: DOOR_HEIGHT }

  const pillars = (def.pillars || []).map(([x, z, size]) => ({ x, z, size, half: size / 2 }))
  // Ceiling lights: where they hang, no ceiling screws.
  const lamps = (w > 11 ? [-w / 4, w / 4] : [0]).flatMap((x) => (d > 11 ? [-d / 4, d / 4] : [-d / 6, d / 4]).map((z) => [x, z]))

  const colliders = [
    ...pedestals.map((p) => ({ minX: p.x - PEDESTAL_HALF, maxX: p.x + PEDESTAL_HALF, minZ: p.z - PEDESTAL_HALF, maxZ: p.z + PEDESTAL_HALF })),
    ...pillars.map((p) => ({ minX: p.x - p.half, maxX: p.x + p.half, minZ: p.z - p.half, maxZ: p.z + p.half })),
  ]

  const clearOfPillars = (x, z) => pillars.every((p) => Math.abs(x - p.x) >= p.half + PILLAR_CLEAR || Math.abs(z - p.z) >= p.half + PILLAR_CLEAR)
  const floorFree = (x, z) => {
    if (Math.hypot(x - sell.x, z - sell.z) < HOPPER_RADIUS + 0.35) return false
    for (const p of pedestals) if (Math.abs(x - p.x) < 0.78 && Math.abs(z - p.z) < 0.78) return false
    return clearOfPillars(x, z)
  }
  const ceilingFree = (x, z) => clearOfPillars(x, z) && lamps.every(([lx, lz]) => Math.abs(x - lx) > 0.95 || Math.abs(z - lz) > 0.6)

  const wallV = [WALL_LOW, h - WALL_TOP]
  const defs = [
    { name: 'floor', bucket: 0, origin: [0, 0, 0], uAxis: [1, 0, 0], vAxis: [0, 0, 1], normal: [0, 1, 0], u: [-hw, hw], v: [-hd, hd], grid: [[-hw + EDGE, hw - EDGE], [-hd + EDGE, hd - EDGE]], free: floorFree },
    { name: 'north', bucket: 1, origin: [0, 0, -hd], uAxis: [1, 0, 0], vAxis: [0, 1, 0], normal: [0, 0, 1], u: [-hw, hw], v: [0, h], grid: [[-hw + EDGE, hw - EDGE], wallV], free: (u, v) => !(Math.abs(u) < DOOR_WIDTH / 2 + 0.28 && v < DOOR_HEIGHT + 0.3) },
    { name: 'south', bucket: 2, origin: [0, 0, hd], uAxis: [1, 0, 0], vAxis: [0, 1, 0], normal: [0, 0, -1], u: [-hw, hw], v: [0, h], grid: [[-hw + EDGE, hw - EDGE], wallV], free: () => true },
    { name: 'west', bucket: 3, origin: [-hw, 0, 0], uAxis: [0, 0, 1], vAxis: [0, 1, 0], normal: [1, 0, 0], u: [-hd, hd], v: [0, h], grid: [[-hd + EDGE, hd - EDGE], wallV], free: () => true },
    { name: 'east', bucket: 4, origin: [hw, 0, 0], uAxis: [0, 0, 1], vAxis: [0, 1, 0], normal: [-1, 0, 0], u: [-hd, hd], v: [0, h], grid: [[-hd + EDGE, hd - EDGE], wallV], free: () => true },
  ]
  if (def.ceiling) {
    defs.push({ name: 'ceiling', bucket: 5, origin: [0, h, 0], uAxis: [1, 0, 0], vAxis: [0, 0, 1], normal: [0, -1, 0], u: [-hw, hw], v: [-hd, hd], grid: [[-hw + EDGE, hw - EDGE], [-hd + EDGE, hd - EDGE]], free: ceilingFree })
  }
  pillars.forEach((p, k) => {
    const faces = [
      { origin: [p.x, 0, p.z - p.half], uAxis: [1, 0, 0], normal: [0, 0, -1] },
      { origin: [p.x, 0, p.z + p.half], uAxis: [1, 0, 0], normal: [0, 0, 1] },
      { origin: [p.x - p.half, 0, p.z], uAxis: [0, 0, 1], normal: [-1, 0, 0] },
      { origin: [p.x + p.half, 0, p.z], uAxis: [0, 0, 1], normal: [1, 0, 0] },
    ]
    faces.forEach((f, fi) => {
      defs.push({ name: `pillar${k}.${fi}`, bucket: 6, origin: f.origin, uAxis: f.uAxis, vAxis: [0, 1, 0], normal: f.normal, u: [-p.half, p.half], v: [0, h], grid: [[-p.half + PILLAR_EDGE, p.half - PILLAR_EDGE], wallV], free: () => true })
    })
  })

  const positions = []
  const surf = []
  const bucket = []
  const local = []
  const bucketCounts = BUCKETS.map(() => 0)
  const surfaces = []
  for (let si = 0; si < defs.length; si += 1) {
    const sd = defs[si]
    const [[ulo, uhi], [vlo, vhi]] = sd.grid
    const nu = Math.max(1, Math.floor((uhi - ulo) / s + 1e-6) + 1)
    const nv = Math.max(1, Math.floor((vhi - vlo) / s + 1e-6) + 1)
    const u0 = (ulo + uhi) / 2 - ((nu - 1) * s) / 2
    const v0 = (vlo + vhi) / 2 - ((nv - 1) * s) / 2
    const cells = new Int32Array(nu * nv).fill(-1)
    for (let j = 0; j < nv; j += 1) {
      const v = v0 + j * s
      for (let i = 0; i < nu; i += 1) {
        const u = u0 + i * s
        const x = sd.origin[0] + u * sd.uAxis[0] + v * sd.vAxis[0]
        const y = sd.origin[1] + u * sd.uAxis[1] + v * sd.vAxis[1]
        const z = sd.origin[2] + u * sd.uAxis[2] + v * sd.vAxis[2]
        // Floor and ceiling rules take room coordinates; walls and pillars their own (u, v).
        const horizontal = sd.normal[1] !== 0
        if (!(horizontal ? sd.free(x, z) : sd.free(u, v))) continue
        cells[j * nu + i] = surf.length
        positions.push(x, y, z)
        surf.push(si)
        bucket.push(sd.bucket)
        local.push(bucketCounts[sd.bucket])
        bucketCounts[sd.bucket] += 1
      }
    }
    surfaces.push({
      id: si,
      name: sd.name,
      bucket: sd.bucket,
      origin: sd.origin,
      uAxis: sd.uAxis,
      vAxis: sd.vAxis,
      normal: sd.normal,
      uMin: sd.u[0],
      uMax: sd.u[1],
      vMin: sd.v[0],
      vMax: sd.v[1],
      nu,
      nv,
      u0,
      v0,
      cells,
    })
  }

  return {
    key: `${chapterIndex}:${roomIndex}`,
    chapterIndex,
    roomIndex,
    name: def.name,
    w,
    d,
    h,
    spacing: s,
    value: def.value,
    ceiling: Boolean(def.ceiling),
    count: surf.length,
    pos: Float32Array.from(positions),
    surf: Uint16Array.from(surf),
    bucket: Uint8Array.from(bucket),
    local: Uint32Array.from(local),
    bucketCounts,
    surfaces,
    sell,
    pedestals,
    pillars,
    lamps,
    spawn,
    door,
    colliders,
  }
}

/** Where party member `k` of `n` starts in a room: side by side by the south wall. */
export function spawnPoint(layout, k = 0, n = 1) {
  return { x: layout.spawn.x + (k - (n - 1) / 2) * 1.1, z: layout.spawn.z, yaw: layout.spawn.yaw }
}

/** A screw's position: `out` ({x, y, z}) filled in and returned. */
export function screwPosition(layout, i, out = { x: 0, y: 0, z: 0 }) {
  out.x = layout.pos[i * 3]
  out.y = layout.pos[i * 3 + 1]
  out.z = layout.pos[i * 3 + 2]
  return out
}

/** Distance squared between screws a and b. */
export function screwDistanceSq(layout, a, b) {
  const p = layout.pos
  const dx = p[a * 3] - p[b * 3]
  const dy = p[a * 3 + 1] - p[b * 3 + 1]
  const dz = p[a * 3 + 2] - p[b * 3 + 2]
  return dx * dx + dy * dy + dz * dz
}

/**
 * What screw `i` is this run: plain, gold or crystal. Seeded by the run, so every run
 * hides its prizes somewhere new; `luck` (1 + Keen Eye) raises both chances.
 */
export function screwKind(i, seed, luck = 1) {
  const r = hash2(i, seed, 9173)
  if (r < GOLD_CHANCE * luck) return SCREW_GOLD
  if (r > 1 - CRYSTAL_CHANCE * luck) return SCREW_CRYSTAL
  return SCREW_PLAIN
}

/** All of a room's screw kinds for a run, as one array (the client draws from it). */
export function screwKinds(layout, seed, luck = 1) {
  const kinds = new Uint8Array(layout.count)
  for (let i = 0; i < layout.count; i += 1) kinds[i] = screwKind(i, seed, luck)
  return kinds
}

/** Keeps a point inside the room's walls (pedestals and pillars are pushed out of by the controller). Writes `out`. */
export function clampToRoom(layout, x, z, out = { x: 0, z: 0 }, radius = ROOM_PLAYER_RADIUS) {
  const hw = layout.w / 2 - radius
  const hd = layout.d / 2 - radius
  out.x = Math.min(hw, Math.max(-hw, x))
  out.z = Math.min(hd, Math.max(-hd, z))
  return out
}

/** Whether (x, z) is close enough to the SELL hopper to sell. */
export const atHopper = (layout, x, z, slack = 0) => Math.hypot(x - layout.sell.x, z - layout.sell.z) <= SELL_RADIUS + slack

/** The pedestal (index into layout.pedestals) the point is beside, or -1. */
export function pedestalAt(layout, x, z, slack = 0) {
  for (let k = 0; k < layout.pedestals.length; k += 1) {
    const p = layout.pedestals[k]
    if (Math.hypot(x - p.x, z - p.z) <= PEDESTAL_REACH + slack) return k
  }
  return -1
}

/** Whether (x, z) is in the open exit door's doorway. */
export const atDoor = (layout, x, z, slack = 0) => Math.abs(x - layout.door.x) <= layout.door.width / 2 + slack && z <= layout.door.z + 1.1 + slack
