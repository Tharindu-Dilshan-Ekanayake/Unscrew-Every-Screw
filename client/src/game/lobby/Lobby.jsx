import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BoxGeometry, CylinderGeometry, FrontSide, IcosahedronGeometry, Matrix4, MeshBasicMaterial, OctahedronGeometry, PlaneGeometry, Quaternion, TorusGeometry, Vector3 } from 'three'

import { CHAPTERS, GAME_NAME } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { BELTS, FACTORY, LEADERBOARDS, PAD_SECTIONS, padPosts, padSignZ, PLAY_PADS, SECTION_SIGN_Z, sectionSpan, SOLO_PAD, STATIONS, TEAM_PADS } from '@shared/world'

import { getGame, useGame } from '../../store/game'
import { useQuality } from '../../store/quality'
import { asToyInstance, createToyInstances, PropBuilder } from '../blocks'
import { createLabelTexture, updateLabelTexture } from '../labelTexture'
import { advanceToyTime, sharedMaterials, STYLE } from '../materials'
import { PALETTE } from '../sceneStyle'
import { buildToolGeometry } from '../toolModels'
import { createBoardTexture, drawBanner, drawLeaderboard, drawTitle } from './boards'
import { buildClouds, buildYard, PAD_LOOKS, padLook, seatSpots } from './yard'

const CYL = new CylinderGeometry(1, 1, 1, 20)
const BOX = new BoxGeometry(1, 1, 1)
const PUFF = new IcosahedronGeometry(1, 1)
const OCTA = new OctahedronGeometry(1, 0)
const SEAT_RING = new TorusGeometry(0.6, 0.07, 6, 28)

const _m = new Matrix4()
const _q = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _z = new Vector3(0, 0, 1)
const _y = new Vector3(0, 1, 0)

/** One merged toy prop from a (module-level) builder function, built once and disposed with the component. */
function useProp(build) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mesh = useMemo(() => asToyInstance(build(), sharedMaterials().toy), [])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      mesh.dispose()
    },
    [mesh],
  )
  return mesh
}

/** Up to `max` copies of a toy prop, placed every frame by `place(mesh, t)`. */
class PropSwarm {
  constructor(geometry, max, place) {
    this.mesh = createToyInstances(geometry, sharedMaterials().toy, max)
    this.mesh.count = max
    this.place = place
  }

  update(t) {
    this.place(this.mesh, t)
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.dispose()
  }
}

function useSwarm(buildGeometry, max, place) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const swarm = useMemo(() => new PropSwarm(buildGeometry(), max, place), [])
  useEffect(() => () => swarm.dispose(), [swarm])
  useFrame((state) => swarm.update(state.clock.elapsedTime))
  return swarm.mesh
}

// --- The factory's moving parts: gears, crates on the belts, chimney smoke -----------------

function gearGeometry() {
  const b = new PropBuilder()
  b.add(CYL, { rotation: [Math.PI / 2, 0, 0], scale: [1, 0.3, 1], color: PALETTE.brass })
  for (let k = 0; k < 10; k += 1) {
    const a = (k / 10) * Math.PI * 2
    b.add(BOX, { position: [Math.cos(a), Math.sin(a), 0], rotation: [0, 0, a], scale: [0.42, 0.36, 0.24], color: PALETTE.brass })
  }
  b.add(CYL, { position: [0, 0, 0.12], rotation: [Math.PI / 2, 0, 0], scale: [0.36, 0.3, 0.36], color: PALETTE.trim })
  return b.build()
}

const GEARS = [
  { x: -11.3, y: 9.6, r: 1.7, speed: 0.5 },
  { x: -10.6, y: 12.6, r: 0.75, speed: -1.1 },
  { x: 11.3, y: 9.6, r: 1.7, speed: -0.5 },
  { x: 10.6, y: 12.6, r: 0.75, speed: 1.1 },
]

function Gears() {
  const mesh = useSwarm(gearGeometry, GEARS.length, (m, t) => {
    GEARS.forEach((g, i) => {
      _q.setFromAxisAngle(_z, t * g.speed + i * 0.3)
      m.setMatrixAt(i, _m.compose(_p.set(g.x, g.y, FACTORY.maxZ + 0.25), _q, _s.setScalar(g.r)))
    })
  })
  return <primitive object={mesh} />
}

function crateGeometry() {
  const b = new PropBuilder()
  b.box(0, 0, 0, 1, 1, 1, '#d39a5a', STYLE.PARQUET)
  b.box(0, 0, 0, 1.02, 0.18, 1.02, '#ffcc22', STYLE.SMOOTH)
  return b.build()
}

const CRATES_PER_BELT = 7
const BELT_SPEED = 1.5

function Conveyor() {
  const mesh = useSwarm(crateGeometry, CRATES_PER_BELT * BELTS.length, (m, t) => {
    BELTS.forEach((belt, bi) => {
      const start = belt.maxX - 0.8
      const len = belt.maxX - belt.minX - 1.6
      for (let k = 0; k < CRATES_PER_BELT; k += 1) {
        const u = (t * BELT_SPEED + (k * len) / CRATES_PER_BELT + bi * 0.7) % len
        // Out of one machine, along the belt (the same way its ribs run), into the next.
        const grow = Math.min(1, u / 0.6, (len - u) / 0.6)
        const size = 0.62 * Math.max(0, grow)
        _q.setFromAxisAngle(_y, k * 0.4)
        m.setMatrixAt(bi * CRATES_PER_BELT + k, _m.compose(_p.set(start - u, 0.86 + size / 2, belt.z), _q, _s.setScalar(size)))
      }
    })
  })
  return <primitive object={mesh} />
}

function puffGeometry() {
  const b = new PropBuilder()
  b.add(PUFF, { color: '#f4f6fa' })
  return b.build()
}

const PUFFS = 9
const CHIMNEYS = [-11, 11]

function Smoke() {
  const top = FACTORY.height + 7.9
  const z = (FACTORY.maxZ + FACTORY.minZ) / 2 - 3
  const mesh = useSwarm(puffGeometry, PUFFS * CHIMNEYS.length, (m, t) => {
    CHIMNEYS.forEach((x, ci) => {
      for (let k = 0; k < PUFFS; k += 1) {
        const f = (t / 5 + k / PUFFS + ci * 0.37) % 1
        // Rising and drifting off with the breeze, swelling, then thinning to nothing.
        const s = (0.5 + f * 1.8) * Math.min(1, (1 - f) * 4, f * 10)
        _q.setFromAxisAngle(_y, k)
        m.setMatrixAt(ci * PUFFS + k, _m.compose(_p.set(x + f * 3.5 + Math.sin(f * 6 + k) * 0.3, top + f * 7, z + f * 1.5), _q, _s.setScalar(Math.max(0, s))))
      }
    })
  })
  return <primitive object={mesh} />
}

// --- The play pads: arrows, the SOLO hologram, lit seats, rising sparkles -----------------
// Team pads' seats and countdowns come from the server (store.pads); the frame loop reads
// them, never sets anything.

/** The live state of team pad `id`, or null (a plain loop: no closures per frame). */
function padLive(pads, id) {
  for (let i = 0; i < pads.length; i += 1) if (pads[i].id === id) return pads[i]
  return null
}

function chevron() {
  const b = new PropBuilder()
  b.box(-0.42, 0, 0, 1.15, 0.36, 0.36, '#ffd23a', STYLE.GLOW, [0, 0, -0.75])
  b.box(0.42, 0, 0, 1.15, 0.36, 0.36, '#ffd23a', STYLE.GLOW, [0, 0, 0.75])
  return b.build()
}

/**
 * A yellow arrow bobbing over the SOLO pad, and over every team pad someone is waiting on
 * (a seat to fill: come and join). Hidden while your own run counts down.
 */
function PadArrows() {
  const counting = useGame((s) => s.countdown !== null)
  const mesh = useSwarm(chevron, PLAY_PADS.length, (m, t) => {
    const pads = getGame().pads
    for (let i = 0; i < PLAY_PADS.length; i += 1) {
      const pad = PLAY_PADS[i]
      const solo = pad.size === 1
      const live = solo ? null : padLive(pads, pad.id)
      const show = solo || (live !== null && live.names.length > 0 && live.names.length < live.size)
      _q.setFromAxisAngle(_y, Math.sin(t * 0.8 + i * 1.7) * 0.5)
      const y = (solo ? 2.5 : 2.7) + Math.abs(Math.sin(t * 2.6 + i * 0.9)) * 0.5
      m.setMatrixAt(i, _m.compose(_p.set(pad.x, y, pad.z), _q, _s.setScalar(show ? (solo ? 1 : 0.7) : 0)))
    }
  })
  return <primitive object={mesh} visible={!counting} />
}

function seatRing() {
  const b = new PropBuilder()
  b.add(SEAT_RING, { rotation: [Math.PI / 2, 0, 0], color: '#fff27a', style: STYLE.GLOW })
  return b.build()
}

/** Every seat on every team pad: `{ pad, k, x, z }`. */
const SEATS = TEAM_PADS.flatMap((pad) => seatSpots(pad).map(([x, z], k) => ({ pad: pad.id, k, x, z })))

/** A glowing ring round each taken seat - pulsing faster once the pad counts down. */
function LitSeats() {
  const mesh = useSwarm(seatRing, SEATS.length, (m, t) => {
    const pads = getGame().pads
    for (let i = 0; i < SEATS.length; i += 1) {
      const seat = SEATS[i]
      const live = padLive(pads, seat.pad)
      const taken = live !== null && seat.k < live.names.length
      const pulse = 1 + Math.sin(t * (live?.endsAt ? 12 : 4) + i) * 0.07
      _q.identity()
      m.setMatrixAt(i, _m.compose(_p.set(seat.x, 0.19, seat.z), _q, _s.setScalar(taken ? pulse : 0)))
    }
  })
  return <primitive object={mesh} />
}

/** A chevron for the floor, its tip at the origin pointing north: glowing yellow, outlined dark. */
function floorArrow() {
  const b = new PropBuilder()
  for (const side of [-1, 1]) {
    const a = 0.75
    const dx = side * Math.sin(a)
    const dz = Math.cos(a)
    const yaw = [0, -Math.atan2(dz, dx), 0]
    b.box((dx * 1.7) / 2, 0.05, (dz * 1.7) / 2, 1.7, 0.02, 0.62, PALETTE.trim, STYLE.SMOOTH, yaw)
    b.box((dx * 1.55) / 2, 0.07, (dz * 1.55) / 2, 1.55, 0.02, 0.42, '#ffd23a', STYLE.GLOW, yaw)
  }
  return b.build()
}

/** Arrows along the main path to the SOLO pad (south to north), then one to each team section. */
const PATH_ARROWS = [22, 17.5, 13, 8.5, 4, -0.3].map((z) => [0, z])
const SECTION_ARROWS = PAD_SECTIONS.map((s) => [s.x, -14.9])

/** The floor arrows: a wave of light runs up the path to the SOLO pad; the section arrows pulse together. */
function FloorArrows() {
  const mesh = useSwarm(floorArrow, PATH_ARROWS.length + SECTION_ARROWS.length, (m, t) => {
    _q.identity()
    for (let i = 0; i < PATH_ARROWS.length; i += 1) {
      const wave = Math.max(0, Math.sin(t * 3 - i * 0.8)) ** 4
      m.setMatrixAt(i, _m.compose(_p.set(PATH_ARROWS[i][0], 0, PATH_ARROWS[i][1]), _q, _s.setScalar(1 + wave * 0.35)))
    }
    const pulse = 1 + Math.max(0, Math.sin(t * 2.4)) ** 3 * 0.25
    for (let i = 0; i < SECTION_ARROWS.length; i += 1) {
      m.setMatrixAt(PATH_ARROWS.length + i, _m.compose(_p.set(SECTION_ARROWS[i][0], 0, SECTION_ARROWS[i][1]), _q, _s.setScalar(pulse)))
    }
  })
  return <primitive object={mesh} />
}

function moteGeometry() {
  const b = new PropBuilder()
  b.box(0, 0, 0, 1, 1, 1, '#fffbe0', STYLE.GLOW)
  return b.build()
}

const MOTES = 18

/** Sparkles drifting up off the SOLO pad (particles: MEDIUM and HIGH only). */
function PadMotes() {
  const pad = SOLO_PAD
  const mesh = useSwarm(moteGeometry, MOTES, (m, t) => {
    for (let k = 0; k < MOTES; k += 1) {
      const f = (t * 0.32 + k / MOTES) % 1
      const a = k * 2.399 + t * 0.35
      const r = pad.radius * (0.3 + ((k * 7) % 10) / 16)
      const size = 0.1 * Math.max(0, Math.min(1, f * 6, (1 - f) * 3))
      _q.setFromAxisAngle(_y, a)
      m.setMatrixAt(k, _m.compose(_p.set(pad.x + Math.cos(a) * r, 0.25 + f * 2.8, pad.z + Math.sin(a) * r), _q, _s.setScalar(size)))
    }
  })
  return <primitive object={mesh} />
}

// --- What draws the eye: the floating crystal and the skin on display ---------------------

function crystalGeometry() {
  const b = new PropBuilder()
  b.add(OCTA, { scale: [0.55, 0.85, 0.55], color: '#5fe6ff', style: STYLE.GLOW })
  return b.build()
}

/** A slow spin and a bob, for things on display. */
function useHover(ref, base, speed = 1) {
  useFrame((state) => {
    const g = ref.current
    if (!g) return
    const t = state.clock.elapsedTime * speed
    g.rotation.y = t
    g.position.y = base + Math.sin(t * 1.6) * 0.15
  })
}

function StationDisplays() {
  const perks = STATIONS.find((s) => s.id === 'perks')
  const skins = STATIONS.find((s) => s.id === 'skins')
  const skin = useGame((s) => s.profile.skin)
  const crystal = useProp(crystalGeometry)
  const tool = useMemo(() => {
    const { body, bit } = buildToolGeometry('driver', skin)
    return [asToyInstance(body, sharedMaterials().toy), asToyInstance(bit, sharedMaterials().toy)]
  }, [skin])
  useEffect(
    () => () => {
      for (const m of tool) {
        m.geometry.dispose()
        m.dispose()
      }
    },
    [tool],
  )
  const crystalRef = useRef(null)
  const toolRef = useRef(null)
  useHover(crystalRef, 3.0, 0.9)
  useHover(toolRef, 3.0, 0.7)
  return (
    <>
      <group ref={crystalRef} position={[perks.x - 4.25, 3.0, perks.z]}>
        <primitive object={crystal} />
      </group>
      <group ref={toolRef} position={[skins.x + 4.25, 3.0, skins.z]}>
        <group rotation={[0, 0, Math.PI / 2.4]} scale={4.2}>
          {tool.map((m, i) => (
            <primitive key={i} object={m} />
          ))}
        </group>
      </group>
    </>
  )
}

function Clouds() {
  const mesh = useProp(buildClouds)
  const ref = useRef(null)
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.004
  })
  return (
    <group ref={ref}>
      <primitive object={mesh} />
    </group>
  )
}

// --- Signs ------------------------------------------------------------------------------

/** A sign: a label texture on a plane (unlit, so it reads in any light). */
function useSign(lines, options, size) {
  const sign = useMemo(() => {
    const texture = createLabelTexture(lines, options)
    // One-sided: from behind, a sign is just its board (never mirrored text).
    const material = new MeshBasicMaterial({ map: texture, transparent: true, side: FrontSide, depthWrite: false })
    const geometry = new PlaneGeometry(size[0], size[1])
    return { texture, material, geometry }
    // Built once; contents change through updateLabelTexture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(
    () => () => {
      sign.texture.dispose()
      sign.material.dispose()
      sign.geometry.dispose()
    },
    [sign],
  )
  return sign
}

function Sign({ lines, options, size, position, rotation = [0, 0, 0] }) {
  const sign = useSign(lines, { width: 512, height: Math.round((512 * size[1]) / size[0]), ...options }, size)
  return <mesh geometry={sign.geometry} material={sign.material} position={position} rotation={rotation} />
}

/** What a team pad's board says under its title: free, filling up, waiting for someone who's reached the chapter, or starting. */
function teamPadStatus(live, size, online) {
  const n = live?.names.length || 0
  if (!n) return online ? 'step on to team up!' : 'play online with friends'
  if (live.endsAt) return `${n}/${size}  STARTING!`
  if (n >= size && !live.ready) return 'LOCKED - needs a player who got here'
  return `${n}/${size}  waiting for ${size - n} more`
}

const statusFill = (status) => (status.includes('STARTING') ? '#7dff9a' : status.startsWith('LOCKED') ? '#ff9a7a' : /^\d/.test(status) ? '#ffe27a' : '#ffffff')

const teamPadLines = (pad, status) => [
  { text: `${pad.size} PLAYERS`, size: 62, fill: padLook(pad).glow },
  { text: status, size: 32, fill: statusFill(status) },
]

/** A team pad's board: how many it seats, and who's on it right now. */
function TeamPadSign({ pad }) {
  const online = useGame((s) => s.net.mode === 'online')
  // A string, so the sign redraws only when what it says changes.
  const status = useGame((s) => teamPadStatus(padLive(s.pads, pad.id), pad.size, online))
  const [[lx], [rx]] = padPosts(pad)
  const size = [rx - lx - 0.4, 1.1]
  const sign = useSign(teamPadLines(pad, status), { width: 512, height: Math.round((512 * size[1]) / size[0]) }, size)
  useEffect(() => updateLabelTexture(sign.texture, teamPadLines(pad, status)), [sign, pad, status])
  return <mesh geometry={sign.geometry} material={sign.material} position={[pad.x, 2.35, padSignZ(pad) + 0.08]} />
}

const BOARD_TITLES = { screws: 'TOP UNSCREWERS', rooms: 'ROOMS ESCAPED', playtime: 'MOST PLAYTIME' }

/** Seconds played, as hours and minutes: "3h 25m", or "45m". */
const formatPlaytime = (seconds) => {
  const minutes = Math.floor((Number(seconds) || 0) / 60)
  const h = Math.floor(minutes / 60)
  return h ? `${h}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`
}
const BOARD_FORMATS = { playtime: formatPlaytime }

/** A board drawn on a canvas (boards.js) on an unlit plane, built once and disposed with its component. */
function useBoard(width, height, size, draw) {
  const board = useMemo(() => {
    const texture = createBoardTexture(width, height, draw)
    const material = new MeshBasicMaterial({ map: texture, transparent: true, side: FrontSide, depthWrite: false })
    const geometry = new PlaneGeometry(size[0], size[1])
    return { texture, material, geometry }
    // Built for its size; what it shows changes through texture.userData.redraw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height])
  useEffect(
    () => () => {
      board.texture.dispose()
      board.material.dispose()
      board.geometry.dispose()
    },
    [board],
  )
  return board
}

/** A leaderboard on the yard's side: the top 8 from the server. */
function Board({ board }) {
  const rows = useGame((s) => s.leaderboards?.[board.id])
  const title = BOARD_TITLES[board.id]
  const format = BOARD_FORMATS[board.id] || formatNumber
  const sign = useBoard(512, 340, [6.6, 4.4], (canvas, redraw) => drawLeaderboard(canvas, redraw, title, [], format))
  useEffect(() => {
    const top = (rows || []).slice(0, 8)
    sign.texture.userData.redraw((canvas, redraw) => drawLeaderboard(canvas, redraw, title, top, format))
  }, [rows, sign, title, format])
  // Just in front of the board's face (it faces the yard).
  const dir = board.x < 0 ? -1 : 1
  return <mesh geometry={sign.geometry} material={sign.material} position={[board.x + dir * 0.13, 3.6, board.z]} rotation={[0, board.yaw, 0]} />
}

/** A team section's banner: its chapter's name, sharper on presets allowing 1024px textures. */
function SectionBanner({ chapter }) {
  const max = useQuality((s) => s.settings.maxTexture)
  const { minX, maxX } = sectionSpan(chapter)
  const size = [maxX - minX - 0.8, 1.3]
  const width = max >= 1024 ? 1024 : 512
  const name = (CHAPTERS.find((c) => c.id === chapter)?.name || chapter).toUpperCase()
  const sign = useBoard(width, Math.round((width * size[1]) / size[0]), size, (canvas, redraw) => drawBanner(canvas, redraw, name, 'TEAM 2 OR 4', PAD_LOOKS[chapter]))
  return <mesh geometry={sign.geometry} material={sign.material} position={[(minX + maxX) / 2, 5.0, SECTION_SIGN_Z + 0.1]} />
}

/** The factory's title board: sharper on presets allowing 1024px textures. */
function TitleBoard({ position }) {
  const max = useQuality((s) => s.settings.maxTexture)
  const width = max >= 1024 ? 1024 : 512
  const sign = useBoard(width, Math.round(width / 3.83), [17.6, 4.6], (canvas, redraw) => drawTitle(canvas, redraw, GAME_NAME.toUpperCase(), 'unscrew every screw to escape!'))
  return <mesh geometry={sign.geometry} material={sign.material} position={position} />
}

/** Keeps the toy material's animated patterns (water, belts) moving. */
function ToyClock() {
  useFrame((state) => advanceToyTime(state.clock.elapsedTime))
  return null
}

/**
 * The lobby: a toy screw factory's yard. Static scenery (the play pads included) is one
 * merged mesh through the shared toy material (one draw call); each moving part (the
 * gears, the crates, the smoke, the pad arrows, the lit seats and sparkles, the
 * displays, the clouds) is one more. Signs are unlit textured planes.
 */
export function Lobby() {
  const yard = useProp(buildYard)
  const perks = STATIONS.find((s) => s.id === 'perks')
  const skins = STATIONS.find((s) => s.id === 'skins')
  const quests = STATIONS.find((s) => s.id === 'quests')
  const front = FACTORY.maxZ
  const particles = useQuality((s) => s.settings.particles)
  return (
    <>
      <ToyClock />
      <primitive object={yard} />
      <Gears />
      <Conveyor />
      <Smoke />
      <PadArrows />
      <FloorArrows />
      <LitSeats />
      {particles && <PadMotes />}
      <StationDisplays />
      <Clouds />
      <TitleBoard position={[0, 9.6, front + 0.5]} />
      {/* SOLO written on its pad, read from the path as you walk up. */}
      <Sign
        lines={[
          { text: 'SOLO', size: 160, fill: '#ffffff' },
          { text: 'play on your own', size: 46, fill: padLook(SOLO_PAD).glow },
        ]}
        options={{}}
        size={[6.8, 3.1]}
        position={[SOLO_PAD.x, 0.15, SOLO_PAD.z + 0.2]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      {PAD_SECTIONS.map(({ chapter }) => (
        <SectionBanner key={chapter} chapter={chapter} />
      ))}
      {TEAM_PADS.map((pad) => (
        <TeamPadSign key={pad.id} pad={pad} />
      ))}
      <Sign lines={[{ text: 'PERKS', size: 110, fill: '#e2d4ff' }]} options={{}} size={[4.4, 1.5]} position={[perks.x - 5.2, 5.55, perks.z]} rotation={[0, Math.PI / 2, 0.12]} />
      <Sign lines={[{ text: 'SKINS', size: 110, fill: '#ffd4e2' }]} options={{}} size={[4.4, 1.5]} position={[skins.x + 5.2, 5.55, skins.z]} rotation={[0, -Math.PI / 2, -0.12]} />
      <Sign lines={[{ text: 'DAILY QUESTS', size: 80, fill: '#ffd23a' }]} options={{}} size={[3.6, 0.9]} position={[quests.x, 3.7, quests.z + 1.8]} rotation={[0, Math.PI, 0]} />
      {LEADERBOARDS.map((board) => (
        <Board key={board.id} board={board} />
      ))}
    </>
  )
}

export default Lobby
