import { atDoor, atHopper, pedestalAt } from '@shared/layout'
import { runInfo } from '@shared/logic'
import { playPadAt, stationAt } from '@shared/world'

import { sfx } from '../audio/sfx'
import { actions } from '../net/actions'
import { getGame } from '../store/game'
import { takeHint } from './hints'
import { runtime } from './runtime'

const TICK_MS = 100
/** Least time between two asks of the same kind (the authority answers in between). */
const SELL_EVERY_MS = 900
const DOOR_EVERY_MS = 1500

function sameZone(a, b) {
  return a.pad === b.pad && a.station === b.station && a.hopper === b.hopper && a.pedestal === b.pedestal && a.door === b.door
}

/**
 * The 10 Hz bridge between the frame-rate world and the UI: works out where the player
 * stands and acts on it - stepping onto the SOLO pad opens the chapters (onto a team pad
 * seats you: the server's call, from where you stand), into a station
 * its panel; in a room, onto the SELL hopper sells, and through the open door moves on.
 * This - not the render loop - is what writes zone state into the store, and only when
 * something actually changed.
 *
 * @returns {() => void} stop
 */
export function startGameTicker() {
  let sellAskedAt = 0
  let doorAskedAt = 0
  /** The full team pad we last said so about. */
  let toldFull = null

  const tick = () => {
    const game = getGame()
    const hint = takeHint()
    if (hint) game.showHint(hint)
    const profile = game.profile
    const p = runtime.player.position
    const run = profile.run
    const zone = { pad: null, station: null, hopper: false, pedestal: -1, door: false }

    if (run?.active) {
      const layout = runInfo(profile)?.layout
      if (layout) {
        zone.hopper = atHopper(layout, p.x, p.z)
        zone.pedestal = pedestalAt(layout, p.x, p.z)
        zone.door = run.left === 0 && atDoor(layout, p.x, p.z)
        const now = performance.now()
        if (zone.hopper && run.bag > 0 && now - sellAskedAt > SELL_EVERY_MS) {
          sellAskedAt = now
          actions.sell()
        }
        if (zone.door && now - doorAskedAt > DOOR_EVERY_MS) {
          doorAskedAt = now
          actions.nextRoom()
        }
      }
    } else if (!game.countdown && !game.clear) {
      zone.pad = playPadAt(p.x, p.z)
      zone.station = stationAt(p.x, p.z)
    }

    // A team pad that's full without you says so (once per visit).
    const seated = zone.pad ? game.pads.find((pad) => pad.seat >= 0) : null
    const standingOn = zone.pad && zone.pad !== 'solo' ? game.pads.find((pad) => pad.id === zone.pad) : null
    if (standingOn && !seated && standingOn.names.length >= standingOn.size) {
      if (toldFull !== standingOn.id) game.showHint('This pad is full - try another one!')
      toldFull = standingOn.id
    } else if (!standingOn) toldFull = null

    const before = game.zone
    if (!sameZone(zone, before)) {
      // Stepping onto the SOLO pad, or into a station, opens its panel (once per visit).
      if (zone.pad === 'solo' && before.pad !== 'solo' && !game.panel) {
        sfx.click()
        game.openPanel('chapters', { mode: 'solo' })
      } else if (zone.station && zone.station !== before.station && !game.panel) {
        sfx.click()
        game.openPanel(zone.station)
      }
      game.setZone(zone)
    }
  }

  const id = setInterval(tick, TICK_MS)
  return () => clearInterval(id)
}
