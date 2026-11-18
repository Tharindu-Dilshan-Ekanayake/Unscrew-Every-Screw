import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'

import { SCREW_CRYSTAL, SCREW_GOLD } from '@shared/balance'
import { hash2 } from '@shared/rng'

import { getQuality } from '../../store/quality'
import { roomState } from '../roomState'
import { runtime } from '../runtime'
import { holeQueue, turning } from './aim'
import { createHeadGeometry, createHeadTexture, createScrewMaterial } from './screwAssets'

const UP = new Vector3(0, 1, 0)
const HOLE = new Color('#121212')
const GOLD = new Color('#ffc62e').multiplyScalar(1.15)
const CRYSTAL = new Color(0.45, 1.75, 2.15)

const _m = new Matrix4()
const _q = new Quaternion()
const _twist = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _n = new Vector3()
const _c = new Color()

const isIn = (i) => ((roomState.bits[i >> 3] >> (i & 7)) & 1) === 0

/**
 * Draws one room's screws: one InstancedMesh per surface sharing a head geometry and a
 * material. A screw is drawn in (at its own random twist), turning (spinning and rising
 * as the tool works it) or out (squashed flat and near-black: the hole it leaves). Each
 * frame rewrites only what changed.
 */
class ScrewDrawer {
  constructor(layout, head, screwColor) {
    const settings = getQuality()
    this.layout = layout
    // As round as the preset allows, but no more than the room can afford: a head costs
    // about 5 triangles a side, and all the room's heads together stay under budget.
    const affordable = Math.floor(settings.screwTriangles / (5 * Math.max(1, layout.count)))
    this.geometry = createHeadGeometry(Math.max(8, Math.min(settings.screwSegments, affordable)))
    this.texture = createHeadTexture(head, settings.maxTexture >= 1024 ? 512 : 256)
    this.material = createScrewMaterial(this.texture, true)
    this.base = new Color(screwColor)
    this.quats = layout.surfaces.map((s) => new Quaternion().setFromUnitVectors(UP, _n.fromArray(s.normal)))
    // One mesh per bucket (floor, each wall, the ceiling, all the pillars): a handful of
    // draw calls whatever the room, and walls behind you culled whole.
    this.meshes = layout.bucketCounts.map((count) => {
      if (!count) return null
      const mesh = new InstancedMesh(this.geometry, this.material, count)
      mesh.setColorAt(0, this.base)
      return mesh
    })
    // Each screw's resting twist, so the recesses don't line up like a printed pattern.
    this.twist = new Float32Array(layout.count)
    for (let i = 0; i < layout.count; i += 1) this.twist[i] = hash2(i, 77, 3) * Math.PI * 2
    this.built = -1
    this.turning = []
    this.highlight = -1
    this.dirty = this.meshes.map(() => false)
    this.dirtyColor = this.meshes.map(() => false)
    this.list = this.meshes.filter(Boolean)
  }

  colorOf(i, bright) {
    const kind = roomState.kinds[i]
    _c.copy(kind === SCREW_GOLD ? GOLD : kind === SCREW_CRYSTAL ? CRYSTAL : this.base)
    if (bright) _c.multiplyScalar(1.45)
    return _c
  }

  paint(i, bright) {
    const b = this.layout.bucket[i]
    this.meshes[b].setColorAt(this.layout.local[i], this.colorOf(i, bright))
    this.dirtyColor[b] = true
  }

  /** Writes screw i as in (progress 0), turning (0-1) or out (-1). */
  write(i, progress) {
    const layout = this.layout
    const si = layout.surf[i]
    const b = layout.bucket[i]
    const mesh = this.meshes[b]
    const local = layout.local[i]
    const n = layout.surfaces[si].normal
    _p.set(layout.pos[i * 3], layout.pos[i * 3 + 1], layout.pos[i * 3 + 2])
    if (progress < 0) {
      _p.x += n[0] * 0.004
      _p.y += n[1] * 0.004
      _p.z += n[2] * 0.004
      _s.set(0.9, 0.05, 0.9)
      _q.copy(this.quats[si])
      mesh.setColorAt(local, HOLE)
      this.dirtyColor[b] = true
    } else {
      const lift = progress * 0.18
      _p.x += n[0] * lift
      _p.y += n[1] * lift
      _p.z += n[2] * lift
      _s.set(1, 1, 1)
      _q.copy(this.quats[si]).multiply(_twist.setFromAxisAngle(UP, this.twist[i] - progress * Math.PI * 5))
    }
    mesh.setMatrixAt(local, _m.compose(_p, _q, _s))
    this.dirty[b] = true
  }

  update() {
    const layout = this.layout
    if (roomState.layout !== layout || !roomState.bits) return
    this.dirty.fill(false)
    this.dirtyColor.fill(false)

    // A new room, or a resync: every screw from scratch.
    if (this.built !== roomState.version) {
      this.built = roomState.version
      this.turning.length = 0
      this.highlight = -1
      holeQueue.length = 0
      roomState.restored.length = 0
      for (let i = 0; i < layout.count; i += 1) {
        const out = !isIn(i)
        this.write(i, out ? -1 : 0)
        if (!out) this.paint(i, false)
      }
      for (const mesh of this.list) mesh.computeBoundingSphere()
    }

    // Screws just taken become holes; screws the server refused go back in.
    while (holeQueue.length) this.write(holeQueue.pop(), -1)
    while (roomState.restored.length) {
      const i = roomState.restored.pop()
      this.write(i, 0)
      this.paint(i, false)
    }

    // The ones under the tool spin out; any it let go of settle back.
    for (let k = 0; k < this.turning.length; k += 1) {
      const i = this.turning[k]
      if (!turning.ids.includes(i) && isIn(i)) {
        this.write(i, 0)
        this.paint(i, false)
      }
    }
    this.turning.length = 0
    for (let k = 0; k < turning.ids.length; k += 1) {
      const i = turning.ids[k]
      if (!isIn(i)) continue
      this.write(i, turning.progress)
      this.paint(i, true)
      this.turning.push(i)
    }

    // The screw under the crosshair lights up.
    const target = runtime.aim.target
    if (target !== this.highlight) {
      const old = this.highlight
      if (old >= 0 && isIn(old) && !turning.ids.includes(old)) this.paint(old, false)
      if (target >= 0 && isIn(target)) this.paint(target, true)
      this.highlight = target
    }

    for (let b = 0; b < this.meshes.length; b += 1) {
      const mesh = this.meshes[b]
      if (!mesh) continue
      if (this.dirty[b]) mesh.instanceMatrix.needsUpdate = true
      if (this.dirtyColor[b] && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  }

  dispose() {
    for (const mesh of this.list) mesh.dispose()
    this.geometry.dispose()
    this.texture.dispose()
    this.material.dispose()
  }
}

/**
 * Every screw in the room: at most seven draw calls (floor, walls, ceiling, pillars -
 * walls behind you are frustum-culled whole), whatever the count.
 */
export function ScrewField({ layout, head, screwColor }) {
  const drawer = useMemo(() => new ScrewDrawer(layout, head, screwColor), [layout, head, screwColor])
  useEffect(() => () => drawer.dispose(), [drawer])
  useFrame(() => drawer.update())
  return (
    <>
      {drawer.list.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </>
  )
}

export default ScrewField
