import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buyUpgrade, clearChapter, createProfile, isChapterUnlocked, normalizeProfile, sellBag, startRun } from '../../shared/logic.js'
import { PadManager, standingOn } from '../../shared/pads.js'
import { SCREW_CRYSTAL } from '../../shared/balance.js'
import { PlayerSession, startParty } from '../../shared/session.js'
import { PAD_SECTIONS, padById, playPadAt, TEAM_PADS } from '../../shared/world.js'

const START_MS = 3000

/** A PadManager (by default everyone has reached everything), recording the runs it starts. */
function makePads({ canHost = () => true } = {}) {
  const started = []
  const pads = new PadManager({ onStart: (party) => started.push(party), onChange: () => {}, canHost, startMs: START_MS })
  return { pads, started }
}

/** `[[key, padId], ...]` as `sync` takes it. */
const standing = (entries) => new Map(entries.map(([key, pad]) => [key, { pad, name: key.toUpperCase() }]))
const viewOf = (pads, key, id, now = 0) => pads.view(key, now).find((p) => p.id === id)

test('a team section per chapter, each with a pad seating 2 and one seating 4; standing on one is found by position', () => {
  assert.deepEqual(
    PAD_SECTIONS.map((s) => s.chapter),
    ['workshop', 'boiler', 'lab'],
  )
  for (const { chapter } of PAD_SECTIONS) {
    assert.deepEqual(
      TEAM_PADS.filter((p) => p.chapter === chapter).map((p) => p.size),
      [2, 4],
    )
  }
  for (const pad of TEAM_PADS) assert.equal(playPadAt(pad.x, pad.z), pad.id)
  assert.equal(playPadAt(0, 17), null)
  const solo = padById('solo')
  assert.equal(playPadAt(solo.x, solo.z), 'solo')
  // The SOLO pad never seats anyone on a team.
  assert.equal(standingOn(playPadAt, [{ key: 'a', x: solo.x, z: solo.z, name: 'A' }]).size, 0)
  const duo = padById('lab-2')
  assert.deepEqual([...standingOn(playPadAt, [{ key: 'a', x: duo.x, z: duo.z, name: 'A' }])], [['a', { pad: 'lab-2', name: 'A' }]])
})

test("seats go in order of arrival; a pad plays its section's chapter; a full pad seats no one else", () => {
  const { pads } = makePads()
  pads.sync(standing([['a', 'boiler-4']]), 0)
  assert.deepEqual(viewOf(pads, 'a', 'boiler-4'), { id: 'boiler-4', size: 4, chapter: 'boiler', diff: 0, names: ['A'], seat: 0, ready: true, startsIn: null })
  pads.sync(standing([['a', 'boiler-4'], ['b', 'boiler-4'], ['c', 'boiler-4'], ['d', 'boiler-4'], ['e', 'boiler-4']]), 100)
  const v = viewOf(pads, 'e', 'boiler-4', 100)
  assert.deepEqual(v.names, ['A', 'B', 'C', 'D'])
  assert.equal(v.seat, -1, 'the fifth player only stands there')
  assert.equal(v.startsIn, START_MS, 'full: the countdown starts - nothing to pick first')
})

test('stepping off calls the countdown off', () => {
  const { pads } = makePads()
  pads.sync(standing([['a', 'workshop-2'], ['b', 'workshop-2']]), 0)
  assert.equal(viewOf(pads, 'a', 'workshop-2').startsIn, START_MS)
  pads.sync(standing([['b', 'workshop-2']]), 500)
  const v = viewOf(pads, 'b', 'workshop-2', 500)
  assert.equal(v.startsIn, null)
  assert.equal(v.seat, 0)
  assert.deepEqual(v.names, ['B'])
})

test('someone new taking a seat restarts the countdown, and only a full pad starts', () => {
  const { pads, started } = makePads()
  pads.sync(standing([['a', 'workshop-2'], ['b', 'workshop-2']]), 0)
  // B steps off and C steps on in the same moment: still full, but C gets the whole countdown.
  pads.sync(standing([['a', 'workshop-2'], ['c', 'workshop-2']]), 2000)
  assert.equal(viewOf(pads, 'a', 'workshop-2', 2000).startsIn, START_MS)
  pads.tick(START_MS + 100)
  assert.equal(started.length, 0, 'not yet: the countdown restarted')
  pads.tick(2000 + START_MS)
  assert.equal(started.length, 1)
  assert.deepEqual(started[0], { id: 'pad:workshop-2', pad: 'workshop-2', host: 'a', members: ['a', 'c'], size: 2, chapter: 'workshop', diff: 0, action: 'start' })
  // The pad is free again.
  assert.deepEqual(viewOf(pads, 'a', 'workshop-2', 6000).names, [])
})

test('someone on the pad must have reached its chapter: they host, and without them a full pad waits', () => {
  // Only C has reached the Lab.
  const { pads, started } = makePads({ canHost: (key, config) => config.chapter !== 'lab' || key === 'c' })
  pads.sync(standing([['a', 'lab-2'], ['b', 'lab-2']]), 0)
  let v = viewOf(pads, 'a', 'lab-2')
  assert.equal(v.ready, false)
  assert.equal(v.startsIn, null, 'full, but nobody here has reached the Lab')
  pads.tick(10_000)
  assert.equal(started.length, 0)
  // B steps off, C (who has) steps on: it goes, with C as the run's host.
  pads.sync(standing([['a', 'lab-2'], ['c', 'lab-2']]), 20_000)
  v = viewOf(pads, 'a', 'lab-2', 20_000)
  assert.equal(v.ready, true)
  assert.equal(v.startsIn, START_MS)
  pads.tick(20_000 + START_MS)
  assert.equal(started[0].host, 'c')
  assert.deepEqual(started[0].members, ['a', 'c'])
})

function session(profile) {
  return new PlayerSession(profile, { now: 0, emit: () => {}, getPosition: () => ({ x: 0, y: 0, z: 0 }), onTeleport: () => {}, rand: () => 0.5 })
}

test('a team takes a newer player through a chapter they have not reached - just for fun: it stays locked', () => {
  const veteran = createProfile('v', 'Vet')
  veteran.cleared.workshop = 1
  const newbie = createProfile('n', 'New')
  assert.equal(isChapterUnlocked(newbie, 'boiler'), false)

  const host = session(veteran)
  const guest = session(newbie)
  const run = startParty(host, [host, guest], { action: 'start', chapter: 'boiler', diff: 0, pad: 'boiler-2' }, 0)
  assert.ok(run, 'the newer player plays the team run')
  assert.equal(newbie.run.chapter, 'boiler')
  assert.equal(newbie.run.runId, veteran.run.runId)

  const before = structuredClone({ crystals: newbie.crystals, stats: newbie.stats, cleared: newbie.cleared, best: newbie.best, badges: newbie.badges })
  const result = clearChapter(newbie)
  assert.equal(result.ok, true)
  assert.equal(result.team, true)
  assert.equal(result.crystals, 0)
  assert.equal(result.unlockedChapter, null)
  // Nothing of the team's clear is the player's own.
  assert.equal(isChapterUnlocked(newbie, 'boiler'), false)
  assert.equal(isChapterUnlocked(newbie, 'lab'), false)
  assert.deepEqual({ crystals: newbie.crystals, stats: newbie.stats, cleared: newbie.cleared, best: newbie.best, badges: newbie.badges }, before)
})

test('screws, sales, upgrades, quests and play time in a team run count for nothing', () => {
  const a = createProfile('a', 'A')
  const b = createProfile('b', 'B')
  const host = session(a)
  const guest = session(b)
  startParty(host, [host, guest], { action: 'start', chapter: 'workshop', diff: 0, pad: 'workshop-2' }, 0)
  const before = structuredClone({ crystals: b.crystals, stats: b.stats, quests: b.quests, tutorialStep: b.tutorialStep })
  // Hand the guest a bag to sell and cash to spend, as if they'd played a while.
  b.run.bag = 5
  b.run.bagValue = 50
  b.run.cash = 10_000
  sellBag(b)
  buyUpgrade(b, 'speed')
  guest.tick(120, 1000)
  guest.quest('screws', 25, 1000)
  guest.badge('firstScrew')
  assert.deepEqual({ crystals: b.crystals, stats: b.stats, quests: b.quests, tutorialStep: b.tutorialStep }, before)
  assert.deepEqual(b.badges, [])
  // Back to solo: it all counts again.
  guest.exitRun(2000)
  startParty(guest, [guest], { action: 'start', chapter: 'workshop', diff: 0 }, 3000)
  guest.tick(30, 4000)
  assert.ok(b.stats.playtime >= 30)
  assert.equal(b.stats.runs, 1)
})

test('team runs are never saved: your solo save waits, and is back when the team run ends', () => {
  const veteran = createProfile('v', 'Vet')
  veteran.cleared.workshop = 1
  const friend = createProfile('f', 'Friend')
  // The friend has a solo run saved, two rooms into the Workshop.
  startRun(friend, 'workshop', 0, 0, () => 0.25)
  friend.run.room = 2
  friend.run.cash = 777
  friend.run.active = false
  const solo = structuredClone(friend.run)

  const host = session(veteran)
  const guest = session(friend)
  // A team pad can't play a saved run.
  assert.equal(startParty(host, [host, guest], { action: 'load', pad: 'boiler-2' }, 0), null)
  startParty(host, [host, guest], { action: 'start', chapter: 'boiler', diff: 0, pad: 'boiler-2' }, 0)
  assert.equal(friend.run.team, true)
  assert.equal(friend.run.chapter, 'boiler')
  assert.deepEqual(friend.soloRun, solo, 'the solo save set aside, untouched')

  // Saved to disk mid-team (a crash, a restart): it loads back as the solo run.
  const reloaded = normalizeProfile(JSON.parse(JSON.stringify(friend)), 'f', 'Friend')
  assert.equal(reloaded.run.chapter, 'workshop')
  assert.equal(reloaded.run.room, 2)
  assert.equal(reloaded.run.cash, 777)
  assert.equal(reloaded.soloRun, undefined)

  // Leaving the team: the team run is gone, the solo save is back.
  guest.exitRun(1000)
  assert.deepEqual(friend.run, solo)
  assert.equal(friend.soloRun, undefined)
  assert.equal(veteran.run.team, true, 'the host plays on')

  // Clearing a chapter with a team: progress counts, and the solo save is back again.
  const host2 = session(veteran)
  veteran.run = null
  const guest2 = session(friend)
  startParty(host2, [host2, guest2], { action: 'start', chapter: 'workshop', diff: 0, pad: 'workshop-2' }, 2000)
  friend.run.time = 95
  const result = clearChapter(friend)
  assert.equal(result.ok, true)
  assert.equal(friend.cleared.workshop, undefined, 'a team clear unlocks nothing')
  assert.deepEqual(friend.run, solo)
  // Best times are solo: a team clear doesn't set one.
  assert.equal(result.team, true)
  assert.equal(result.newBest, false)
  assert.equal(friend.best['workshop:0'], undefined)

  // A host with no solo save: after the team run, there's still none.
  const fresh = createProfile('x', 'X')
  const loner = session(fresh)
  const other = session(createProfile('y', 'Y'))
  startParty(loner, [loner, other], { action: 'start', chapter: 'workshop', diff: 0, pad: 'boiler-2' }, 0)
  loner.exitRun(10)
  assert.equal(fresh.run, null)
})

test('a solo run is saved as before', () => {
  const p = createProfile('s', 'S')
  const me = session(p)
  startParty(me, [me], { action: 'start', chapter: 'workshop', diff: 0 }, 0)
  assert.equal(p.run.team, undefined)
  me.exitRun(500)
  assert.equal(p.run.chapter, 'workshop')
  assert.equal(p.run.active, false)
  // ...and its clear sets the best time.
  p.run.time = 120
  const result = clearChapter(p)
  assert.equal(result.newBest, true)
  assert.equal(p.best['workshop:0'], 120)
})

test('crystals unscrewed in a team run are kept - the one thing a team run keeps', () => {
  const a = createProfile('a', 'A')
  const b = createProfile('b', 'B')
  const pos = { x: 0, y: 0, z: 0 }
  let now = 0
  const host = session(a)
  const guest = new PlayerSession(b, { now, emit: () => {}, getPosition: () => pos, onTeleport: (x, z) => Object.assign(pos, { x, y: 0, z }), rand: () => 0.5 })
  const run = startParty(host, [host, guest], { action: 'start', chapter: 'workshop', diff: 0, pad: 'workshop-2' }, now)
  // A crystal screw on the floor near the middle (made one, if the room has none there).
  const layout = run.layout
  const i = [...Array(layout.count).keys()].find((k) => layout.bucket[k] === 0 && Math.hypot(layout.pos[k * 3], layout.pos[k * 3 + 2]) < 2)
  run.kinds[i] = SCREW_CRYSTAL
  Object.assign(pos, { x: layout.pos[i * 3], y: 0, z: layout.pos[i * 3 + 2] + 0.6 })
  const statsBefore = structuredClone(b.stats)
  now += 2000
  guest.handle('unscrew', { ids: [i] }, now)
  assert.ok(b.crystals > 0, 'the crystals are the player\'s')
  assert.deepEqual(b.stats, statsBefore, 'but nothing else counts')
})
