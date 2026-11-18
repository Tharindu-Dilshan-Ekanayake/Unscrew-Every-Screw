import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { ConeGeometry, CylinderGeometry, DoubleSide, IcosahedronGeometry, MeshBasicMaterial, PlaneGeometry, TorusGeometry } from 'three'

import { getGame } from '../../store/game'
import { asToyInstance, PropBuilder } from '../blocks'
import { createLabelTexture, updateLabelTexture } from '../labelTexture'
import { sharedMaterials, STYLE } from '../materials'

const T = 0.3
const PIPE = new CylinderGeometry(1, 1, 1, 12)
const SHADE = new ConeGeometry(1, 1, 12)
const BULB = new IcosahedronGeometry(1, 1)
const WHEEL = new TorusGeometry(1, 0.16, 6, 16)

/**
 * A pillar (its faces are covered in screws, by the layout): a wooden post in the
 * workshop, a riveted tank in the boiler room, a glowing column in the lab - each with a
 * plinth and a cap kept clear of the screws.
 */
function pillar(b, p, h, theme, themeId) {
  const s = p.size
  // A touch short of the ceiling, so its top never shares a face with its cap.
  const ph = h - 0.03
  if (themeId === 'workshop') b.box(p.x, ph / 2, p.z, s, ph, s, theme.beam, STYLE.PARQUET)
  else if (themeId === 'boiler') b.box(p.x, ph / 2, p.z, s, ph, s, theme.pillar || '#8a4632', STYLE.PLATE)
  else {
    b.box(p.x, ph / 2, p.z, s, ph, s, theme.pillar || '#eef4f8', STYLE.TILES)
    // Glowing strips down its corners (the screws keep clear of the edges).
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) b.box(p.x + (dx * s) / 2, h / 2, p.z + (dz * s) / 2, 0.05, h - 0.5, 0.05, theme.trim, STYLE.GLOW)
  }
  b.box(p.x, 0.09, p.z, s + 0.3, 0.18, s + 0.3, theme.trim, STYLE.SMOOTH)
  b.box(p.x, h - 0.06, p.z, s + 0.3, 0.12, s + 0.3, theme.trim, STYLE.SMOOTH)
}

/**
 * The room itself: floor, walls, ceiling, trim, lamps, pillars and the chapter's touches
 * (beams and hanging lamps in the workshop, pipes and valves in the boiler room, light
 * strips and ducts in the lab), the exit door in the north wall and the corridor behind
 * it - all merged into one toy mesh, one draw call.
 * The door and its sign are their own: the door slides up when the last screw is out.
 */
export function RoomShell({ layout, theme, themeId }) {
  const doorRef = useRef(null)
  const signRef = useRef(null)
  const open = useRef(0)
  const signState = useRef('')

  const shell = useMemo(() => {
    const { w, d, h } = layout
    const dw = layout.door.width
    const dh = layout.door.height
    const b = new PropBuilder()
    // Floor and ceiling.
    b.box(0, -0.15, 0, w + 2 * T, 0.3, d + 2 * T, theme.floor, theme.floorStyle)
    b.box(0, h + 0.15, 0, w + 2 * T, 0.3, d + 2 * T, theme.ceiling, STYLE.SMOOTH)
    // Walls; the north one round the doorway.
    b.box(0, h / 2, d / 2 + T / 2, w + 2 * T, h, T, theme.wall, theme.wallStyle)
    b.box(-w / 2 - T / 2, h / 2, 0, T, h, d, theme.wall, theme.wallStyle)
    b.box(w / 2 + T / 2, h / 2, 0, T, h, d, theme.wall, theme.wallStyle)
    const side = (w - dw) / 2
    b.box(-(dw / 2 + side / 2), h / 2, -d / 2 - T / 2, side, h, T, theme.wall, theme.wallStyle)
    b.box(dw / 2 + side / 2, h / 2, -d / 2 - T / 2, side, h, T, theme.wall, theme.wallStyle)
    b.box(0, (dh + h) / 2, -d / 2 - T / 2, dw, h - dh, T, theme.wall, theme.wallStyle)
    // Skirting, cornice and corner posts.
    for (const [x, z, sx, sz] of [
      [0, d / 2 - 0.015, w, 0.03],
      [0, -d / 2 + 0.015, w, 0.03],
      [-w / 2 + 0.015, 0, 0.03, d],
      [w / 2 - 0.015, 0, 0.03, d],
    ]) {
      b.box(x, 0.07, z, sx, 0.14, sz, theme.trim, STYLE.SMOOTH)
      b.box(x, h - 0.06, z, sx, 0.12, sz, theme.trim, STYLE.SMOOTH)
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box((sx * w) / 2, h / 2, (sz * d) / 2, 0.16, h, 0.16, theme.trim, STYLE.SMOOTH)
    // The door frame, in the chapter's accent colour - reaching a hair into the doorway, so
    // it never shares a face with the wall's opening.
    b.box(-dw / 2 - 0.075, dh / 2, -d / 2 + 0.04, 0.18, dh + 0.1, 0.22, theme.accent, STYLE.SMOOTH)
    b.box(dw / 2 + 0.075, dh / 2, -d / 2 + 0.04, 0.18, dh + 0.1, 0.22, theme.accent, STYLE.SMOOTH)
    b.box(0, dh + 0.075, -d / 2 + 0.04, dw + 0.37, 0.18, 0.22, theme.accent, STYLE.SMOOTH)
    // The corridor behind it, lit at the far end.
    const cz = -d / 2 - T - 2
    b.box(0, -0.15, cz, dw + 0.58, 0.3, 4, theme.corridor, STYLE.PLATE)
    b.box(0, dh + 0.3, cz, dw + 0.6, 0.3, 4, theme.corridor, STYLE.SMOOTH)
    b.box(-dw / 2 - 0.15, dh / 2, cz, 0.3, dh + 0.6, 4, theme.corridor, STYLE.SMOOTH)
    b.box(dw / 2 + 0.15, dh / 2, cz, 0.3, dh + 0.6, 4, theme.corridor, STYLE.SMOOTH)
    b.box(0, dh / 2, cz - 2.1, dw + 0.6, dh + 0.6, 0.2, theme.lamp, STYLE.GLOW)
    b.box(0, 0.02, cz, 0.3, 0.04, 3.8, theme.accent, STYLE.GLOW)
    // Lamps, where the layout keeps the ceiling clear of screws: flush panels under a low
    // screwed ceiling, hanging fittings under a high bare one.
    const overhead = !layout.ceiling
    for (const [x, z] of layout.lamps) {
      if (overhead && themeId === 'workshop') {
        b.box(x, h - 0.35, z, 0.025, 0.7, 0.025, '#2a2e35', STYLE.SMOOTH)
        b.add(SHADE, { position: [x, h - 0.78, z], scale: [0.32, 0.2, 0.32], color: theme.trim })
        b.add(BULB, { position: [x, h - 0.9, z], scale: [0.11, 0.11, 0.11], color: theme.lamp, style: STYLE.GLOW })
      } else {
        b.box(x, h - 0.04, z, 1.4, 0.08, 0.62, theme.trim, STYLE.SMOOTH)
        b.box(x, h - 0.095, z, 1.28, 0.03, 0.5, theme.lamp, STYLE.GLOW)
      }
    }
    // The chapter's touches overhead (only where the ceiling has no screws to cover).
    if (themeId === 'workshop') {
      if (overhead) for (let z = -d / 2 + 1.2; z < d / 2 - 0.5; z += 2.4) b.box(0, h - 0.14, z, w - 0.24, 0.28, 0.24, theme.beam, STYLE.PARQUET)
    } else if (themeId === 'boiler') {
      if (overhead) {
        for (const z of [-d / 2 + 1.6, d / 2 - 1.6]) {
          b.add(PIPE, { position: [0, h - 0.32, z], rotation: [0, 0, Math.PI / 2], scale: [0.14, w - 0.24, 0.14], color: '#7a8088' })
          for (let x = -w / 2 + 1; x < w / 2; x += 2.5) b.box(x, h - 0.16, z, 0.08, 0.32, 0.08, '#3a3d44', STYLE.SMOOTH)
        }
        b.add(PIPE, { position: [-w / 4, h - 0.55, 0], rotation: [Math.PI / 2, 0, 0], scale: [0.2, d - 0.3, 0.2], color: '#b4562e' })
        // Red valve wheels on the big pipe.
        for (const z of [-d / 4, d / 5]) b.add(WHEEL, { position: [-w / 4, h - 0.82, z], rotation: [Math.PI / 2, 0, 0], scale: [0.22, 0.22, 0.6], color: '#e8323a' })
      }
    } else {
      // Light strips along the tops of the walls, above the highest screws; a duct overhead.
      for (const [x, z, sx, sz] of [
        [0, d / 2 - 0.05, w - 0.4, 0.05],
        [0, -d / 2 + 0.05, w - 0.4, 0.05],
        [-w / 2 + 0.05, 0, 0.05, d - 0.4],
        [w / 2 - 0.05, 0, 0.05, d - 0.4],
      ]) b.box(x, h - 0.07, z, sx, 0.04, sz, theme.trim, STYLE.GLOW)
      if (overhead) {
        b.box(0, h - 0.24, 0, 0.7, 0.4, d - 1.2, '#c9d6e0', STYLE.SMOOTH)
        for (let z = -d / 2 + 1.5; z < d / 2 - 1; z += 2) b.box(0, h - 0.45, z, 0.5, 0.02, 0.36, '#5a6476', STYLE.SMOOTH)
      }
    }
    // Pillars, floor to ceiling, in the chapter's style.
    for (const p of layout.pillars) pillar(b, p, h, theme, themeId)
    const geometry = b.build()
    const mesh = asToyInstance(geometry, sharedMaterials().toy)

    const door = new PropBuilder()
    // A hair narrower than the doorway, so its edges never share a face with the wall.
    door.box(0, 0, 0, dw - 0.04, dh - 0.02, 0.14, theme.trim, STYLE.PLATE)
    door.box(0, 0, 0.075, dw * 0.86, dh * 0.08, 0.02, '#ffcc22', STYLE.SMOOTH)
    door.box(0, -dh * 0.3, 0.075, dw * 0.86, dh * 0.08, 0.02, '#ffcc22', STYLE.SMOOTH)
    door.box(0, dh * 0.3, 0.075, dw * 0.86, dh * 0.08, 0.02, '#ffcc22', STYLE.SMOOTH)
    const doorMesh = asToyInstance(door.build(), sharedMaterials().toy)

    const signTexture = createLabelTexture([{ text: 'LOCKED', size: 92, fill: '#ff5a4a' }], { width: 512, height: 160, background: '#15171c', radius: 26, border: '#ff5a4a' })
    const signMaterial = new MeshBasicMaterial({ map: signTexture, transparent: true, side: DoubleSide, toneMapped: false })
    const signGeometry = new PlaneGeometry(1.6, 0.5)
    return { mesh, geometry, doorMesh, signTexture, signMaterial, signGeometry }
  }, [layout, theme, themeId])

  useEffect(
    () => () => {
      shell.geometry.dispose()
      shell.mesh.dispose()
      shell.doorMesh.geometry.dispose()
      shell.doorMesh.dispose()
      shell.signTexture.dispose()
      shell.signMaterial.dispose()
      shell.signGeometry.dispose()
    },
    [shell],
  )

  useFrame((_s, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const run = getGame().profile.run
    const unlocked = Boolean(run?.active) && run.left === 0
    open.current += ((unlocked ? 1 : 0) - open.current) * (1 - Math.exp(-2.2 * delta))
    if (doorRef.current) doorRef.current.position.y = layout.door.height / 2 + open.current * (layout.door.height + 0.1)
    const state = unlocked ? 'open' : 'locked'
    if (state !== signState.current) {
      signState.current = state
      updateLabelTexture(
        shell.signTexture,
        [{ text: unlocked ? 'EXIT' : 'LOCKED', size: 96, fill: unlocked ? '#5dff7a' : '#ff5a4a' }],
        { background: '#15171c', radius: 26, border: unlocked ? '#5dff7a' : '#ff5a4a' },
      )
    }
    if (signRef.current && unlocked) signRef.current.scale.setScalar(1 + Math.sin(performance.now() * 0.006) * 0.04)
  })

  const { d, door } = layout
  return (
    <>
      <primitive object={shell.mesh} />
      <group ref={doorRef} position={[0, door.height / 2, -d / 2 - T / 2]}>
        <primitive object={shell.doorMesh} />
        {/* The sign rides on the door, clear of the screws on the wall above it. */}
        <mesh ref={signRef} geometry={shell.signGeometry} material={shell.signMaterial} position={[0, 0.62, 0.125]} />
      </group>
    </>
  )
}

export default RoomShell
