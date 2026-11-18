import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'

import { DRONE_RADIUS, SCREW_CRYSTAL, toolById } from '@shared/balance'
import { actionTime, bagCapacity, droneRate, reachOf } from '@shared/logic'

import { sfx } from '../../audio/sfx'
import { actions } from '../../net/actions'
import { getGame } from '../../store/game'
import { queueHint } from '../hints'
import { roomState, takeScrew } from '../roomState'
import { runtime } from '../runtime'
import { droneState, gather, nearestScrew, pick, queuePop, turning } from './aim'
import { wantsUse } from './fpInput'

const _dir = new Vector3()
const _origin = new Vector3()
const _hit = { screw: -1, surface: -1, distance: Infinity }
const _targets = []
const _batch = []
const _droneBatch = []
/** Screws per message at most (the server's limit is 64). */
const MAX_BATCH = 48

/** Hand driver: a ratchet tick this often while it turns. */
const TICK_EVERY = 0.11

/**
 * The work: what you're aiming at, turning it while you hold, and taking it when the turn
 * completes - predicted at once (the screw pops and flies to your bag) and sent to the
 * authority in batches, which answers with what it accepted.
 *
 * Area tools turn every screw in their radius around the one you aim at, at once. A full
 * bag stops plain and gold screws (crystal screws need no room). Also flies your Helper
 * Drone: a screw near you every so often.
 */
export function Unscrewer({ layout }) {
  const camera = useThree((s) => s.camera)
  const state = useRef({ target: -1, progress: 0, tickIn: 0, fullHintAt: 0, farHintAt: 0, motor: false, droneIn: 1, droneTarget: -1, droneT: 0 })

  useEffect(
    () => () => {
      turning.ids.length = 0
      turning.progress = 0
      droneState.active = false
      runtime.aim.target = -1
      runtime.aim.progress = 0
      runtime.aim.working = false
      sfx.motorStop()
    },
    [],
  )

  useFrame((_s, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const st = state.current
    const game = getGame()
    const profile = game.profile
    const run = profile.run
    const aim = runtime.aim
    if (!run?.active || roomState.layout !== layout) return
    const blocked = runtime.player.frozen || game.panel !== null || game.clear !== null
    const now = Date.now()
    const tool = toolById(run.tool) || toolById('driver')
    const capacity = bagCapacity(profile)
    const bagUsed = run.bag + roomState.pendingBag
    aim.bagFull = bagUsed >= capacity

    // --- Aim: the crosshair, or a finger held on a screw -----------------------------
    const touch = runtime.input.touchAim
    _origin.copy(camera.position)
    if (touch.active) _dir.set(touch.nx, touch.ny, 0.5).unproject(camera).sub(_origin).normalize()
    else camera.getWorldDirection(_dir)
    pick(layout, _origin, _dir, _hit)
    const reach = reachOf(profile)
    const target = _hit.screw
    const tooFar = target >= 0 && _hit.distance > reach
    aim.target = tooFar ? -1 : target
    aim.tooFar = tooFar
    if (target !== st.target) {
      st.target = target
      st.progress = 0
    }

    // --- Turning -----------------------------------------------------------------
    const using = !blocked && (wantsUse() || touch.active)
    let working = false
    if (using && target >= 0) {
      if (tooFar) {
        if (now - st.farHintAt > 1500) {
          st.farHintAt = now
          queueHint('TOO FAR! Get closer')
        }
      } else {
        gather(layout, target, tool.radius, tool.max, _targets)
        // Only as many plain/gold screws as the bag still has room for.
        let room = capacity - bagUsed
        let k = 0
        for (let n = 0; n < _targets.length; n += 1) {
          const i = _targets[n]
          if (roomState.kinds[i] === SCREW_CRYSTAL) _targets[k++] = i
          else if (room > 0) {
            _targets[k++] = i
            room -= 1
          }
        }
        _targets.length = k
        if (k === 0) {
          if (now - st.fullHintAt > 1800) {
            st.fullHintAt = now
            sfx.bagFull()
            queueHint('BAG FULL! Walk onto the SELL hopper')
          }
        } else {
          working = true
          const time = actionTime(profile, tool.id, now)
          st.progress += delta / time
          turning.ids.length = 0
          for (let n = 0; n < k; n += 1) turning.ids.push(_targets[n])
          // The sound of it: a ratchet ticking for the hand driver, a motor otherwise.
          if (tool.id === 'driver') {
            st.tickIn -= delta
            if (st.tickIn <= 0) {
              st.tickIn = TICK_EVERY
              sfx.tick()
            }
          } else {
            if (!st.motor) {
              st.motor = true
              sfx.motorStart(tool.id === 'drill' ? 0.75 : tool.id === 'ratchet' ? 0.45 : 0.25)
            }
            sfx.motorSet(Math.min(1, st.progress))
          }
          if (st.progress >= 1) {
            st.progress = 0
            for (let n = 0; n < k; n += 1) {
              const i = _targets[n]
              const kind = roomState.kinds[i]
              takeScrew(i, kind !== SCREW_CRYSTAL)
              queuePop(i, kind)
              _batch.push(i)
            }
            sfx.pop(k)
            turning.ids.length = 0
          }
        }
      }
    }
    if (!working) {
      st.progress = Math.max(0, st.progress - delta * 3)
      if (!using) turning.ids.length = 0
      if (st.motor) {
        st.motor = false
        sfx.motorStop()
      }
    }
    turning.progress = Math.min(1, st.progress)
    aim.progress = turning.progress
    aim.working = working

    // --- The Helper Drone ------------------------------------------------------------
    const rate = droneRate(profile)
    droneState.active = rate > 0
    if (rate > 0 && !blocked) {
      const p = runtime.player.position
      if (st.droneTarget >= 0 && ((roomState.bits[st.droneTarget >> 3] >> (st.droneTarget & 7)) & 1)) st.droneTarget = -1
      if (st.droneTarget < 0) {
        st.droneIn -= delta
        if (st.droneIn <= 0) {
          const pick = nearestScrew(layout, p.x, p.y + 1.2, p.z, DRONE_RADIUS, target)
          const fits = pick >= 0 && (roomState.kinds[pick] === SCREW_CRYSTAL || run.bag + roomState.pendingBag < capacity)
          if (fits) {
            st.droneTarget = pick
            st.droneT = 0
          }
          st.droneIn = 0.25
        }
      } else {
        st.droneT += delta * rate
        if (st.droneT >= 1) {
          const i = st.droneTarget
          const kind = roomState.kinds[i]
          takeScrew(i, kind !== SCREW_CRYSTAL)
          queuePop(i, kind, true)
          _droneBatch.push(i)
          sfx.pop(1)
          st.droneTarget = -1
          st.droneIn = 0.05
        }
      }
      droneState.target = st.droneTarget
    }

    // --- To the authority ---------------------------------------------------------------
    if (_batch.length) {
      actions.unscrew(_batch.splice(0, MAX_BATCH))
    }
    if (_droneBatch.length) {
      actions.unscrew(_droneBatch.splice(0, MAX_BATCH), true)
    }
  })

  return null
}

export default Unscrewer
