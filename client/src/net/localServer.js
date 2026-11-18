import { normalizeProfile } from '@shared/logic'
import { PadManager, standingOn } from '@shared/pads'
import { PartyManager } from '@shared/parties'
import { PlayerSession, startParty } from '@shared/session'
import { playPadAt } from '@shared/world'

import { runtime } from '../game/runtime'

const SAVE_KEY = 'screwball.save.v1'
const TICK_MS = 100
const SAVE_MS = 5000
/** The one player's key in the party manager. */
const ME = 'local'

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')
  } catch {
    return null
  }
}

/**
 * Offline stand-in for the game server: runs the same PlayerSession (and the SOLO
 * countdown and team pads) the Colyseus room runs, against a save in localStorage. Used
 * when no server is configured or it can't be reached, so the game is always playable -
 * alone (a team pad seats you, but no one else is here to fill it).
 *
 * @param {{ id: string, name: string, onEvent: (type: string, payload: object) => void }} options
 * @returns {{ send: (type: string, payload?: object) => void, close: () => void }}
 */
export function createLocalServer({ id, name, onEvent }) {
  const profile = normalizeProfile(loadSave(), id, name)
  const startedAt = Date.now()

  const session = new PlayerSession(profile, {
    now: startedAt,
    // The session mutates its profile in place; the UI must get its own copy or it
    // would never see a change (same reference) and could edit server state.
    emit: (type, payload) => onEvent(type, payload ? structuredClone(payload) : payload),
    getPosition: () => runtime.player.position,
    // Offline there's no one to check positions: the teleport event moves you.
    onTeleport: () => {},
  })

  const parties = new PartyManager({
    maxSize: 1,
    onStart: (party) => startParty(session, [session], party, Date.now()),
    onChange: () => onEvent('parties', parties.view(ME, Date.now())),
  })
  const pads = new PadManager({
    onStart: (party) => startParty(session, [session], party, Date.now()),
    onChange: () => onEvent('pads', pads.view(ME, Date.now())),
    canHost: (_key, config) => session.canHost(config),
  })
  const standing = () => {
    if (session.inRun || parties.partyOf(ME)) return new Map()
    const p = runtime.player.position
    return standingOn(playPadAt, [{ key: ME, x: p.x, z: p.z, name }])
  }

  const save = () => {
    try {
      profile.lastSeen = Date.now()
      localStorage.setItem(SAVE_KEY, JSON.stringify(profile))
    } catch {
      // Storage full or blocked: progress just won't persist this session.
    }
  }

  let last = performance.now()
  const tickId = setInterval(() => {
    const t = performance.now()
    session.tick(Math.min(0.5, (t - last) / 1000), Date.now())
    parties.tick(Date.now())
    pads.sync(standing(), Date.now())
    pads.tick(Date.now())
    last = t
  }, TICK_MS)
  const saveId = setInterval(save, SAVE_MS)
  const onHide = () => {
    if (document.visibilityState === 'hidden') save()
  }
  window.addEventListener('beforeunload', save)
  document.addEventListener('visibilitychange', onHide)

  session.sendProfile()
  onEvent('parties', parties.view(ME, startedAt))
  onEvent('pads', pads.view(ME, startedAt))

  /** The party messages, checked as the server checks them. */
  const party = (type, payload = {}) => {
    const now = Date.now()
    if (type === 'createParty') {
      const action = payload.action === 'load' ? 'load' : 'start'
      const chapter = action === 'load' ? profile.run?.chapter : String(payload.chapter || '')
      const diff = action === 'load' ? profile.run?.diff : Number(payload.diff)
      if (!Number.isInteger(diff) || !session.canHost({ action, chapter, diff })) return
      if (pads.padOf(ME)) return
      parties.create(ME, name, { chapter, diff, size: 1, action }, now)
    } else if (type === 'leaveParty') parties.leave(ME)
    else if (type === 'startParty') parties.go(ME, now)
  }

  return {
    send(type, payload) {
      // Offline there is no server to verify Boxity's word, so the two host-only grants
      // are taken here. Both are only ever sent by bloxity/services.js, after Boxity
      // reported a completed rewarded ad / a successful Gems purchase.
      if (type === 'adReward') {
        if (typeof payload?.placement === 'string') session.grantAdReward(payload.placement, Date.now())
        save()
        return
      }
      if (type === 'gemsLocal') {
        if (typeof payload?.sku === 'string') session.grantGemProduct(payload.sku)
        save()
        return
      }
      if (type === 'createParty' || type === 'leaveParty' || type === 'startParty') {
        party(type, payload)
        return
      }
      session.handle(type, payload, Date.now())
    },
    close() {
      clearInterval(tickId)
      clearInterval(saveId)
      window.removeEventListener('beforeunload', save)
      document.removeEventListener('visibilitychange', onHide)
      session.exitRun(Date.now(), { silent: true })
      save()
    },
  }
}
