import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'

import { createBoxInstances, disposeBlocks } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { clearDebris, GRAVITY, pieces, POOL, poolState } from './debrisPool'

/**
 * Smash debris: chunks of floor, splinters of furniture and shards of glass flying out
 * where the phone breaks through, bouncing on the floor below and fading out.
 *
 * One InstancedMesh, a fixed pool of POOL pieces (the oldest are reused when it's full),
 * nothing allocated after start-up and no physics engine: each piece is a point with a
 * velocity, gravity and one floor to bounce on. Off entirely on presets without particles
 * (LOW): spawn calls are dropped there, and the smash still reads from the hole, the
 * cracks, the shake and the sound.
 */

const _m = new Matrix4()
const _q = new Quaternion()
const _e = new Euler()
const _s = new Vector3()


export default function Debris() {
  const ref = useRef(null)
  const mesh = useMemo(() => {
    const m = createBoxInstances(POOL, sharedMaterials().toy, STYLE.SMOOTH)
    m.count = POOL
    return m
  }, [])

  useEffect(
    () => () => {
      clearDebris()
      disposeBlocks(mesh)
    },
    [mesh],
  )

  useFrame((_state, rawDelta) => {
    const mesh = ref.current
    if (!mesh) return
    const dt = Math.min(rawDelta, 0.05)
    let alive = 0
    for (let i = 0; i < POOL; i += 1) {
      const p = pieces[i]
      if (p.life <= 0) {
        mesh.setMatrixAt(i, _m.makeScale(0, 0, 0))
        continue
      }
      alive += 1
      p.life -= dt
      p.vel.y -= GRAVITY * dt
      p.pos.addScaledVector(p.vel, dt)
      if (p.pos.y < p.floor + p.size.y / 2) {
        // Bounce, losing most of the speed; then slide to a stop.
        p.pos.y = p.floor + p.size.y / 2
        p.vel.y = Math.abs(p.vel.y) * 0.3
        p.vel.x *= 0.55
        p.vel.z *= 0.55
        p.spin.multiplyScalar(0.5)
      }
      p.rot.addScaledVector(p.spin, dt)
      // Shrinks away over its last half second.
      const k = Math.min(1, p.life / 0.5)
      _q.setFromEuler(_e.set(p.rot.x, p.rot.y, p.rot.z))
      _s.copy(p.size).multiplyScalar(k)
      mesh.setMatrixAt(i, _m.compose(p.pos, _q, _s))
    }
    if (poolState.colorsDirty) {
      // Colours of every piece (even dead ones) are refreshed together, once per spawn.
      for (let i = 0; i < POOL; i += 1) mesh.setColorAt(i, pieces[i].color)
      mesh.instanceColor.needsUpdate = true
      poolState.colorsDirty = false
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.visible = alive > 0
  })

  return <primitive ref={ref} object={mesh} />
}
