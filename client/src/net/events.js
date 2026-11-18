import { CHAPTERS } from '@shared/balance'
import { formatNumber } from '@shared/format'
import { screwPosition } from '@shared/layout'

import { sfx } from '../audio/sfx'
import { burst } from '../game/fx/fxQueue'
import { spawnPopup, spawnScattered } from '../game/fx/popups'
import { roomState, settleScrews, syncRoom, teammateTook } from '../game/roomState'
import { holeQueue, sellQueue } from '../game/stage/aim'
import { placePlayer, runtime } from '../game/runtime'
import { getGame } from '../store/game'
import { iconUrl } from '../ui/icons'
import { fadeThrough } from '../ui/fade'
import { refreshRemoteVisibility } from './remotePlayers'

const GOLD_TEXT = 'linear-gradient(180deg, #fffaa8 0%, #ffd52a 45%, #ff9c00 100%)'
const CRYSTAL_TEXT = 'linear-gradient(180deg, #e6fdff 0%, #7ff0ff 45%, #22a6ff 100%)'
const CASH_TEXT = 'linear-gradient(180deg, #e9ffd0 0%, #8dff5a 45%, #2fc43a 100%)'
const _p = { x: 0, y: 0, z: 0 }

/** A point a little in front of you, for popups and confetti. */
function inFront(dy = 1.4) {
  const p = runtime.player.position
  const yaw = runtime.player.yaw
  return { x: p.x + Math.sin(yaw) * 1.2, y: p.y + dy, z: p.z + Math.cos(yaw) * 1.2 }
}

/**
 * Applies one authority event to the client: updates the store and kicks off any
 * visual effect. The same handler serves the Colyseus connection and offline mode.
 */
export function handleServerEvent(type, payload) {
  const game = getGame()
  switch (type) {
    case 'profile': {
      const before = game.profile
      game.setProfile(payload.profile, payload.session)
      // A new room (or into / out of a run): the screws are rebuilt from the save.
      syncRoom(payload.profile)
      const runOf = (p) => (p.run?.active ? p.run.runId || 'run' : '')
      if (runOf(before) !== runOf(payload.profile)) refreshRemoteVisibility()
      if (game.profileLoaded && payload.profile.skins.length > before.skins.length) sfx.buy()
      break
    }

    case 'teleport':
      // Moved at once (so nothing in the old place - a wall, a collider - can catch you on
      // the way); the white flash only covers the cut.
      placePlayer(payload.x, payload.z, payload.yaw)
      fadeThrough(() => {})
      break

    case 'parties': {
      const mine = payload.mine ? { ...payload.mine, endsAt: Date.now() + payload.mine.startsIn } : null
      game.setParties(mine)
      break
    }

    case 'pads': {
      const now = Date.now()
      game.setPads((Array.isArray(payload) ? payload : []).map((p) => ({ ...p, endsAt: p.startsIn === null ? null : now + p.startsIn })))
      break
    }

    case 'screwsGone': {
      // A teammate's screws: holes for us too.
      for (const i of teammateTook(payload.ids || [])) holeQueue.push(i)
      game.patchRun({ left: payload.left })
      break
    }

    case 'unscrewed': {
      settleScrews(payload.ok, payload.bad, payload.taken)
      const crystalsEach = payload.crystal ? Math.max(1, Math.round((payload.crystals - game.profile.crystals) / payload.crystal)) : 0
      game.patchRun({ bag: payload.bag, bagValue: payload.bagValue, left: payload.left })
      if (payload.crystals !== game.profile.crystals || payload.screws !== game.profile.stats.screws) {
        const latest = getGame().profile
        game.patchProfile({ crystals: payload.crystals, stats: { ...latest.stats, screws: payload.screws ?? latest.stats.screws } })
      }
      const layout = roomState.layout
      if (layout && payload.ok.length && (payload.gold || payload.crystal)) {
        // Find the special ones among them for their popup.
        for (const i of payload.ok) {
          const kind = roomState.kinds?.[i]
          if (kind !== 1 && kind !== 2) continue
          screwPosition(layout, i, _p)
          if (kind === 1) {
            sfx.gold()
            spawnPopup('GOLD!', _p, { gradient: GOLD_TEXT, scale: 1.2 })
          } else {
            sfx.crystal()
            spawnPopup(`+${crystalsEach}`, _p, { gradient: CRYSTAL_TEXT, iconUrl: iconUrl('crystal'), scale: 1.25 })
            burst({ ..._p, count: 18, speed: 4, palette: 'crystal' })
          }
        }
      }
      break
    }

    case 'sold':
      sfx.sell(payload.screws)
      if (sellQueue.length < 4) sellQueue.push(payload.screws || 1)
      spawnScattered(`+$${formatNumber(payload.cash)}`, { gradient: CASH_TEXT, iconUrl: iconUrl('cash'), scale: 1.4 })
      burst({ ...inFront(1), count: 30, speed: 6, palette: 'gold' })
      break

    case 'roomClear':
      sfx.doorOpen()
      game.showToast('ROOM CLEARED! The exit is open!')
      burst({ ...inFront(2), count: 50, speed: 8, palette: 'confetti' })
      break

    case 'room': {
      sfx.whoosh()
      const run = getGame().profile.run
      const chapter = run && CHAPTERS.find((c) => c.id === run.chapter)
      const room = chapter?.rooms[payload.room]
      if (room) game.showToast(`ROOM ${payload.room + 1}: ${room.name.toUpperCase()}`)
      break
    }

    case 'chapterClear':
      sfx.fanfare()
      game.setClear({ ...payload, id: Date.now() })
      break

    case 'quest':
      sfx.reward()
      game.showToast(`QUEST COMPLETE: ${payload.text}! Claim it in Quests`)
      break

    case 'badge':
      setTimeout(() => sfx.reward(), 600)
      game.showToast(`BADGE: ${payload.name}`)
      break

    case 'reward':
      sfx.reward()
      burst({ ...inFront(2), count: 40, speed: 7, palette: 'crystal' })
      game.showToast(`${payload.label}${payload.crystals ? ` +${formatNumber(payload.crystals)} Crystals` : ''}!`)
      break

    default:
      break
  }
}
