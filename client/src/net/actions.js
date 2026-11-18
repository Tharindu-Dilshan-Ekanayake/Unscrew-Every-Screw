/**
 * Player intents. The UI never changes game state itself: it calls one of these, the
 * authority (the Colyseus room, or the offline stand-in) validates it, and the result
 * comes back as an updated profile or an event.
 */

let transport = null

/** Installs the active connection: `{ send(type, payload) }`. */
export function setTransport(next) {
  transport = next
}

export function send(type, payload) {
  if (!transport) return
  transport.send(type, payload)
}

export const actions = {
  /**
   * SOLO: CREATE (`action` 'start', a new run of `chapter` at `diff`) or LOAD (`action`
   * 'load', your saved run) - after a short countdown, which LEAVE calls off.
   */
  createParty: (chapter, diff, action = 'start') => send('createParty', { chapter, diff, action }),
  leaveParty: () => send('leaveParty'),
  /** The host: start now, with whoever's in. */
  startParty: () => send('startParty'),
  /** CREATE: a new run of `chapter` (id) at difficulty `diff` (0-2). */
  startRun: (chapter, diff) => send('startRun', { chapter, diff }),
  /** LOAD: back into the saved run. */
  loadRun: () => send('loadRun'),
  /** Back to the lobby (the run stays saved). */
  leaveRun: () => send('leaveRun'),
  /** Screws taken: by your hands, or by your Helper Drone (`drone`). */
  unscrew: (ids, drone = false) => send('unscrew', drone ? { ids, drone: true } : { ids }),
  sell: () => send('sell'),
  buyTool: (id) => send('buyTool', { id }),
  equipTool: (id) => send('equipTool', { id }),
  upgrade: (stat) => send('upgrade', { stat }),
  /** Through the open door. */
  nextRoom: () => send('nextRoom'),
  buyPerk: (id) => send('buyPerk', { id }),
  buySkin: (id) => send('buySkin', { id }),
  equipSkin: (id) => send('equipSkin', { id }),
  claimDaily: () => send('claimDaily'),
  /** Claims today's finished quest `index` (0-2), or the bonus once all three are. */
  claimQuest: (index) => send('claimQuest', { index }),
  claimQuestBonus: () => send('claimQuestBonus'),
  /** A rewarded ad Boxity says was watched; the server verifies the token. */
  adReward: (placement, rewardToken) => send('adReward', { placement, rewardToken }),
  /** Asks the server to apply any Gems purchases Boxity has confirmed. */
  gemsCheck: () => send('gemsCheck'),
}
