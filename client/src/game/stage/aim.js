import { Vector3 } from 'three'

import { HEAD_HEIGHT } from '@shared/layout'

import { isOut } from '../roomState'

/**
 * Picking screws without raycasting meshes: every screw sits in a grid on one of five
 * flat surfaces, so the view ray is intersected with those planes and the hit point
 * rounded to the nearest grid cell. Constant time, however many screws the room has.
 *
 * Also the hand-off between the systems that turn screws and the ones that draw them,
 * as plain module state (never React): `turning` (the screws your tool is on and how
 * far through), and `pops` (screws just taken, for the renderer's holes and the flying
 * screws).
 */

/** The screws the tool is turning right now, and how far through (0-1). */
export const turning = { ids: [], progress: 0 }

/** Screws taken since the renderers last looked: `{ i, kind, drone }`. Drained each frame. */
export const holeQueue = []
export const flyQueue = []

/** Sales since the renderer last looked (how many screws each), poured into the hopper. */
export const sellQueue = []

export function queuePop(i, kind, drone = false) {
  holeQueue.push(i)
  if (flyQueue.length < 96) flyQueue.push({ i, kind, drone })
}

/** The Helper Drone, for its renderer: where it is and what it's on. */
export const droneState = { active: false, position: new Vector3(0, 2, 0), target: -1, spin: 0 }

const _local = new Vector3()
const _hit = new Vector3()


/**
 * The screw the ray from `origin` along `dir` (unit) points at: `out.screw` (-1 for
 * none), `out.distance` from the origin to it, and `out.surface`. Prefers the grid cell
 * the ray lands in; if that screw is out, the nearest one still in around it, within
 * most of a cell.
 */
export function pick(layout, origin, dir, out) {
  out.screw = -1
  out.surface = -1
  out.distance = Infinity
  let bestT = Infinity
  let bestSurface = null
  let bestU = 0
  let bestV = 0
  for (const s of layout.surfaces) {
    const n = s.normal
    const denom = dir.x * n[0] + dir.y * n[1] + dir.z * n[2]
    if (denom > -1e-4) continue
    // The plane through the screw heads, a little proud of the surface.
    const px = s.origin[0] + n[0] * HEAD_HEIGHT * 0.7 - origin.x
    const py = s.origin[1] + n[1] * HEAD_HEIGHT * 0.7 - origin.y
    const pz = s.origin[2] + n[2] * HEAD_HEIGHT * 0.7 - origin.z
    const t = (px * n[0] + py * n[1] + pz * n[2]) / denom
    if (t <= 0 || t >= bestT) continue
    _hit.copy(dir).multiplyScalar(t).add(origin)
    _local.set(_hit.x - s.origin[0], _hit.y - s.origin[1], _hit.z - s.origin[2])
    const u = _local.x * s.uAxis[0] + _local.y * s.uAxis[1] + _local.z * s.uAxis[2]
    const v = _local.x * s.vAxis[0] + _local.y * s.vAxis[1] + _local.z * s.vAxis[2]
    if (u < s.uMin || u > s.uMax || v < s.vMin || v > s.vMax) continue
    bestT = t
    bestSurface = s
    bestU = u
    bestV = v
  }
  if (!bestSurface) return out
  const s = bestSurface
  const sp = layout.spacing
  const ci = Math.round((bestU - s.u0) / sp)
  const cj = Math.round((bestV - s.v0) / sp)
  let best = -1
  const centre = ci >= 0 && cj >= 0 && ci < s.nu && cj < s.nv ? s.cells[cj * s.nu + ci] : -1
  if (centre >= 0 && !isOut(centre)) {
    // The cell under the crosshair wins whenever its screw is still in.
    best = centre
  } else {
    let bestD = (sp * 0.72) ** 2
    for (let dj = -1; dj <= 1; dj += 1) {
      for (let di = -1; di <= 1; di += 1) {
        const i = ci + di
        const j = cj + dj
        if (i < 0 || j < 0 || i >= s.nu || j >= s.nv) continue
        const screw = s.cells[j * s.nu + i]
        if (screw < 0 || isOut(screw)) continue
        const du = s.u0 + i * sp - bestU
        const dv = s.v0 + j * sp - bestV
        const d = du * du + dv * dv
        if (d < bestD) {
          bestD = d
          best = screw
        }
      }
    }
  }
  if (best < 0) return out
  out.screw = best
  out.surface = s.id
  const p = layout.pos
  const dx = p[best * 3] - origin.x
  const dy = p[best * 3 + 1] - origin.y
  const dz = p[best * 3 + 2] - origin.z
  out.distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return out
}

const _candidates = []

/**
 * Screws still in within `radius` of screw `center` on its own surface, nearest first,
 * at most `max` (always including `center`). Written into `out` (cleared first).
 */
export function gather(layout, center, radius, max, out) {
  out.length = 0
  out.push(center)
  if (max <= 1 || radius <= 0) return out
  const s = layout.surfaces[layout.surf[center]]
  const sp = layout.spacing
  const p = layout.pos
  const cx = p[center * 3]
  const cy = p[center * 3 + 1]
  const cz = p[center * 3 + 2]
  _local.set(cx - s.origin[0], cy - s.origin[1], cz - s.origin[2])
  const u = _local.x * s.uAxis[0] + _local.y * s.uAxis[1] + _local.z * s.uAxis[2]
  const v = _local.x * s.vAxis[0] + _local.y * s.vAxis[1] + _local.z * s.vAxis[2]
  const ci = Math.round((u - s.u0) / sp)
  const cj = Math.round((v - s.v0) / sp)
  const span = Math.ceil(radius / sp)
  _candidates.length = 0
  for (let j = Math.max(0, cj - span); j <= Math.min(s.nv - 1, cj + span); j += 1) {
    for (let i = Math.max(0, ci - span); i <= Math.min(s.nu - 1, ci + span); i += 1) {
      const screw = s.cells[j * s.nu + i]
      if (screw < 0 || screw === center || isOut(screw)) continue
      // Whole grid steps squared, so the sort key stays an exact integer.
      const steps = (i - ci) * (i - ci) + (j - cj) * (j - cj)
      if (steps * sp * sp <= radius * radius) _candidates.push(steps * 100000 + screw)
    }
  }
  _candidates.sort((a, b) => a - b)
  for (let k = 0; k < _candidates.length && out.length < max; k += 1) out.push(_candidates[k] % 100000)
  return out
}

/** The nearest screw still in within `radius` of point (x, y, z), or -1 (the drone's pick). */
export function nearestScrew(layout, x, y, z, radius, skip = -1) {
  const p = layout.pos
  let best = -1
  let bestD = radius * radius
  for (let i = 0; i < layout.count; i += 1) {
    if (i === skip || isOut(i)) continue
    const dx = p[i * 3] - x
    const dy = p[i * 3 + 1] - y
    const dz = p[i * 3 + 2] - z
    const d = dx * dx + dy * dy + dz * dz
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
