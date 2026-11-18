import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, CylinderGeometry, Vector3 } from 'three'

import { asToyInstance, PropBuilder } from '../blocks'
import { sharedMaterials, STYLE } from '../materials'
import { roomState } from '../roomState'
import { runtime } from '../runtime'
import { droneState } from './aim'

const BOX = new BoxGeometry(1, 1, 1)
const CYL = new CylinderGeometry(1, 1, 1, 10)
const _goal = new Vector3()

/**
 * Your Helper Drone (the perk): a little quadcopter that hangs by your shoulder and darts
 * to the screw it's working on. One toy mesh; the rotors are faked by a wobble.
 */
export function Drone() {
  const ref = useRef(null)
  const mesh = useMemo(() => {
    const b = new PropBuilder()
    b.add(BOX, { scale: [0.22, 0.08, 0.22], color: '#ffcc22' })
    b.add(BOX, { position: [0, -0.06, 0.06], scale: [0.08, 0.06, 0.06], color: '#1d1f24' })
    b.add(BOX, { position: [0, -0.06, 0.095], scale: [0.04, 0.03, 0.02], color: '#3dfcff', style: STYLE.GLOW })
    for (const [x, z] of [
      [-0.16, -0.16],
      [0.16, -0.16],
      [-0.16, 0.16],
      [0.16, 0.16],
    ]) {
      b.add(BOX, { position: [x / 2, 0, z / 2], rotation: [0, Math.PI / 4, 0], scale: [0.2, 0.025, 0.03], color: '#2a2e35' })
      b.add(CYL, { position: [x, 0.03, z], scale: [0.09, 0.012, 0.09], color: '#e8edf2', style: STYLE.GLOW })
    }
    return asToyInstance(b.build(), sharedMaterials().toy)
  }, [])

  useEffect(
    () => () => {
      mesh.geometry.dispose()
      mesh.dispose()
    },
    [mesh],
  )

  useFrame((state, rawDelta) => {
    const g = ref.current
    if (!g) return
    g.visible = droneState.active
    if (!droneState.active) return
    const delta = Math.min(rawDelta, 0.05)
    const layout = roomState.layout
    const p = runtime.player.position
    const t = state.clock.elapsedTime
    const i = droneState.target
    if (layout && i >= 0) {
      const n = layout.surfaces[layout.surf[i]].normal
      _goal.set(layout.pos[i * 3] + n[0] * 0.45, layout.pos[i * 3 + 1] + n[1] * 0.45 + 0.1, layout.pos[i * 3 + 2] + n[2] * 0.45)
    } else {
      const yaw = runtime.player.yaw
      // Idle: up and off to your right, out of the way of the crosshair.
      _goal.set(p.x + Math.sin(yaw - 1.1) * 1.4, p.y + 2.75 + Math.sin(t * 1.7) * 0.08, p.z + Math.cos(yaw - 1.1) * 1.4)
    }
    droneState.position.lerp(_goal, 1 - Math.exp(-5 * delta))
    g.position.copy(droneState.position)
    g.rotation.set(Math.sin(t * 9) * 0.05, t * 0.8, Math.cos(t * 7) * 0.05)
  })

  return <primitive ref={ref} object={mesh} />
}

export default Drone
