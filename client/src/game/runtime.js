import { Vector3 } from 'three'

import { SPAWN } from '@shared/world'

/**
 * Per-frame mutable state shared between systems.
 *
 * Deliberately outside React and zustand: it changes every frame, nothing should
 * re-render because of it, and every reader lives in a `useFrame` or a timer. UI that
 * needs a slow-changing derivative of it (which station you stand at, say) gets it from
 * the 10 Hz game ticker, the only thing that copies from here into the store.
 *
 * In the lobby `player.position` is lobby coordinates; inside a run it's the room's own
 * (see shared/layout.js). The server tracks the same.
 */
export const runtime = {
  player: {
    position: new Vector3(SPAWN.x, 0, SPAWN.z),
    /** Facing, radians about +Y. PI faces north (-Z). In a room, the first-person yaw. */
    yaw: Math.PI,
    /** First-person look up/down (radians, + up). */
    pitch: 0,
    speed: 0,
    grounded: true,
    /** 'idle' | 'walk' | 'jump' - what other players see. */
    anim: 'idle',
    /** Set when the controller should ignore input (countdown, results screen). */
    frozen: false,
  },

  /** Touch input, written by the on-screen controls. */
  input: {
    /** Joystick, -1..1, +y = forward. */
    joyX: 0,
    joyY: 0,
    jump: false,
    /** The on-screen USE button (unscrew), held. */
    use: false,
    /** Look drag accumulated since the controller last read it, in pixels. */
    lookX: 0,
    lookY: 0,
    /**
     * A finger held on the view in a room: it unscrews what's under it. `x`, `y` in CSS
     * pixels from the view's corner (for the progress ring), `nx`, `ny` the same point in
     * normalised device coordinates (for the aim ray).
     */
    touchAim: { active: false, x: 0, y: 0, nx: 0, ny: 0 },
  },

  /** Lobby orbit camera (FollowCamera). */
  camera: {
    mode: 'follow',
    yaw: 0,
    pitch: 0.36,
    distance: 11,
    snap: false,
  },

  /**
   * What you're doing in a room, for the HUD's crosshair ring and the viewmodel:
   * `progress` (0-1) through the current unscrew, `target` the aimed screw (-1 = none),
   * `tooFar` when the aimed screw is past your reach, `working` while the tool turns.
   */
  aim: { target: -1, progress: 0, tooFar: false, working: false, bagFull: false },

  /**
   * Things that get a blob shadow on low presets. Each entry is
   * `{ position: Vector3, size: number, visible?: boolean }`.
   */
  shadowCasters: new Set(),
}

/** Puts the player at (x, z), facing `yaw` (a teleport from the server, or a respawn). */
export function placePlayer(x, z, yaw = Math.PI) {
  runtime.player.position.set(x, 0, z)
  runtime.player.yaw = yaw
  runtime.player.pitch = 0
  runtime.camera.yaw = yaw - Math.PI
  runtime.camera.snap = true
}

/** Back to the lobby spawn, e.g. after a reconnect into a fresh lobby. */
export function respawn() {
  placePlayer(SPAWN.x, SPAWN.z, Math.PI)
}
