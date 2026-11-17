import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from 'three'

import { DROP_AIR, TROPHY_FIRST, TROPHY_SPACING } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { trophyValue, winsMultiplier } from '@shared/logic'
import { mulberry32 } from '@shared/rng'

import { sfx } from '../../audio/sfx'
import { getGame, useGame } from '../../store/game'
import { getQuality, useQuality } from '../../store/quality'
import { iconUrl } from '../../ui/icons'
import { asToyInstance, createToyInstances, PropBuilder } from '../blocks'
import FireBurst from '../fx/FireBurst'
import { spawnScattered } from '../fx/popups'
import { linkPrograms } from '../linkPrograms'
import { sharedMaterials, STYLE } from '../materials'
import { addPhone, phoneDims, phoneTrail } from '../phoneStyles'
import { runtime } from '../runtime'
import { activeWorld, showLobbySky, zones } from '../worldLook'
import Debris from './Debris'
import { PHONE_SCALE, T_RELEASE, yAtMeter } from './dropPath'
import { writeDistance, writeSpeed, writeZone } from './hudLink'
import { floorNameGradient } from './roomThemes'
import { advanceRoll, roll } from './rollControl'
import SpeedBlur from './SpeedBlur'
import Tower from './Tower'

const MAX_TROPHIES = 12
const STREAKS = 36
/**
 * Frame-loop priority: before every other system, so the camera has moved before anything
 * projects into it (name tags, popups). Negative, so R3F still renders itself.
 */
const BEFORE_EVERYTHING = -1

const _m = new Matrix4()
const _q = new Quaternion()
const _qa = new Quaternion()
const _p = new Vector3()
const _s = new Vector3()
const _v = new Vector3()
const _look = new Vector3()
const _want = new Vector3()
const _wantLook = new Vector3()
const _ax = new Vector3(1, 0, 0)
const _ay = new Vector3(0, 1, 0)
const _az = new Vector3(0, 0, 1)
/** The camera's offset from the phone and where it looks (from the phone), both eased. */
const camOffset = new Vector3()
const lookOffset = new Vector3()
/** Stable vector for runtime.flightFocus (the scratch ones are reused mid-frame). */
const phoneFocus = new Vector3()

/** The camera's field of view widens with speed, up to this much more. */
const FOV_KICK = 14
const SPEED_SHAKE = 0.06
const HIT_SHAKE = 0.75
const HIT_SHAKE_MS = 170

/** At most one trophy popup this often; the trophies in between are summed into it. */
const TROPHY_POPUP_MS = 160
const TROPHY_POPUP = { iconUrl: iconUrl('trophy'), scale: 1.2 }

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Speed-line streaks, made once: alternately down the left and right of the view, each a
 * little thicker or longer than the next, and every third tinted with your phone's colour.
 */
const streakState = (() => {
  const r = mulberry32(5)
  return Array.from({ length: STREAKS }, (_, i) => ({
    a: (i % 2 ? 0 : Math.PI) + (r() - 0.5) * 1.6,
    r: 2.8 + r() * 4,
    z: -r() * 30,
    width: 0.06 + r() * 0.06,
    length: 0.7 + r() * 0.6,
    tinted: i % 3 === 0,
  }))
})()
const STREAKS_FROM = 20
const STREAKS_FULL = 70
const WHITE = new Color('#ffffff')
const _tint = new Color()

function createStreakGeometry() {
  const geometry = new BufferGeometry()
  const positions = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5]
  const uvs = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  return geometry
}

const streakVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying float vDepth;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vColor = vec3(1.0);
    #ifdef USE_INSTANCING_COLOR
      vColor = instanceColor;
    #endif
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const streakFragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vDepth;
  varying vec3 vColor;
  void main() {
    float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
    float along = smoothstep(0.0, 0.75, vUv.y) * (1.0 - smoothstep(0.9, 1.0, vUv.y));
    float depth = smoothstep(1.5, 6.0, vDepth) * (1.0 - smoothstep(24.0, 34.0, vDepth));
    gl_FragColor = vec4(vColor, across * across * along * depth * uOpacity);
    #include <colorspace_fragment>
  }
`

function createTrophyGeometry() {
  const p = new PropBuilder()
  const gold = '#ffcc1f'
  p.add(new CylinderGeometry(0.42, 0.24, 0.62, 12), { position: [0, 0.55, 0], color: gold, style: STYLE.GLOW })
  p.add(new TorusGeometry(0.2, 0.06, 6, 10, Math.PI), { position: [-0.42, 0.62, 0], rotation: [0, 0, Math.PI / 2], color: gold })
  p.add(new TorusGeometry(0.2, 0.06, 6, 10, Math.PI), { position: [0.42, 0.62, 0], rotation: [0, 0, -Math.PI / 2], color: gold })
  p.add(new CylinderGeometry(0.08, 0.08, 0.3, 6), { position: [0, 0.12, 0], color: gold })
  p.box(0, -0.05, 0, 0.5, 0.14, 0.5, '#ffb01e', STYLE.SMOOTH)
  return p.build()
}

/** White shattered-glass lines from a point near the screen's top, on a small canvas. */
function createScreenCrackTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 256
  const g = canvas.getContext('2d')
  const r = mulberry32(7)
  const cx = 52
  const cy = 92
  g.strokeStyle = 'rgba(255,255,255,0.95)'
  g.lineCap = 'round'
  for (let i = 0; i < 11; i += 1) {
    let a = (i / 11) * Math.PI * 2 + r() * 0.4
    let x = cx
    let y = cy
    g.lineWidth = 3.2
    g.beginPath()
    g.moveTo(x, y)
    const len = 50 + r() * 110
    for (let d = 0; d < len; d += 12) {
      a += (r() - 0.5) * 0.6
      x += Math.cos(a) * 12
      y += Math.sin(a) * 12
      g.lineTo(x, y)
    }
    g.stroke()
  }
  // A ring of short cracks round the impact point.
  g.lineWidth = 2
  g.beginPath()
  for (let i = 0; i <= 12; i += 1) {
    const a = (i / 12) * Math.PI * 2
    const rr = 14 + r() * 6
    if (i === 0) g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
    else g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  g.stroke()
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.generateMipmaps = false
  return texture
}

/**
 * The falling phone: one merged mesh for the phone being dropped, rebuilt if that changes,
 * with a cracked-screen overlay on it that shows once it has smashed down onto its floor.
 */
function createPhoneMesh(id, crackTexture) {
  const p = new PropBuilder()
  addPhone(p, id, { scale: PHONE_SCALE })
  const dims = phoneDims(id)
  const mesh = asToyInstance(p.build(), sharedMaterials().toy)
  mesh.matrixAutoUpdate = true
  mesh.frustumCulled = false
  mesh.visible = false
  const crack = new Mesh(
    new PlaneGeometry((dims.width - 0.06) * PHONE_SCALE, (dims.length - 0.08) * PHONE_SCALE),
    new MeshBasicMaterial({ map: crackTexture, transparent: true, depthWrite: false }),
  )
  crack.rotation.x = -Math.PI / 2
  crack.position.y = (dims.thickness / 2 + 0.03) * PHONE_SCALE
  crack.visible = false
  crack.name = 'screen-crack'
  mesh.add(crack)
  mesh.userData.crack = crack
  return mesh
}

/** Where the camera sits (from the phone) and looks (from the phone) in each part of the drop. */
function cameraAim(elapsed, outOffset, outLook) {
  if (roll.phase === 'throw') {
    // Over your shoulder at the edge, looking out and down at the hotel far below.
    outOffset.set(1.4, 1.6, 5.2)
    outLook.set(0, -18, -20)
  } else if (roll.phase === 'air') {
    // Chasing it down through the sky: behind it at first, then above it, looking down.
    const u = smoothstep(0, 1, (elapsed - T_RELEASE) / DROP_AIR)
    outOffset.set(0.6 * (1 - u), 4 + 6.5 * u, 8 - 4.4 * u)
    outLook.set(0, -3 - 2 * u, -3 * (1 - u))
  } else if (roll.phase === 'tower') {
    // Straight down through the hotel, just behind the phone so the camera comes through
    // the holes it punches.
    outOffset.set(0, 7.4, 2.1)
    outLook.set(0, -1, -0.3)
  } else {
    // Stopped: close over the phone as it slams down, then drawing back to the south to
    // take in the room it wrecked - its north wall, the crater, the rubble.
    const since = Math.max(0, (performance.now() - roll.landedAt) / 1000)
    const u = smoothstep(0.4, 1.8, since)
    outOffset.set(0, 5.6 + 3 * u, 3.2 + 4.6 * u)
    outLook.set(0, 0.5 * u, -0.2 - 2.6 * u)
  }
}

/**
 * Lazily loaded: everything below the cliff edge - the hotel and the city (Tower), the
 * falling phone, the debris, the trophies on the way down, the speed lines and the camera
 * while it falls. While nobody is dropping it still shows the hotel and the city far
 * below, which is what you see from the edge of the lobby.
 */
export default function Roll() {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)
  const gl = useThree((s) => s.gl)
  const rootRef = useRef(null)
  const trophyRef = useRef(null)
  const streakRef = useRef(null)
  const phoneRef = useRef(null)
  const streakTintedFor = useRef(-1)
  const startedFor = useRef(0)
  const trophyTally = useRef({ next: TROPHY_FIRST, pending: 0, shownAt: 0 })
  const zoneShown = useRef(-2)
  const wasActive = useRef(false)
  const baseFov = useRef(60)
  const motionBlur = useQuality((s) => s.settings.motionBlur)
  const antialias = useQuality((s) => s.antialias)
  const rolling = useGame((s) => Boolean(s.roll))
  const equipped = useGame((s) => s.profile.equippedTire)

  const assets = useMemo(() => {
    const trophies = createToyInstances(createTrophyGeometry(), sharedMaterials().toy, MAX_TROPHIES)
    const streakMaterial = new ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: streakVertexShader,
      fragmentShader: streakFragmentShader,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    })
    const streakMesh = new InstancedMesh(createStreakGeometry(), streakMaterial, STREAKS)
    for (let i = 0; i < STREAKS; i += 1) streakMesh.setColorAt(i, WHITE)
    streakMesh.frustumCulled = false
    streakMesh.count = 0
    return { trophies, streakMesh, streakMaterial }
  }, [])

  // The phone mesh for whichever phone is being dropped (your equipped one).
  const crackTexture = useMemo(() => createScreenCrackTexture(), [])
  useEffect(() => () => crackTexture.dispose(), [crackTexture])
  const phone = useMemo(() => createPhoneMesh(equipped, crackTexture), [equipped, crackTexture])
  useEffect(
    () => () => {
      const crack = phone.userData.crack
      crack.geometry.dispose()
      crack.material.dispose()
      phone.geometry.dispose()
      phone.dispose()
    },
    [phone],
  )

  // This module loads after the lobby is on screen; compile its shaders in the background
  // before showing it, so the first drop doesn't stall on them.
  useEffect(() => {
    const root = rootRef.current
    if (!root || import.meta.env.DEV) return undefined
    let cancelled = false
    // compile() only gathers what's visible: the falling phone, its cracked screen and the
    // effects all start hidden, so everything is shown for the gathering and hidden again
    // straight after - otherwise their shaders compile mid-drop, the first time each shows.
    root.visible = true
    const hidden = []
    root.traverse((object) => {
      if (object.visible) return
      hidden.push(object)
      object.visible = true
    })
    const compiling = gl.compileAsync(root, camera, scene)
    for (const object of hidden) object.visible = false
    root.visible = false
    compiling
      .catch(() => null)
      .finally(() => {
        if (cancelled) return
        linkPrograms(gl)
        root.visible = true
      })
    return () => {
      cancelled = true
    }
  }, [gl, camera, scene])

  useEffect(
    () => () => {
      assets.trophies.geometry.dispose()
      assets.trophies.dispose()
      assets.streakMesh.geometry.dispose()
      assets.streakMaterial.dispose()
      assets.streakMesh.dispose()
      showLobbySky(null)
    },
    [assets],
  )

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const settings = getQuality()
    const now = performance.now()

    // --- The drop -----------------------------------------------------------------
    let speed = 0
    if (roll.active) {
      advanceRoll(state.clock.elapsedTime)
      const p = roll.position
      if (startedFor.current !== roll.startedAt) {
        startedFor.current = roll.startedAt
        // Ease from wherever the lobby camera was.
        camOffset.copy(camera.position).sub(p)
        lookOffset.set(0, 0, -10)
        baseFov.current = camera.fov
        const tally = trophyTally.current
        tally.next = TROPHY_FIRST
        tally.pending = 0
        tally.shownAt = 0
        zoneShown.current = -2
      }
      speed = roll.speed
      runtime.flightFocus = phoneFocus.copy(p)
      writeDistance(roll.meter)
      // The floor's name as the phone comes into it.
      const zi = roll.roofBroken ? roll.floor : -1
      if (zi !== zoneShown.current) {
        zoneShown.current = zi
        if (zi >= 0) writeZone(zi, zones()[zi].name, floorNameGradient(activeWorld(), zi))
        else writeZone(-1, ' ', 'linear-gradient(180deg, #ffffff, #ffffff)')
      }

      // The wind, swelling with the fall, gone once it stops.
      if (roll.phase === 'air' || roll.phase === 'tower') {
        sfx.windStart()
        sfx.windSet(Math.min(1, speed / 90), true, 0)
      } else if (roll.landed) {
        sfx.windStop()
      }

      // The phone itself, once it has left your hand.
      const mesh = phoneRef.current
      if (mesh) {
        mesh.visible = !roll.inHand
        // Its screen cracks as it smashes down onto its floor.
        const crack = mesh.children[0]
        if (crack) crack.visible = roll.landed
        if (!roll.inHand) {
          mesh.position.copy(p)
          _q.setFromAxisAngle(_ay, roll.yaw)
          _q.multiply(_qa.setFromAxisAngle(_ax, roll.tumble))
          _q.multiply(_qa.setFromAxisAngle(_az, roll.tilt))
          mesh.quaternion.copy(_q)
        }
      }

      if (runtime.camera.mode === 'roll') {
        const elapsed = (now - roll.startedAt - roll.lag) / 1000
        cameraAim(elapsed, _want, _wantLook)
        // Quick to settle into each shot, quicker still once falling fast.
        const k = 1 - Math.exp(-(roll.phase === 'throw' ? 5 : roll.phase === 'tower' ? 14 : 6) * delta)
        camOffset.lerp(_want, k)
        lookOffset.lerp(_wantLook, k)
        const sinceHit = now - roll.hitAt
        const amp =
          (roll.phase === 'air' || roll.phase === 'tower' ? Math.min(1, speed / 90) * SPEED_SHAKE : 0) +
          (sinceHit < HIT_SHAKE_MS * 3 ? HIT_SHAKE * Math.exp(-sinceHit / HIT_SHAKE_MS) : 0)
        camera.position.set(p.x + camOffset.x + (Math.random() - 0.5) * amp, p.y + camOffset.y + (Math.random() - 0.5) * amp, p.z + camOffset.z)
        camera.lookAt(_look.copy(p).add(lookOffset))
        // The view widens with speed, and punches wider for a moment on every smash.
        const punch = sinceHit < 500 ? 6 * Math.exp(-sinceHit / 120) : 0
        const fov = baseFov.current + punch + (roll.phase === 'air' || roll.phase === 'tower' ? Math.min(FOV_KICK, speed * 0.12) : roll.landed ? -4 : 0)
        const lens = state.camera
        if (Math.abs(fov - lens.fov) > 0.05) {
          lens.fov += (fov - lens.fov) * (1 - Math.exp(-4 * delta))
          lens.updateProjectionMatrix()
        }
      }
    } else if (phoneRef.current) {
      phoneRef.current.visible = false
    }
    if (wasActive.current && !roll.active) {
      state.camera.fov = baseFov.current
      state.camera.updateProjectionMatrix()
      sfx.windStop()
      showLobbySky(scene.fog)
    }
    wasActive.current = roll.active

    // --- Trophies on the way down -----------------------------------------------------
    const trophies = trophyRef.current
    if (trophies) {
      let count = 0
      if (roll.active && roll.roofBroken) {
        // Tally the ones just passed: the Wins came with the drop; this is the receipt.
        const tally = trophyTally.current
        while (tally.next <= Math.min(roll.meter, roll.distance)) {
          tally.pending += trophyValue(tally.next, activeWorld())
          tally.next += TROPHY_SPACING
        }
        if (tally.pending > 0 && now - tally.shownAt >= TROPHY_POPUP_MS) {
          const multiplier = winsMultiplier(getGame().profile, Date.now())
          spawnScattered(`+${formatNumber(Math.round(tally.pending * multiplier))}`, TROPHY_POPUP)
          sfx.trophy()
          tally.pending = 0
          tally.shownAt = now
        }
        // The next few still below the phone, spinning on its path.
        const spin = now * 0.004
        for (let m = tally.next; m <= roll.distance && count < MAX_TROPHIES; m += TROPHY_SPACING) {
          const y = yAtMeter(m, roll.distance, roll.end)
          if (y < roll.position.y - 70) break
          _p.set(roll.position.x, y + 0.5, roll.position.z)
          _q.setFromAxisAngle(_ay, spin + m)
          _s.setScalar(1.6)
          trophies.setMatrixAt(count, _m.compose(_p, _q, _s))
          count += 1
        }
      }
      trophies.count = count
      trophies.instanceMatrix.needsUpdate = true
    }

    // --- Speed lines --------------------------------------------------------------
    const falling = roll.active && (roll.phase === 'air' || roll.phase === 'tower')
    writeSpeed(falling ? smoothstep(STREAKS_FROM, STREAKS_FULL * 1.5, speed) : 0, now)
    const lines = streakRef.current
    if (lines) {
      if (!(falling && settings.speedLines && speed > STREAKS_FROM)) {
        lines.count = 0
      } else {
        if (streakTintedFor.current !== roll.startedAt) {
          streakTintedFor.current = roll.startedAt
          _tint.set(phoneTrail(roll.tireId)).lerp(WHITE, 0.35)
          for (let i = 0; i < STREAKS; i += 1) lines.setColorAt(i, streakState[i].tinted ? _tint : WHITE)
          lines.instanceColor.needsUpdate = true
        }
        const fast = Math.min(speed, 300)
        lines.material.uniforms.uOpacity.value = smoothstep(STREAKS_FROM, STREAKS_FULL, speed)
        const travel = fast * delta * 0.6
        lines.count = STREAKS
        for (let i = 0; i < STREAKS; i += 1) {
          const st = streakState[i]
          st.z += travel
          if (st.z > 4) st.z -= 34
          _v.set(Math.cos(st.a) * st.r * 1.15, Math.sin(st.a) * st.r * 0.75, st.z - 4)
          _v.applyQuaternion(camera.quaternion).add(camera.position)
          _q.copy(camera.quaternion)
          _s.set(st.width, st.width, (2 + fast * 0.02) * st.length)
          lines.setMatrixAt(i, _m.compose(_v, _q, _s))
        }
        lines.instanceMatrix.needsUpdate = true
      }
    }
  }, BEFORE_EVERYTHING)

  return (
    <group ref={rootRef}>
      <Tower />
      <Debris />
      <FireBurst />
      <primitive ref={phoneRef} object={phone} />
      <primitive ref={trophyRef} object={assets.trophies} />
      <primitive ref={streakRef} object={assets.streakMesh} />
      {rolling && motionBlur > 0 && <SpeedBlur samples={motionBlur} antialias={antialias} />}
    </group>
  )
}
