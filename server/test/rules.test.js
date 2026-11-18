import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BAG_LEVELS, CHAPTERS, DAY_MS, DIFFICULTIES, PERKS, RATE_SLACK, REACH_SLACK, SCREW_CRYSTAL, SCREW_PLAIN, TOOLS } from '../../shared/balance.js'
import { decodeBits, getBit } from '../../shared/bits.js'
import { formatNumber } from '../../shared/format.js'
import { atDoor, atHopper, clampToRoom, getLayout, screwKinds, screwPosition } from '../../shared/layout.js'
import {
  actionTime,
  advanceRoom,
  bagCapacity,
  createProfile,
  isChapterUnlocked,
  isDifficultyUnlocked,
  luckOf,
  normalizeProfile,
  reachOf,
  sellMultiplier,
  startRun,
  upgradeCost,
} from '../../shared/logic.js'
import { PlayerSession } from '../../shared/session.js'
import { SPAWN } from '../../shared/world.js'

/** Noon on day 1000: the fake clock's start. */
const T0 = 1000 * DAY_MS + DAY_MS / 2
/** Eye height the session measures reach from. */
const EYE = 1.6

/**
 * A session over a fake clock (`t.now`, moved by `t.advance`), recording every event it
 * emits and every teleport it hands the host. `t.pos` is where the player stands.
 */
function makeSession({ profile = createProfile('p1', 'P'), rand = () => 0.5 } = {}) {
  const t = { now: T0, pos: { x: 0, y: 0, z: 0 }, events: [], last: {}, teleports: [], profile }
  t.session = new PlayerSession(profile, {
    now: t.now,
    rand,
    emit: (type, payload) => {
      t.events.push({ type, payload })
      t.last[type] = payload
    },
    getPosition: () => t.pos,
    onTeleport: (x, z) => {
      t.teleports.push({ x, z })
      Object.assign(t.pos, { x, y: 0, z })
    },
  })
  t.advance = (ms) => (t.now += ms)
  t.send = (type, payload = {}) => t.session.handle(type, payload, t.now)
  t.of = (type) => t.events.filter((e) => e.type === type).map((e) => e.payload)
  t.standAt = (x, z) => Object.assign(t.pos, { x, y: 0, z })
  /** Stands as close to screw `i` as the room's walls allow. */
  t.standBy = (i) => {
    const s = screwPosition(t.session.layout, i)
    const c = clampToRoom(t.session.layout, s.x, s.z)
    t.standAt(c.x, c.z)
  }
  /** Walks up to screw `i`, waits a second (the tool's pace) and unscrews it. */
  t.take = (i) => {
    t.standBy(i)
    t.advance(1000)
    t.send('unscrew', { ids: [i] })
    return t.last.unscrewed.ok.includes(i)
  }
  t.kinds = () => screwKinds(t.session.layout, t.profile.run.seed, luckOf(t.profile))
  /** Screw indices still in the current room, of `kind` if given. */
  t.screwsLeft = (kind) => {
    const layout = t.session.layout
    const out = decodeBits(t.profile.run.removed, layout.count)
    const kinds = t.kinds()
    const list = []
    for (let i = 0; i < layout.count; i += 1) if (!getBit(out, i) && (kind === undefined || kinds[i] === kind)) list.push(i)
    return list
  }
  return t
}

const seedOf = (r) => 1 + Math.floor(r * (2 ** 31 - 2))

/** A `rand` whose run seed hides at least one crystal screw in the Workshop's first room. */
function randWithCrystal() {
  const layout = getLayout(0, 0)
  for (let k = 0; k < 1000; k += 1) {
    const r = 0.5 + k / 10000
    if (screwKinds(layout, seedOf(r)).includes(SCREW_CRYSTAL)) return () => r
  }
  throw new Error('no seed with a crystal screw')
}

/** Distance from the player's eye to screw `i`. */
const eyeDistance = (layout, pos, i) => {
  const s = screwPosition(layout, i)
  return Math.hypot(s.x - pos.x, s.y - (pos.y + EYE), s.z - pos.z)
}

/**
 * Unscrews every screw left in the current room the honest way: walking to each, one
 * a second, selling at the hopper whenever the bag is full. The clock (and the run's
 * timer, through tick) moves on as it goes.
 */
function clearRoom(t) {
  const layout = t.session.layout
  const run = t.profile.run
  const kinds = t.kinds()
  for (const i of t.screwsLeft()) {
    if (kinds[i] !== SCREW_CRYSTAL && run.bag >= bagCapacity(t.profile)) {
      t.standAt(layout.sell.x, layout.sell.z)
      t.send('sell')
    }
    t.session.tick(1, t.now + 1000)
    assert.ok(t.take(i), `screw ${i} came out`)
  }
  assert.equal(run.left, 0)
}

const doorway = (layout) => clampToRoom(layout, layout.door.x, layout.door.z)

// --- Profiles --------------------------------------------------------------------

test('a profile survives a save round trip; a run always comes back paused', () => {
  const p = createProfile('p1', 'P')
  startRun(p, 'workshop', 0, T0, () => 0.25)
  Object.assign(p, { crystals: 42, skin: 'ocean', tutorialStep: 2, lastSeen: T0 })
  p.skins.push('ocean')
  p.perks.luck = 2
  p.cleared.workshop = 1
  p.best['workshop:0'] = 321
  p.passes.bagX2 = true
  p.ads['free-crystals'] = T0 - 1000
  p.daily = { day: 1000, index: 3 }
  p.badges.push('firstScrew')
  p.stats.screws = 999
  Object.assign(p.run, { cash: 55, bag: 4, bagValue: 4, removed: 'Dw==', left: getLayout(0, 0).count - 4, time: 12.5, screws: 4 })
  p.run.up.speed = 2

  const back = normalizeProfile(JSON.parse(JSON.stringify(p)), 'p1', 'P')
  assert.equal(back.run.active, false, 'resumed in the lobby, LOADed from the elevator')
  assert.deepEqual(back, { ...p, run: { ...p.run, active: false } })
  assert.deepEqual(normalizeProfile(null, 'p2', 'Q'), createProfile('p2', 'Q'))
})

test('normalize keeps only what makes sense', () => {
  const p = normalizeProfile(
    {
      crystals: -5,
      perks: { luck: 99, nope: 3 },
      skins: ['nope'],
      skin: 'gold',
      cleared: { workshop: 9, mars: 1 },
      best: { 'workshop:0': -1, x: 5 },
      run: { chapter: 'mars' },
      passes: { cashX2: true, fake: true },
      stats: { screws: 'lots', rooms: 3 },
      daily: 'x',
      badges: ['firstScrew', 'nope'],
    },
    'p3',
    'R',
  )
  assert.equal(p.crystals, 0)
  assert.equal(p.perks.luck, PERKS.luck.costs.length, 'clamped to the max level')
  assert.equal('nope' in p.perks, false)
  assert.deepEqual(p.skins, ['classic'])
  assert.equal(p.skin, 'classic', 'not owned, not worn')
  assert.deepEqual(p.cleared, { workshop: DIFFICULTIES.length })
  assert.deepEqual(p.best, {})
  assert.equal(p.run, null, 'a run of an unknown chapter is dropped')
  assert.deepEqual(p.passes, { cashX2: true })
  assert.equal(p.stats.screws, 0)
  assert.equal(p.stats.rooms, 3)
  assert.deepEqual(p.daily, { day: -1, index: -1 })
  assert.deepEqual(p.badges, ['firstScrew'])
})

test('numbers format like the HUD', () => {
  assert.deepEqual([0, 999, 1000, 1234, 7300, 14000, 2.5e6].map(formatNumber), ['0', '999', '1K', '1.2K', '7.3K', '14K', '2.5M'])
})

// --- Unlocks -----------------------------------------------------------------------

test('chapter 2 is locked until chapter 1 is cleared; Hard until Normal', () => {
  const p = createProfile('p1', 'P')
  assert.equal(isChapterUnlocked(p, 'workshop'), true)
  assert.equal(isChapterUnlocked(p, 'boiler'), false)
  assert.deepEqual(startRun(p, 'boiler', 0, T0), { ok: false, reason: 'locked' })
  assert.deepEqual(startRun(p, 'workshop', 1, T0), { ok: false, reason: 'locked' })
  assert.deepEqual(startRun(p, 'nowhere', 0, T0), { ok: false, reason: 'locked' })
  assert.equal(p.run, null)
  assert.deepEqual(startRun(p, 'workshop', 0, T0), { ok: true })
  assert.equal(p.run.active, true)
  assert.equal(p.run.left, getLayout(0, 0).count)
  assert.equal(p.stats.runs, 1)

  p.run = null
  p.cleared.workshop = 1
  assert.equal(startRun(p, 'boiler', 0, T0).ok, true)
  assert.equal(startRun(p, 'workshop', 1, T0).ok, true, 'Hard opens after Normal')
  assert.equal(startRun(p, 'workshop', 2, T0).ok, false, 'Impossible still needs Hard')
  assert.equal(startRun(p, 'boiler', 1, T0).ok, false)
  assert.equal(startRun(p, 'lab', 0, T0).ok, false, 'the Lab needs the Boiler Room')
  assert.equal(isDifficultyUnlocked(p, 'workshop', 1), true)
})

test('a locked run is refused by the session: no profile, no teleport', () => {
  const t = makeSession()
  t.send('startRun', { chapter: 'boiler', diff: 0 })
  assert.equal(t.session.inRun, false)
  assert.equal(t.teleports.length, 0)
  assert.equal(t.of('profile').length, 0)
})

// --- Unscrewing --------------------------------------------------------------------

test('a screw within reach comes out; one out of reach is refused', () => {
  const t = makeSession()
  t.send('startRun', { chapter: 'workshop', diff: 0 })
  const layout = t.session.layout
  const plain = t.screwsLeft(SCREW_PLAIN)
  const byDistance = [...plain].sort((a, b) => eyeDistance(layout, t.pos, a) - eyeDistance(layout, t.pos, b))
  const near = byDistance[0]
  const far = byDistance.at(-1)
  assert.ok(eyeDistance(layout, t.pos, far) > reachOf(t.profile) + REACH_SLACK, 'the far one really is out of reach')

  t.advance(2000)
  t.send('unscrew', { ids: [near, far] })
  const r = t.last.unscrewed
  assert.deepEqual(r.ok, [near])
  assert.deepEqual(r.bad, [far], 'refused, so the client puts it back')
  assert.equal(r.left, layout.count - 1)
  assert.equal(r.bag, 1)
  assert.equal(r.bagValue, layout.value * CHAPTERS[0].scale)
  assert.equal(t.profile.stats.screws, 1)
  assert.deepEqual(t.of('badge').map((b) => b.id), ['firstScrew'])

  // Already out: neither taken again nor bounced back.
  t.advance(2000)
  t.send('unscrew', { ids: [near, -1, 1e9, 'x'] })
  assert.deepEqual(t.last.unscrewed.ok, [])
  assert.deepEqual(t.last.unscrewed.bad, [])
  assert.equal(t.profile.run.left, layout.count - 1)
})

test('a full bag refuses screws, but crystal screws need no room in it', () => {
  const t = makeSession({ rand: randWithCrystal() })
  t.send('startRun', { chapter: 'workshop', diff: 0 })
  const capacity = bagCapacity(t.profile)
  assert.equal(capacity, BAG_LEVELS[0])
  for (const i of t.screwsLeft(SCREW_PLAIN).slice(0, capacity)) assert.ok(t.take(i))
  assert.equal(t.profile.run.bag, capacity)

  const plain = t.screwsLeft(SCREW_PLAIN)[0]
  assert.equal(t.take(plain), false)
  assert.deepEqual(t.last.unscrewed.bad, [plain])

  const crystal = t.screwsLeft(SCREW_CRYSTAL)[0]
  assert.equal(t.take(crystal), true)
  assert.equal(t.last.unscrewed.crystal, 1)
  assert.equal(t.profile.crystals, 1)
  assert.equal(t.profile.stats.crystal, 1)
  assert.equal(t.profile.run.bag, capacity, 'the bag is no fuller')
  assert.ok(t.of('badge').some((b) => b.id === 'crystal'))
})

test('a burst far faster than the tool allows is cut down to its rate', () => {
  const t = makeSession()
  t.send('startRun', { chapter: 'workshop', diff: 0 })
  const layout = t.session.layout
  t.standAt(0, 0)
  // Floor screws: all within reach of the middle of the room.
  const floor = t.screwsLeft().filter((i) => layout.surf[i] === 0)
  for (const i of floor) assert.ok(eyeDistance(layout, t.pos, i) <= reachOf(t.profile) + REACH_SLACK)
  const driver = TOOLS[0]
  const burst = floor.slice(0, 15)

  // Idle for a minute: the allowance is full, but only up to a couple of actions' worth.
  t.advance(60_000)
  t.send('unscrew', { ids: burst })
  const cap = driver.max * 2 + 3
  assert.equal(t.last.unscrewed.ok.length, cap)
  assert.equal(t.last.unscrewed.bad.length, burst.length - cap)

  // The same instant again: nothing left.
  const rest = t.last.unscrewed.bad
  t.send('unscrew', { ids: rest })
  assert.equal(t.last.unscrewed.ok.length, 0)

  // 1.25 s later: what the Screwdriver really does in that time (with the slack).
  const rate = (driver.max / actionTime(t.profile, driver.id, t.now)) * RATE_SLACK
  t.advance(1250)
  t.send('unscrew', { ids: rest })
  assert.equal(t.last.unscrewed.ok.length, Math.floor(1.25 * rate))
  assert.equal(t.last.unscrewed.ok.length, 2)
})

// --- Selling, tools, upgrades ------------------------------------------------------

test('the bag sells only at the hopper', () => {
  const t = makeSession()
  t.send('startRun', { chapter: 'workshop', diff: 0 })
  const layout = t.session.layout
  for (const i of t.screwsLeft(SCREW_PLAIN).slice(0, 5)) assert.ok(t.take(i))
  const value = t.profile.run.bagValue
  assert.equal(value, 5 * layout.value * CHAPTERS[0].scale)

  const away = doorway(layout)
  assert.equal(atHopper(layout, away.x, away.z, 1.4), false)
  t.standAt(away.x, away.z)
  t.send('sell')
  assert.equal(t.of('sold').length, 0)
  assert.equal(t.profile.run.bag, 5)

  t.standAt(layout.sell.x, layout.sell.z)
  t.send('sell')
  assert.deepEqual(t.last.sold, { cash: value * sellMultiplier(t.profile), screws: 5 })
  assert.equal(t.profile.run.cash, value)
  assert.equal(t.profile.run.bag, 0)
  assert.equal(t.profile.run.bagValue, 0)
  assert.equal(t.profile.stats.sells, 1)

  t.send('sell')
  assert.equal(t.of('sold').length, 1, 'an empty bag sells for nothing')
})

test('tools and upgrades are paid for with the run\'s cash', () => {
  const t = makeSession()
  t.send('startRun', { chapter: 'workshop', diff: 0 })
  const run = t.profile.run
  t.send('buyTool', { id: 'drill' })
  assert.deepEqual(run.tools, ['driver'], 'no cash, no drill')

  run.cash = 100
  const drill = TOOLS.find((x) => x.id === 'drill')
  t.send('buyTool', { id: 'drill' })
  assert.deepEqual(run.tools, ['driver', 'drill'])
  assert.equal(run.tool, 'drill')
  assert.equal(run.cash, 100 - drill.price * CHAPTERS[0].scale)
  assert.ok(t.of('badge').some((b) => b.id === 'firstTool'))
  t.send('buyTool', { id: 'drill' })
  assert.equal(run.cash, 40, 'owned already: not sold twice')
  assert.ok(actionTime(t.profile, 'drill', t.now) < actionTime(t.profile, 'driver', t.now))

  const speedCost = upgradeCost(t.profile, 'speed')
  const before = actionTime(t.profile, 'drill', t.now)
  t.send('upgrade', { stat: 'speed' })
  assert.equal(run.up.speed, 1)
  assert.equal(run.cash, 40 - speedCost)
  assert.ok(actionTime(t.profile, 'drill', t.now) < before)
  assert.equal(t.profile.stats.upgrades, 1)

  const bagCost = upgradeCost(t.profile, 'bag')
  t.send('upgrade', { stat: 'bag' })
  assert.equal(run.cash, 40 - speedCost - bagCost)
  assert.equal(bagCapacity(t.profile), BAG_LEVELS[1])

  t.send('upgrade', { stat: 'reach' })
  assert.equal(run.up.reach, 0, 'too dear')
  t.send('upgrade', { stat: 'nope' })
  t.send('equipTool', { id: 'driver' })
  assert.equal(run.tool, 'driver')
  t.send('equipTool', { id: 'magnet' })
  assert.equal(run.tool, 'driver', 'not owned')

  // Run shopping is for runs only.
  t.send('leaveRun')
  run.cash = 1e6
  t.send('buyTool', { id: 'ratchet' })
  t.send('upgrade', { stat: 'speed' })
  assert.deepEqual(run.tools, ['driver', 'drill'])
  assert.equal(run.up.speed, 1)
})

// --- Doors and chapters ------------------------------------------------------------

test('the exit door works only once the room is empty, and only from the doorway', () => {
  const t = makeSession()
  t.send('startRun', { chapter: 'workshop', diff: 0 })
  const layout = t.session.layout
  const door = doorway(layout)
  assert.ok(atDoor(layout, door.x, door.z))

  t.standAt(door.x, door.z)
  t.send('nextRoom')
  assert.equal(t.profile.run.room, 0, 'screws left: the door is shut')

  clearRoom(t)
  assert.equal(t.of('roomClear').length, 1)
  t.standAt(0, 0)
  t.send('nextRoom')
  assert.equal(t.profile.run.room, 0, 'not at the door')

  t.standAt(door.x, door.z)
  t.send('nextRoom')
  const next = getLayout(0, 1)
  assert.deepEqual(t.last.room, { room: 1 })
  assert.equal(t.profile.run.room, 1)
  assert.equal(t.profile.run.left, next.count)
  assert.equal(t.profile.run.removed, '')
  assert.equal(t.profile.stats.rooms, 1)
  assert.deepEqual(t.teleports.at(-1), { x: next.spawn.x, z: next.spawn.z }, 'the host is told about the jump')
  assert.deepEqual(t.last.teleport, { x: next.spawn.x, y: 0, z: next.spawn.z, yaw: next.spawn.yaw })
  assert.equal(t.session.layout, next)
})

test('clearing the last room clears the chapter: Crystals, a best time, unlocks, back to the lobby', () => {
  const t = makeSession()
  t.send('startRun', { chapter: 'workshop', diff: 0 })
  const rooms = CHAPTERS[0].rooms.length
  let crystalsBefore = 0
  let time = 0
  for (let room = 0; room < rooms; room += 1) {
    clearRoom(t)
    const door = doorway(t.session.layout)
    t.standAt(door.x, door.z)
    crystalsBefore = t.profile.crystals
    time = Math.round(t.profile.run.time)
    t.send('nextRoom')
  }
  const clear = t.last.chapterClear
  const reward = Math.round(CHAPTERS[0].reward * DIFFICULTIES[0].crystals)
  assert.equal(clear.chapter, 'workshop')
  assert.equal(clear.diff, 0)
  assert.equal(clear.crystals, reward)
  assert.equal(clear.time, time)
  assert.ok(time > 0)
  assert.equal(clear.best, time)
  assert.equal(clear.newBest, true)
  assert.equal(clear.unlockedDifficulty, DIFFICULTIES[1].name)
  assert.equal(clear.unlockedChapter, CHAPTERS[1].name)
  assert.equal(t.profile.crystals, crystalsBefore + reward)
  assert.equal(t.profile.best['workshop:0'], time)
  assert.equal(t.profile.cleared.workshop, 1)
  assert.equal(t.profile.stats.chapters, 1)
  assert.equal(t.profile.stats.rooms, rooms)
  assert.equal(t.profile.run, null, 'the run is over')
  assert.equal(t.session.inRun, false)
  assert.deepEqual(t.teleports.at(-1), { x: SPAWN.x, z: SPAWN.z })
  assert.ok(t.of('badge').some((b) => b.id === 'workshop'))
  assert.equal(isChapterUnlocked(t.profile, 'boiler'), true)
  assert.equal(isDifficultyUnlocked(t.profile, 'workshop', 1), true)
})

test('a slower clear keeps the best time; Hard pays more and opens Impossible', () => {
  const p = createProfile('p1', 'P')
  p.cleared.workshop = 1
  p.best['workshop:0'] = 100
  const finish = (diff, time) => {
    startRun(p, 'workshop', diff, T0)
    Object.assign(p.run, { room: CHAPTERS[0].rooms.length - 1, left: 0, time })
    return advanceRoom(p, T0)
  }
  const slow = finish(0, 150)
  assert.equal(slow.best, 100)
  assert.equal(slow.newBest, false)
  assert.equal(slow.unlockedDifficulty, null, 'nothing new')
  assert.equal(slow.unlockedChapter, null)
  assert.equal(p.best['workshop:0'], 100)

  const hard = finish(1, 90)
  assert.equal(hard.crystals, Math.round(CHAPTERS[0].reward * DIFFICULTIES[1].crystals))
  assert.equal(hard.unlockedDifficulty, DIFFICULTIES[2].name)
  assert.equal(p.best['workshop:1'], 90)
  assert.equal(p.cleared.workshop, 2)
  assert.equal(advanceRoom(p, T0).ok, false, 'no run, no door')
})

// --- Leaving and loading -----------------------------------------------------------

test('leaving keeps the run saved and LOAD goes back into it, both teleporting through onTeleport', () => {
  const t = makeSession()
  t.send('startRun', { chapter: 'workshop', diff: 0 })
  const layout = t.session.layout
  assert.equal(t.session.inRun, true)
  assert.deepEqual(t.teleports, [{ x: layout.spawn.x, z: layout.spawn.z }])
  assert.deepEqual(t.last.teleport, { x: layout.spawn.x, y: 0, z: layout.spawn.z, yaw: layout.spawn.yaw })
  const taken = t.screwsLeft(SCREW_PLAIN)[0]
  assert.ok(t.take(taken))

  t.send('leaveRun')
  assert.equal(t.session.inRun, false)
  assert.equal(t.session.layout, null)
  assert.deepEqual(t.teleports.at(-1), { x: SPAWN.x, z: SPAWN.z })
  assert.equal(t.last.teleport.yaw, Math.PI)
  assert.equal(t.profile.run.active, false, 'saved, not ended')
  assert.equal(t.profile.run.left, layout.count - 1)
  t.send('unscrew', { ids: [0] })
  assert.equal(t.of('unscrewed').length, 1, 'no unscrewing from the lobby')
  t.send('leaveRun')
  assert.equal(t.teleports.length, 2, 'already out')

  // Through a save and a new session, as after a reconnect elsewhere.
  const saved = normalizeProfile(JSON.parse(JSON.stringify(t.profile)), 'p1', 'P')
  const u = makeSession({ profile: saved })
  assert.equal(u.session.inRun, false)
  u.send('loadRun')
  assert.equal(u.session.inRun, true)
  assert.deepEqual(u.teleports, [{ x: layout.spawn.x, z: layout.spawn.z }])
  assert.equal(u.profile.run.left, layout.count - 1)
  assert.equal(u.screwsLeft().includes(taken), false, 'the screw taken is still out')
  u.send('loadRun')
  assert.equal(u.teleports.length, 1, 'in it already')

  const fresh = makeSession()
  fresh.send('loadRun')
  assert.equal(fresh.session.inRun, false, 'nothing saved to load')
  assert.equal(fresh.teleports.length, 0)
})
