import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  AD_REWARDS,
  BAG_LEVELS,
  DAILY_REWARDS,
  DAY_MS,
  GEM_PRODUCTS,
  QUEST_BONUS,
  QUEST_REWARDS,
  QUEST_TYPES,
  QUESTS_PER_DAY,
  SCREW_PLAIN,
  SPEED_BOOST_MS,
} from '../../shared/balance.js'
import { createQuestDay, questText } from '../../shared/engage.js'
import { clampToRoom, screwKinds, screwPosition } from '../../shared/layout.js'
import { actionTime, bagCapacity, createProfile, dailyState, luckOf, sellMultiplier, speedMultiplier } from '../../shared/logic.js'
import { PlayerSession } from '../../shared/session.js'

/** Noon on day 1000: the fake clock's start. */
const T0 = 1000 * DAY_MS + DAY_MS / 2

/** A session over a fake clock (`t.now`), recording what it emits. */
function makeSession(profile = createProfile('p1', 'P')) {
  const t = { now: T0, pos: { x: 0, y: 0, z: 0 }, events: [], profile }
  t.session = new PlayerSession(profile, {
    now: t.now,
    rand: () => 0.5,
    emit: (type, payload) => t.events.push({ type, payload }),
    getPosition: () => t.pos,
    onTeleport: (x, z) => Object.assign(t.pos, { x, y: 0, z }),
  })
  t.advance = (ms) => (t.now += ms)
  t.send = (type, payload = {}) => t.session.handle(type, payload, t.now)
  t.of = (type) => t.events.filter((e) => e.type === type).map((e) => e.payload)
  /** Walks up to plain screw number `n` (of those in the room), waits a second, unscrews it. */
  t.takePlain = (n) => {
    const layout = t.session.layout
    const kinds = screwKinds(layout, t.profile.run.seed, luckOf(t.profile))
    const plain = [...kinds.keys()].filter((i) => kinds[i] === SCREW_PLAIN)
    const s = screwPosition(layout, plain[n])
    Object.assign(t.pos, clampToRoom(layout, s.x, s.z))
    t.advance(1000)
    t.send('unscrew', { ids: [plain[n]] })
  }
  return t
}

// --- Quests ------------------------------------------------------------------------

test('each day deals three quests: easy, medium, hard, all different, the same on every call', () => {
  const p = createProfile('player-1', 'P')
  const a = createQuestDay(p, 100)
  assert.deepEqual(createQuestDay(p, 100), a)
  assert.equal(a.list.length, QUESTS_PER_DAY)
  assert.deepEqual(a.list.map((q) => q.tier), [0, 1, 2])
  assert.equal(new Set(a.list.map((q) => q.type)).size, QUESTS_PER_DAY)
  for (const q of a.list) assert.equal(q.target, QUEST_TYPES[q.type].targets[q.tier])
  const days = Array.from({ length: 6 }, (_, i) => createQuestDay(p, 101 + i).list.map((q) => q.type).join())
  assert.ok(days.some((d) => d !== a.list.map((q) => q.type).join()), 'another day, another deal')
  // A new session hands out today's straight away.
  const t = makeSession()
  assert.equal(t.profile.quests.day, Math.floor(T0 / DAY_MS))
})

test('quests count what you do, finish once, pay once when claimed, then the bonus', () => {
  const t = makeSession()
  t.profile.quests.list = [
    { type: 'screws', tier: 0, target: 3, progress: 0, claimed: false },
    { type: 'sells', tier: 1, target: 1, progress: 0, claimed: false },
    { type: 'upgrades', tier: 2, target: 1, progress: 0, claimed: false },
  ]
  const [screws, sells, upgrades] = t.profile.quests.list
  t.send('startRun', { chapter: 'workshop', diff: 0 })
  // Twelve $1 screws: enough, once sold, for the first Hand Speed level ($12).
  for (let n = 0; n < 12; n += 1) t.takePlain(n)
  assert.equal(screws.progress, 3, 'capped at the target')
  assert.deepEqual(t.of('quest'), [{ index: 0, text: questText(screws) }], 'finished once')
  assert.equal(questText(screws), 'Unscrew 3 screws')

  t.send('claimQuest', { index: 1 })
  assert.equal(t.profile.crystals, 0, 'not done yet')
  t.send('claimQuest', { index: 0 })
  assert.equal(t.profile.crystals, QUEST_REWARDS[0])
  assert.equal(screws.claimed, true)
  assert.equal(t.of('reward').at(-1).crystals, QUEST_REWARDS[0])
  t.send('claimQuest', { index: 0 })
  assert.equal(t.profile.crystals, QUEST_REWARDS[0], 'paid once')
  t.send('claimQuestBonus')
  assert.equal(t.profile.crystals, QUEST_REWARDS[0], 'the bonus waits for all three')

  const layout = t.session.layout
  Object.assign(t.pos, { x: layout.sell.x, z: layout.sell.z })
  t.send('sell')
  assert.equal(t.profile.run.cash, 12)
  t.send('upgrade', { stat: 'speed' })
  assert.equal(sells.progress, 1)
  assert.equal(upgrades.progress, 1)
  t.send('claimQuest', { index: 1 })
  t.send('claimQuest', { index: 2 })
  const all = QUEST_REWARDS[0] + QUEST_REWARDS[1] + QUEST_REWARDS[2]
  assert.equal(t.profile.crystals, all)
  t.send('claimQuestBonus')
  assert.equal(t.profile.crystals, all + QUEST_BONUS)
  t.send('claimQuestBonus')
  assert.equal(t.profile.crystals, all + QUEST_BONUS, 'one bonus a day')
})

test('quest progress reaches the client every few seconds, and midnight deals a new day', () => {
  const t = makeSession()
  t.profile.quests.list[0] = { type: 'minutes', tier: 0, target: 5, progress: 0, claimed: false }
  const day = t.profile.quests.day
  for (let s = 0; s < 60; s += 1) t.session.tick(1, t.advance(1000))
  assert.equal(t.profile.quests.list[0].progress, 1, 'a minute played')
  assert.equal(t.profile.stats.playtime, 60)
  const profiles = t.of('profile').length
  assert.ok(profiles >= 1, 'progress was sent')
  t.session.tick(1, t.advance(DAY_MS))
  assert.equal(t.profile.quests.day, day + 1)
  assert.equal(t.profile.quests.list.every((q) => q.progress === 0), true)
  assert.ok(t.of('profile').length > profiles)
})

// --- Daily calendar ----------------------------------------------------------------

test('the daily calendar pays once a day, builds a streak, and starts over after a missed day', () => {
  const t = makeSession()
  const claim = () => {
    const before = t.profile.crystals
    t.send('claimDaily')
    return t.profile.crystals - before
  }
  assert.deepEqual(dailyState(t.profile, t.now), { canClaim: true, next: 0, claimed: 0 })
  assert.equal(claim(), DAILY_REWARDS[0])
  assert.equal(t.of('reward').at(-1).label, 'DAY 1 REWARD')
  assert.equal(claim(), 0, 'once a day')
  t.advance(DAY_MS)
  assert.equal(claim(), DAILY_REWARDS[1])
  t.advance(DAY_MS)
  assert.equal(claim(), DAILY_REWARDS[2])
  assert.deepEqual(dailyState(t.profile, t.now), { canClaim: false, next: 2, claimed: 3 })

  t.advance(2 * DAY_MS)
  assert.equal(dailyState(t.profile, t.now).next, 0, 'a day was missed')
  assert.equal(claim(), DAILY_REWARDS[0])

  // After day 7 the week starts again.
  t.profile.daily = { day: Math.floor(t.now / DAY_MS), index: DAILY_REWARDS.length - 1 }
  t.advance(DAY_MS)
  assert.equal(claim(), DAILY_REWARDS[0])
})

// --- Ads and Gems ------------------------------------------------------------------

test('a rewarded ad pays once per cooldown', () => {
  const t = makeSession()
  const ad = AD_REWARDS['free-crystals']
  assert.equal(t.session.grantAdReward('free-crystals', t.now).ok, true)
  assert.equal(t.profile.crystals, ad.grant.crystals)
  assert.deepEqual(t.of('reward').at(-1), { label: ad.label })
  t.advance(ad.cooldownMs - 1000)
  assert.equal(t.session.grantAdReward('free-crystals', t.now).ok, false, 'still cooling down')
  assert.equal(t.profile.crystals, ad.grant.crystals)
  t.advance(1000)
  assert.equal(t.session.grantAdReward('free-crystals', t.now).ok, true)
  assert.equal(t.profile.crystals, 2 * ad.grant.crystals)
  assert.equal(t.session.grantAdReward('no-such-ad', t.now).ok, false)
})

test('the Speed Boost ad doubles hand speed for three minutes', () => {
  const t = makeSession()
  t.send('startRun', { chapter: 'workshop', diff: 0 })
  const normal = actionTime(t.profile, 'driver', t.now)
  assert.equal(t.session.grantAdReward('speed-boost', t.now).ok, true)
  assert.equal(t.profile.boosts.speedUntil, t.now + SPEED_BOOST_MS)
  assert.equal(speedMultiplier(t.profile, t.now), 2)
  assert.equal(actionTime(t.profile, 'driver', t.now), normal / 2)
  assert.equal(speedMultiplier(t.profile, t.now + SPEED_BOOST_MS), 1, 'worn off')
})

test('Gems products grant Crystals and passes; unknown skus nothing', () => {
  const t = makeSession()
  const r = t.session.grantGemProduct('crystals_small')
  assert.equal(r.ok, true)
  assert.equal(t.profile.crystals, GEM_PRODUCTS.crystals_small.grant.crystals)
  assert.deepEqual(t.of('reward').at(-1), { label: GEM_PRODUCTS.crystals_small.name, crystals: GEM_PRODUCTS.crystals_small.grant.crystals })
  assert.equal(t.of('profile').length, 1, 'the new balance is sent')

  for (const sku of ['big_bag', 'cash_x2', 'starter_drill', 'crystal_x2']) assert.equal(t.session.grantGemProduct(sku).ok, true)
  assert.deepEqual(t.profile.passes, { bagX2: true, cashX2: true, starterDrill: true, crystalX2: true })
  t.send('startRun', { chapter: 'workshop', diff: 0 })
  assert.equal(bagCapacity(t.profile), 2 * BAG_LEVELS[0])
  assert.equal(sellMultiplier(t.profile), 2)
  assert.deepEqual(t.profile.run.tools, ['driver', 'drill'], 'every run starts with the Power Drill')
  assert.equal(t.profile.run.tool, 'drill')

  const events = t.events.length
  assert.equal(t.session.grantGemProduct('nope').ok, false)
  assert.equal(t.events.length, events, 'nothing said about it')
})
