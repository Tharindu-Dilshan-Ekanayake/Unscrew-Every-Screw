import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'

import { useGame } from '../../store/game'
import { asToyInstance } from '../blocks'
import { sharedMaterials } from '../materials'
import { runtime } from '../runtime'
import { buildArmGeometry, buildToolGeometry } from '../toolModels'

/**
 * Your hand and the tool in it, in first person: rides along with the camera, bobs as
 * you walk, pushes in and spins its bit while it works, and dips out and back in when
 * you change tool. Toy props through the shared material: three draw calls.
 */
export function Viewmodel() {
  const camera = useThree((s) => s.camera)
  const tool = useGame((s) => s.profile.run?.tool || 'driver')
  const skin = useGame((s) => s.profile.skin)
  const rootRef = useRef(null)
  const holdRef = useRef(null)
  const bitRef = useRef(null)
  const motion = useRef({ bob: 0, push: 0, spin: 0, swap: 1, lastTool: tool, twist: 0 })

  const arm = useMemo(() => asToyInstance(buildArmGeometry(), sharedMaterials().toy), [])
  const parts = useMemo(() => {
    const { body, bit } = buildToolGeometry(tool, skin)
    return { body: asToyInstance(body, sharedMaterials().toy), bit: asToyInstance(bit, sharedMaterials().toy) }
  }, [tool, skin])

  useEffect(
    () => () => {
      arm.geometry.dispose()
      arm.dispose()
    },
    [arm],
  )
  useEffect(
    () => () => {
      for (const m of [parts.body, parts.bit]) {
        m.geometry.dispose()
        m.dispose()
      }
    },
    [parts],
  )

  useFrame((_s, rawDelta) => {
    const root = rootRef.current
    const hold = holdRef.current
    const bit = bitRef.current
    if (!root || !hold || !bit) return
    const delta = Math.min(rawDelta, 0.05)
    const m = motion.current
    const aim = runtime.aim
    const speed = runtime.player.speed
    if (m.lastTool !== tool) {
      m.lastTool = tool
      m.swap = 0
    }
    m.swap = Math.min(1, m.swap + delta * 4)
    if (runtime.player.grounded) m.bob += delta * speed * 2.1
    const walk = Math.min(1, speed / 5.4)
    m.push += ((aim.working ? 1 : 0) - m.push) * (1 - Math.exp(-14 * delta))
    m.spin += delta * (aim.working ? (tool === 'driver' ? 0 : 38) : 0)
    // The hand driver is twisted by the wrist, back and forth.
    m.twist = aim.working && tool === 'driver' ? Math.sin(performance.now() * 0.022) * 0.9 : m.twist * 0.85

    root.position.copy(camera.position)
    root.quaternion.copy(camera.quaternion)
    const dip = (1 - m.swap) * 0.35
    hold.position.set(
      0.24 + Math.cos(m.bob) * 0.012 * walk,
      -0.25 + Math.abs(Math.sin(m.bob)) * 0.018 * walk - dip + (aim.working ? Math.sin(performance.now() * 0.06) * 0.003 : 0),
      -0.42 - m.push * 0.07,
    )
    hold.rotation.set(0.06 + m.push * 0.05 - dip, -0.12, m.twist * 0.25)
    bit.rotation.z = m.spin
  })

  return (
    <group ref={rootRef}>
      <group ref={holdRef}>
        <primitive object={arm} />
        {/* The bulky tools sit a little smaller in the hand, so they never fill the view. */}
        <group scale={tool === 'magnet' ? 0.72 : tool === 'ratchet' ? 0.85 : 1}>
          <primitive object={parts.body} />
          <group ref={bitRef}>
            <primitive object={parts.bit} />
          </group>
        </group>
      </group>
    </group>
  )
}

export default Viewmodel
