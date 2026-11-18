import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WebGLRenderer } from 'three'

import { prepareAudio } from '../audio/sfx'
import { useBloxity } from '../bloxity/BloxityContext'
import { useBloxityStore } from '../bloxity/store'
import { useGame } from '../store/game'
import { RENDER_SCALES, useQuality } from '../store/quality'
import ErrorBoundary from '../ui/ErrorBoundary'
import BlobShadows from './BlobShadows'
import FollowCamera from './FollowCamera'
import Particles from './fx/Particles'
import { updatePopups } from './fx/popups'
import Lighting from './Lighting'
import Lobby from './lobby/Lobby'
import LobbyPlayer from './lobby/LobbyPlayer'
import PerfProbe from './PerfProbe'
import RemoteAvatars from './remote/RemoteAvatars'
import RemotePlayers from './remote/RemotePlayers'
import { FOG, SKY } from './sceneStyle'
import ShaderWarmup from './ShaderWarmup'
import Sky from './Sky'
import { RunStage } from './stageLoader'

// r3f-perf is a dev-only overlay (?perf in the URL). The DEV check is static, so the
// import and the package are dropped from production builds entirely.
const DevPerf = import.meta.env.DEV ? lazy(() => import('r3f-perf').then((m) => ({ default: m.Perf }))) : null
const showDevPerf = import.meta.env.DEV && new URLSearchParams(window.location.search).has('perf')


/** Fires `onFirstFrame` after the renderer has actually drawn once. */
function FirstFrameSignal({ onFirstFrame }) {
  const fired = useRef(false)
  useFrame(() => {
    if (fired.current) return
    fired.current = true
    performance.mark('pp:first-frame')
    setTimeout(onFirstFrame, 0)
  })
  return null
}

/** Keeps the camera's far plane in step with the preset's view distance. */
function ViewDistance({ far }) {
  const get = useThree((s) => s.get)
  useEffect(() => {
    const { camera } = get()
    camera.far = far
    camera.updateProjectionMatrix()
  }, [get, far])
  return null
}

/**
 * The camera's vertical field of view for a screen `aspect` wide: 60 degrees on a
 * landscape screen, wider held upright so the view isn't a narrow slit; first person in
 * a room a little wider still.
 */
const fovForAspect = (aspect, firstPerson) => {
  const base = firstPerson ? 70 : 60
  return aspect >= 1 ? base : Math.min(90, base / Math.sqrt(Math.max(0.3, aspect)))
}

function AspectFov({ firstPerson }) {
  const get = useThree((s) => s.get)
  const width = useThree((s) => s.size.width)
  const height = useThree((s) => s.size.height)
  useEffect(() => {
    const { camera } = get()
    camera.fov = fovForAspect(width / Math.max(1, height), firstPerson)
    camera.updateProjectionMatrix()
  }, [get, width, height, firstPerson])
  return null
}

/** Moves the DOM popups (+$, GOLD!) to their points each frame. */
function PopupDriver() {
  useFrame((state) => updatePopups(state.camera, state.size.width, state.size.height))
  return null
}

/** The lobby: the yard, everyone in it, you and the orbit camera. */
function LobbyScene({ onAvatarReady }) {
  return (
    <>
      <Sky />
      <Lighting />
      <Lobby />
      <RemotePlayers />
      <RemoteAvatars />
      <LobbyPlayer onAvatarReady={onAvatarReady} />
      <BlobShadows />
      <FollowCamera />
    </>
  )
}

/**
 * The 3D view. Owns the renderer lifecycle: quality-driven settings, automatic preset
 * drops when FPS falls under budget, recovery from a lost WebGL context - and which
 * world is on screen: the lobby, or (inside a run) the room you're in.
 *
 * @param {{ onReady?: () => void }} props called once a frame has been drawn
 */
export function GameScene({ onReady }) {
  const { game } = useBloxity()
  const settings = useQuality((s) => s.settings)
  const antialias = useQuality((s) => s.antialias)
  const rebuild = useQuality((s) => s.rebuild)
  const degrade = useQuality((s) => s.degrade)
  const recover = useQuality((s) => s.recover)
  const renderScale = useQuality((s) => RENDER_SCALES[s.renderStep])
  const adBreak = useBloxityStore((s) => s.adBreak)
  const inRun = useGame((s) => Boolean(s.profile.run?.active))

  const [warmedUp, setWarmedUp] = useState(false)
  const [firstFrame, setFirstFrame] = useState(false)
  const [contextKey, setContextKey] = useState(0)
  const [contextLost, setContextLost] = useState(false)
  const [warmedRebuild, setWarmedRebuild] = useState(0)
  const rebuilding = rebuild !== warmedRebuild
  const readySent = useRef(false)

  const handleWarmedUp = useCallback(() => {
    setWarmedUp(true)
    setWarmedRebuild(useQuality.getState().rebuild)
  }, [])
  const handleFirstFrame = useCallback(() => setFirstFrame(true), [])

  useEffect(() => {
    game.loadingStep('Preparing scene…')
  }, [game])

  useEffect(() => {
    if (!warmedUp || !firstFrame || readySent.current) return
    readySent.current = true
    performance.mark('pp:ready')
    game.loadingEnd()
    onReady?.()
    // The audio engine waits for the first idle moment after the game is up; a tap that
    // beats it there builds it on the spot (sfx.unlock).
    if ('requestIdleCallback' in window) requestIdleCallback(prepareAudio, { timeout: 1500 })
    else setTimeout(prepareAudio, 200)
  }, [warmedUp, firstFrame, game, onReady])

  // Entering a run: the cover goes up until the room has drawn (RunStage clears it).
  useEffect(() => {
    if (inRun) useGame.getState().setEntering(true)
    else useGame.getState().setEntering(false)
  }, [inRun])

  // A lost context (GPU reset, too many tabs, backgrounded on mobile) is recovered by
  // remounting the canvas, which builds a fresh context and re-uploads everything.
  // Game state lives in stores, so nothing is lost but a moment of rendering.
  const handleCreated = useCallback(({ gl }) => {
    performance.mark('pp:gl-created')
    gl.setClearColor(SKY.horizon)
    gl.debug.checkShaderErrors = import.meta.env.DEV
    const canvas = gl.domElement
    let remountTimer = null
    const remount = () => {
      clearTimeout(remountTimer)
      setContextLost(false)
      setContextKey((k) => k + 1)
    }
    canvas.addEventListener('webglcontextlost', (e) => {
      if (!canvas.isConnected) return
      e.preventDefault()
      setContextLost(true)
      remountTimer = setTimeout(remount, 1500)
    })
    canvas.addEventListener('webglcontextrestored', remount)
  }, [])

  // Never set state from the monitor's frame callback directly.
  const handleDecline = useCallback(() => setTimeout(degrade, 0), [degrade])
  const handleIncline = useCallback(() => setTimeout(recover, 0), [recover])

  const dpr = Math.min(settings.dpr, window.devicePixelRatio || 1) * renderScale

  const createRenderer = useMemo(
    () => (defaults) => {
      performance.mark('pp:gl-start')
      const renderer = new WebGLRenderer({ ...defaults, alpha: false, antialias, stencil: false, powerPreference: 'high-performance' })
      performance.mark('pp:gl-end')
      return renderer
    },
    [antialias],
  )

  return (
    <>
      <Canvas
        key={`${contextKey}:${rebuild}`}
        frameloop={adBreak ? 'never' : 'always'}
        dpr={dpr}
        gl={createRenderer}
        // Realtime shadows only on HIGH, and only the lobby's sun casts them.
        shadows={settings.shadows === 'realtime' && !inRun ? 'percentage' : false}
        flat
        camera={{ position: [0, 6, 26], fov: 60, near: 0.5, far: settings.viewDistance }}
        onCreated={handleCreated}
      >
        <fog attach="fog" args={[FOG.color, settings.fogNear, settings.viewDistance * 0.95]} />
        <ViewDistance far={settings.viewDistance} />
        <AspectFov firstPerson={inRun} />
        {/* Under 45 FPS: shed load (quality.degrade). Back over 58 with room to spare:
            resolution comes back (quality.recover). */}
        <PerformanceMonitor bounds={() => [45, 58]} flipflops={4} onDecline={handleDecline} onIncline={handleIncline} />

        {inRun ? (
          <Suspense fallback={null}>
            <RunStage />
          </Suspense>
        ) : (
          <LobbyScene />
        )}
        <Particles />
        <PopupDriver />

        <ShaderWarmup onDone={handleWarmedUp} />
        {warmedUp && <FirstFrameSignal onFirstFrame={handleFirstFrame} />}
        <PerfProbe />
        {showDevPerf && DevPerf && (
          <ErrorBoundary>
            <Suspense fallback={null}>
              <DevPerf position="bottom-right" minimal />
            </Suspense>
          </ErrorBoundary>
        )}
      </Canvas>

      {(contextLost || rebuilding) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-sky-400/80 text-2xl text-white">
          <span className="pp-stroke">Reloading graphics…</span>
        </div>
      )}
    </>
  )
}

export default GameScene
