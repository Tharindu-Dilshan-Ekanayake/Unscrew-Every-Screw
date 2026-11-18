import { Vector3 } from 'three'

import { runtime } from '../game/runtime'
import { getGame, inRun } from '../store/game'

/**
 * Other players, as the network last described them. Network callbacks write here;
 * the renderer reads it each frame and interpolates between snapshots, drawing
 * everyone ~110 ms in the past so 10 Hz updates still move smoothly.
 *
 * In the lobby you see everyone else in the lobby; inside a run, your party (the players
 * in the same run) - everyone else is in rooms of their own.
 */

/** sessionId -> remote player */
export const remotePlayers = new Map()

const MAX_SNAPSHOTS = 24

/** Everyone's synced state, wherever they are, so a change can redraw them. */
const latest = new Map()

function visibleTo(state) {
  const game = getGame()
  if (!inRun(game)) return !state.inRun
  const myRun = game.profile.run?.runId || ''
  return Boolean(myRun) && state.runId === myRun
}

export function upsertRemotePlayer(sessionId, state) {
  latest.set(sessionId, state)
  if (!visibleTo(state)) {
    dropRemotePlayer(sessionId)
    return
  }
  let r = remotePlayers.get(sessionId)
  if (!r) {
    r = {
      sessionId,
      name: '',
      /** Their verified Boxity user id ('' for guests): matches Boxity chat to them. */
      uid: '',
      snaps: [],
      position: new Vector3(state.x, state.y, state.z),
      yaw: state.rotY,
      speed: 0,
      anim: 'idle',
      skin: 'classic',
      screws: 0,
      /** Their avatar's outfit, parsed from `look`; `lookKey` is the raw string. */
      look: null,
      lookKey: '',
      walkPhase: 0,
    }
    r.shadow = { position: r.position.clone(), size: 1.1, visible: true }
    runtime.shadowCasters.add(r.shadow)
    remotePlayers.set(sessionId, r)
  }
  r.name = state.name
  r.uid = state.uid || ''
  r.anim = state.anim
  r.skin = state.skin || 'classic'
  r.screws = state.screws || 0
  if (state.look !== r.lookKey) {
    r.lookKey = state.look
    try {
      r.look = state.look ? JSON.parse(state.look) : null
    } catch {
      r.look = null
    }
  }
  const last = r.snaps[r.snaps.length - 1]
  if (!last || last.x !== state.x || last.y !== state.y || last.z !== state.z || last.r !== state.rotY) {
    r.snaps.push({ t: performance.now(), x: state.x, y: state.y, z: state.z, r: state.rotY })
    if (r.snaps.length > MAX_SNAPSHOTS) r.snaps.shift()
  }
}

/** You went into a run or came out: shows or hides everyone accordingly. */
export function refreshRemoteVisibility() {
  for (const [sessionId, state] of latest) upsertRemotePlayer(sessionId, state)
}

export function removeRemotePlayer(sessionId) {
  latest.delete(sessionId)
  dropRemotePlayer(sessionId)
}

function dropRemotePlayer(sessionId) {
  const r = remotePlayers.get(sessionId)
  if (!r) return
  runtime.shadowCasters.delete(r.shadow)
  remotePlayers.delete(sessionId)
}

export function clearRemotePlayers() {
  for (const id of [...remotePlayers.keys()]) removeRemotePlayer(id)
  latest.clear()
}
