import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'

import { SCREW_CRYSTAL, SCREW_GOLD } from '@shared/balance'

import { getQuality } from '../../store/quality'
import { burst } from '../fx/fxQueue'
import { roomState } from '../roomState'
import { flyQueue, sellQueue } from './aim'
import { createHeadTexture, createLooseScrewGeometry, createScrewMaterial } from './screwAssets'

const POOL = 48
const LIFE = 0.5
/** A sale: up to this many screws pour out of the bag (fewer on LOW), one after another. */
const SELL_MAX = 18
const SELL_MAX_LOW = 8
const SELL_LIFE = 0.8
const SELL_GAP = 0.035
/** Where a sold screw lands: down the hopper's chute, which swallows it. */
const CHUTE_Y = 0.1
const GOLD = new Color('#ffc62e').multiplyScalar(1.15)
const CRYSTAL = new Color(0.45, 1.75, 2.15)
const UP = new Vector3(0, 1, 0)
const SIDE = new Vector3(1, 0, 0)

const _m = new Matrix4()
const _q = new Quaternion()
const _spin = new Quaternion()
const _tilt = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _target = new Vector3()
const _from = new Vector3()
const _hide = new Matrix4().makeScale(0, 0, 0)

/**
 * A fixed pool of loose screws: each one taken hops out of its hole and flies into your
 * bag (low on the right of the view), spinning and shrinking; each sale pours a stream of
 * them out of the bag, up in an arc and down the SELL hopper's chute. Recycled
 * oldest-first, so nothing is allocated while you play.
 */
class FlyingPool {
  constructor(head, screwColor) {
    this.enabled = getQuality().screwFx
    this.sparks = getQuality().particles
    this.geometry = createLooseScrewGeometry(8)
    this.texture = createHeadTexture(head, 256)
    this.material = createScrewMaterial(this.texture, false)
    this.mesh = new InstancedMesh(this.geometry, this.material, POOL)
    this.mesh.frustumCulled = false
    this.base = new Color(screwColor)
    for (let i = 0; i < POOL; i += 1) {
      this.mesh.setMatrixAt(i, _hide)
      this.mesh.setColorAt(i, this.base)
    }
    this.pieces = Array.from({ length: POOL }, () => ({ life: 0, from: new Vector3(), to: new Vector3(), normal: new Vector3(), spin: 0, side: 0, sell: false, delay: 0 }))
    this.next = 0
  }

  update(camera, delta) {
    const mesh = this.mesh
    const layout = roomState.layout
    let colorsChanged = false
    while (flyQueue.length) {
      const pop = flyQueue.pop()
      if (!this.enabled || !layout) continue
      const index = this.next
      const piece = this.pieces[index]
      this.next = (this.next + 1) % POOL
      const i = pop.i
      piece.life = LIFE
      piece.sell = false
      piece.delay = 0
      piece.from.set(layout.pos[i * 3], layout.pos[i * 3 + 1], layout.pos[i * 3 + 2])
      piece.normal.fromArray(layout.surfaces[layout.surf[i]].normal)
      piece.spin = Math.random() * 6
      piece.side = (Math.random() - 0.5) * 0.4
      mesh.setColorAt(index, pop.kind === SCREW_GOLD ? GOLD : pop.kind === SCREW_CRYSTAL ? CRYSTAL : this.base)
      colorsChanged = true
      if (this.sparks && flyQueue.length < 4) {
        const f = piece.from
        const n = piece.normal
        burst({ x: f.x + n.x * 0.1, y: f.y + n.y * 0.1, z: f.z + n.z * 0.1, count: 4, speed: 2.2, palette: 'metal' })
      }
    }
    // Where the bag is: low and to the right of the view.
    _target.set(0.35, -0.45, -0.6).applyQuaternion(camera.quaternion).add(camera.position)
    // A sale: a stream out of the bag into the hopper (on every preset - it's brief). It
    // leaves from a little further out than the bag, so the first screws don't fill the view.
    if (sellQueue.length) _from.set(0.3, -0.35, -1.0).applyQuaternion(camera.quaternion).add(camera.position)
    while (sellQueue.length) {
      const count = Math.min(sellQueue.pop(), this.enabled ? SELL_MAX : SELL_MAX_LOW)
      if (!layout) continue
      for (let k = 0; k < count; k += 1) {
        const index = this.next
        const piece = this.pieces[index]
        this.next = (this.next + 1) % POOL
        piece.sell = true
        piece.life = SELL_LIFE
        piece.delay = k * SELL_GAP
        piece.from.set(_from.x + (Math.random() - 0.5) * 0.12, _from.y, _from.z + (Math.random() - 0.5) * 0.12)
        piece.to.set(layout.sell.x + (Math.random() - 0.5) * 0.6, CHUTE_Y, layout.sell.z + (Math.random() - 0.5) * 0.6)
        piece.spin = Math.random() * 6
        piece.side = Math.random() * 6
        mesh.setMatrixAt(index, _hide)
        mesh.setColorAt(index, k % 6 === 5 ? GOLD : this.base)
        colorsChanged = true
      }
    }

    let alive = false
    for (let k = 0; k < POOL; k += 1) {
      const piece = this.pieces[k]
      if (piece.life <= 0) continue
      alive = true
      if (piece.delay > 0) {
        piece.delay -= delta
        continue
      }
      piece.life -= delta
      if (piece.life <= 0) {
        mesh.setMatrixAt(k, _hide)
        continue
      }
      if (piece.sell) {
        this.placeSold(k, piece)
        continue
      }
      const t = 1 - piece.life / LIFE
      // First it hops straight out of its hole, then it arcs to the bag.
      const hop = Math.min(1, t * 4)
      const fly = Math.max(0, (t - 0.18) / 0.82)
      const ease = fly * fly * (3 - 2 * fly)
      _p.copy(piece.from).addScaledVector(piece.normal, 0.08 + hop * 0.3)
      _p.lerp(_target, ease)
      _p.y += Math.sin(ease * Math.PI) * 0.5
      // Facing out of its hole, spinning, and tumbling over as it flies.
      _q.setFromUnitVectors(UP, piece.normal)
      _q.multiply(_tilt.setFromAxisAngle(SIDE, ease * 2.4 + piece.side))
      _q.multiply(_spin.setFromAxisAngle(UP, piece.spin + t * 18))
      const scale = 1 - ease * 0.82
      _s.set(scale, scale, scale)
      mesh.setMatrixAt(k, _m.compose(_p, _q, _s))
    }
    if (alive) mesh.instanceMatrix.needsUpdate = true
    if (colorsChanged && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  /** A sold screw: up out of the bag in a high arc, tumbling, and down into the chute. */
  placeSold(k, piece) {
    const t = 1 - piece.life / SELL_LIFE
    const ease = t * t * (3 - 2 * t)
    _p.lerpVectors(piece.from, piece.to, ease)
    _p.y += Math.sin(t * Math.PI) * 1.4
    _q.setFromAxisAngle(SIDE, piece.side + t * 9)
    _q.multiply(_spin.setFromAxisAngle(UP, piece.spin + t * 14))
    // Small out of the bag, growing as it flies off, swallowed by the chute at the end.
    const scale = t < 0.3 ? 0.22 + (t / 0.3) * 0.4 : t < 0.82 ? 0.62 : 0.62 - ((t - 0.82) / 0.18) * 0.5
    _s.set(scale, scale, scale)
    this.mesh.setMatrixAt(k, _m.compose(_p, _q, _s))
  }

  dispose() {
    this.mesh.dispose()
    this.geometry.dispose()
    this.texture.dispose()
    this.material.dispose()
  }
}

/**
 * The screws you take, flying into your bag (off on LOW: they just leave their holes), and
 * the ones you sell, pouring into the hopper.
 */
export function FlyingScrews({ head, screwColor }) {
  const pool = useMemo(() => new FlyingPool(head, screwColor), [head, screwColor])
  useEffect(() => () => pool.dispose(), [pool])
  useFrame((state, delta) => pool.update(state.camera, Math.min(delta, 0.05)))
  return <primitive object={pool.mesh} />
}

export default FlyingScrews
