import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CylinderGeometry, DoubleSide, MeshBasicMaterial, PlaneGeometry, TorusGeometry } from 'three'

import { toolById } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { HOPPER_RADIUS } from '@shared/layout'
import { toolPrice } from '@shared/logic'

import { useGame } from '../../store/game'
import { asToyInstance, PropBuilder } from '../blocks'
import { createLabelTexture, updateLabelTexture } from '../labelTexture'
import { sharedMaterials, STYLE } from '../materials'
import { buildToolGeometry } from '../toolModels'

const CYL = new CylinderGeometry(1, 1, 1, 24)
const CYL8 = new CylinderGeometry(1, 1, 1, 8)
const RING = new TorusGeometry(1, 0.12, 8, 28)
const RING_THIN = new TorusGeometry(1, 0.03, 4, 48)

/** Yaw that turns a +Z-facing plane at (x, z) to face the room's centre. */
const faceCentre = (x, z) => Math.atan2(-x, -z)

function Hopper({ layout, theme }) {
  const parts = useMemo(() => {
    const { x, z } = layout.sell
    const b = new PropBuilder()
    // Round, and no wider than the screw-free circle the layout leaves for it (screw
    // heads start 0.2 m inside that), so no screw ever pokes through it.
    const r = HOPPER_RADIUS + 0.12
    // A low plate you walk onto, ringed with hazard stripes; a raised rim with bolts
    // round a dark chute; a glowing edge so it reads from across the room.
    b.add(CYL, { position: [x, 0.03, z], scale: [r, 0.06, r], color: '#24272e', style: STYLE.PLATE })
    const n = 16
    for (let k = 0; k < n; k += 1) {
      const a = (k / n) * Math.PI * 2
      b.box(x + Math.cos(a) * (r - 0.17), 0.075, z + Math.sin(a) * (r - 0.17), ((Math.PI * 2 * (r - 0.17)) / n) * 0.98, 0.03, 0.2, k % 2 ? '#ffcc22' : '#1b1d22', STYLE.SMOOTH, [0, -a - Math.PI / 2, 0])
    }
    b.add(CYL, { position: [x, 0.09, z], scale: [0.82, 0.1, 0.82], color: '#050506' })
    b.add(RING, { position: [x, 0.13, z], rotation: [Math.PI / 2, 0, 0], scale: [0.92, 0.92, 1.4], color: '#2e3440' })
    for (let k = 0; k < 10; k += 1) {
      const a = (k / 10) * Math.PI * 2
      b.add(CYL8, { position: [x + Math.cos(a) * 0.92, 0.27, z + Math.sin(a) * 0.92], scale: [0.045, 0.05, 0.045], color: '#e8edf2' })
    }
    b.add(RING_THIN, { position: [x, 0.07, z], rotation: [Math.PI / 2, 0, 0], scale: [r - 0.04, r - 0.04, 1], color: theme.accent, style: STYLE.GLOW })
    const mesh = asToyInstance(b.build(), sharedMaterials().toy)
    const texture = createLabelTexture([{ text: 'SELL', size: 150, fill: '#ffd23a' }], { width: 512, height: 220 })
    const material = new MeshBasicMaterial({ map: texture, transparent: true, side: DoubleSide, depthWrite: false })
    const geometry = new PlaneGeometry(2.0, 0.86)
    return { mesh, texture, material, geometry }
  }, [layout, theme])

  useEffect(
    () => () => {
      parts.mesh.geometry.dispose()
      parts.mesh.dispose()
      parts.texture.dispose()
      parts.material.dispose()
      parts.geometry.dispose()
    },
    [parts],
  )

  const signRef = useRef(null)
  useFrame(() => {
    if (signRef.current) signRef.current.position.y = 2.25 + Math.sin(performance.now() * 0.002) * 0.08
  })

  const { x, z } = layout.sell
  return (
    <>
      <primitive object={parts.mesh} />
      <mesh ref={signRef} geometry={parts.geometry} material={parts.material} position={[x, 2.25, z]} rotation={[0, faceCentre(x, z), 0]} />
    </>
  )
}

function Pedestal({ pedestal, theme }) {
  const toolId = pedestal.tool
  const tool = toolById(toolId)
  const skin = useGame((s) => s.profile.skin)
  const owned = useGame((s) => Boolean(s.profile.run?.tools.includes(toolId)))
  const price = useGame((s) => toolPrice(s.profile, toolId))
  const cash = useGame((s) => s.profile.run?.cash || 0)
  const holoRef = useRef(null)

  const base = useMemo(() => {
    const b = new PropBuilder()
    const { x, z } = pedestal
    b.add(CYL, { position: [x, 0.42, z], scale: [0.5, 0.84, 0.5], color: theme.trim })
    b.add(CYL, { position: [x, 0.86, z], scale: [0.56, 0.06, 0.56], color: '#1b1d22' })
    b.add(RING, { position: [x, 0.9, z], rotation: [Math.PI / 2, 0, 0], scale: [0.48, 0.48, 0.4], color: theme.accent, style: STYLE.GLOW })
    return asToyInstance(b.build(), sharedMaterials().toy)
  }, [pedestal, theme])

  const holo = useMemo(() => {
    const { body, bit } = buildToolGeometry(toolId, skin)
    return { body: asToyInstance(body, sharedMaterials().toy), bit: asToyInstance(bit, sharedMaterials().toy) }
  }, [toolId, skin])

  const label = useMemo(() => {
    const texture = createLabelTexture([{ text: tool.name, size: 64 }], { width: 512, height: 200 })
    const material = new MeshBasicMaterial({ map: texture, transparent: true, side: DoubleSide, depthWrite: false })
    const geometry = new PlaneGeometry(1.5, 0.59)
    return { texture, material, geometry }
  }, [tool])

  useEffect(() => {
    updateLabelTexture(label.texture, [
      { text: tool.name, size: 64 },
      owned
        ? { text: 'OWNED', size: 72, fill: '#7dff8a' }
        : { text: `$${formatNumber(price)}`, size: 84, fill: cash >= price ? '#7dff8a' : '#ff6a55' },
    ])
  }, [label, tool, owned, price, cash])

  useEffect(
    () => () => {
      base.geometry.dispose()
      base.dispose()
    },
    [base],
  )
  useEffect(
    () => () => {
      for (const m of [holo.body, holo.bit]) {
        m.geometry.dispose()
        m.dispose()
      }
    },
    [holo],
  )
  useEffect(
    () => () => {
      label.texture.dispose()
      label.material.dispose()
      label.geometry.dispose()
    },
    [label],
  )

  useFrame((state) => {
    const g = holoRef.current
    if (!g) return
    const t = state.clock.elapsedTime
    g.rotation.y = t * 1.1
    g.position.y = 1.45 + Math.sin(t * 2 + pedestal.z) * 0.06
  })

  const { x, z } = pedestal
  return (
    <>
      <primitive object={base} />
      <group ref={holoRef} position={[x, 1.45, z]} scale={2.1}>
        <group rotation={[0, 0, Math.PI / 2]}>
          <primitive object={holo.body} />
          <primitive object={holo.bit} />
        </group>
      </group>
      <mesh geometry={label.geometry} material={label.material} position={[x + 0.05, 2.35, z]} rotation={[0, Math.PI / 2, 0]} />
    </>
  )
}

/** The room's stations: the SELL hopper and the three tool pedestals. */
export function Stations({ layout, theme }) {
  return (
    <>
      <Hopper layout={layout} theme={theme} />
      {layout.pedestals.map((p) => (
        <Pedestal key={p.tool} pedestal={p} theme={theme} />
      ))}
    </>
  )
}

export default Stations
