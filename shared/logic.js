import {
  AD_REWARDS,
  BADGES,
  BAG_LEVELS,
  CHAPTERS,
  CRYSTALS_PER_SCREW,
  DAILY_REWARDS,
  dayNumber,
  DIFFICULTIES,
  DRONE_RATES,
  GEM_PRODUCTS,
  GOLD_VALUE,
  PERK_IDS,
  PERKS,
  REACH_LEVELS,
  SCREW_CRYSTAL,
  SCREW_GOLD,
  SKINS,
  SPEED_BOOST_MS,
  SPEED_STEP,
  TOOLS,
  TUTORIAL,
  UPGRADE_IDS,
  UPGRADES,
  skinById,
  toolById,
} from './balance.js'
import { getLayout } from './layout.js'

/**
 * Game rules as pure functions over a plain profile object.
 *
 * The server runs these authoritatively; the client runs the very same functions for
 * offline play and for display (prices, what a button would do). Mutating functions
 * change the profile in place and return a small result describing what happened.
 */

export const PROFILE_VERSION = 1

const blankPerks = () => Object.fromEntries(PERK_IDS.map((id) => [id, 0]))
const blankStats = () => ({ screws: 0, gold: 0, crystal: 0, sells: 0, cashEarned: 0, rooms: 0, chapters: 0, runs: 0, upgrades: 0, playtime: 0 })

export function createProfile(id, name) {
  return {
    v: PROFILE_VERSION,
    id,
    name,
    crystals: 0,
    perks: blankPerks(),
    skin: 'classic',
    skins: ['classic'],
    /** chapter id -> how many difficulties are cleared (1 = Normal, 2 = Hard, 3 = all). */
    cleared: {},
    /** `${chapter}:${difficulty index}` -> best clear time in seconds. */
    best: {},
    /** The run in progress (or saved), or null. See startRun. */
    run: null,
    passes: {},
    boosts: { speedUntil: 0 },
    /** placement -> when its rewarded ad last paid. */
    ads: {},
    /** The daily calendar: the day last claimed and which of the 7 it was. */
    daily: { day: -1, index: -1 },
    quests: null,
    tutorialStep: 0,
    badges: [],
    stats: blankStats(),
    lastSeen: 0,
  }
}

const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback)
const int = (v, min, max, fallback = min) => (Number.isInteger(v) ? Math.min(max, Math.max(min, v)) : fallback)

/** Rebuilds a valid run from whatever was saved, or null. */
function normalizeRun(raw) {
  if (!raw || typeof raw !== 'object') return null
  const ci = CHAPTERS.findIndex((c) => c.id === raw.chapter)
  if (ci < 0) return null
  const chapter = CHAPTERS[ci]
  const room = int(raw.room, 0, chapter.rooms.length - 1)
  const layout = getLayout(ci, room)
  const tools = Array.isArray(raw.tools) ? TOOLS.filter((t) => t.id === 'driver' || raw.tools.includes(t.id)).map((t) => t.id) : ['driver']
  const up = {}
  for (const id of UPGRADE_IDS) up[id] = int(raw.up?.[id], 0, UPGRADES[id].max)
  return {
    chapter: chapter.id,
    diff: int(raw.diff, 0, DIFFICULTIES.length - 1),
    room,
    seed: int(raw.seed, 1, 2 ** 31 - 1, 1),
    luck: Math.min(4, Math.max(1, num(raw.luck, 1))),
    removed: typeof raw.removed === 'string' ? raw.removed : '',
    left: int(raw.left, 0, layout.count, layout.count),
    cash: Math.max(0, num(raw.cash)),
    bag: int(raw.bag, 0, 1e6),
    bagValue: Math.max(0, num(raw.bagValue)),
    tools,
    tool: tools.includes(raw.tool) ? raw.tool : tools[tools.length - 1],
    up,
    time: Math.max(0, num(raw.time)),
    screws: int(raw.screws, 0, 1e9),
    // A run always resumes in the lobby: the player LOADs it from a play pad.
    active: false,
    savedAt: num(raw.savedAt),
  }
}

/**
 * Brings any saved profile (older versions, hand-edited, missing fields) up to the
 * current shape. Never trusts a field's type.
 */
export function normalizeProfile(raw, id, name) {
  const base = createProfile(id, name)
  if (!raw || typeof raw !== 'object') return base
  const p = { ...base }
  p.crystals = Math.max(0, Math.floor(num(raw.crystals)))
  for (const perk of PERK_IDS) p.perks[perk] = int(raw.perks?.[perk], 0, PERKS[perk].costs.length)
  p.skins = SKINS.filter((s) => s.price === 0 || (Array.isArray(raw.skins) && raw.skins.includes(s.id))).map((s) => s.id)
  p.skin = p.skins.includes(raw.skin) ? raw.skin : 'classic'
  for (const c of CHAPTERS) {
    const cleared = int(raw.cleared?.[c.id], 0, DIFFICULTIES.length)
    if (cleared) p.cleared[c.id] = cleared
  }
  if (raw.best && typeof raw.best === 'object') {
    for (const [key, value] of Object.entries(raw.best)) if (Number.isFinite(value) && value > 0 && /^[a-z]+:\d$/.test(key)) p.best[key] = value
  }
  // Team runs are never kept: one saved mid-team (a crash, a restart) gives way to the
  // solo run it had set aside.
  p.run = normalizeRun(raw.run?.team ? raw.soloRun : raw.run)
  if (raw.passes && typeof raw.passes === 'object') {
    for (const product of Object.values(GEM_PRODUCTS)) if (product.grant.pass && raw.passes[product.grant.pass]) p.passes[product.grant.pass] = true
  }
  p.boosts = { speedUntil: num(raw.boosts?.speedUntil) }
  if (raw.ads && typeof raw.ads === 'object') for (const key of Object.keys(AD_REWARDS)) if (Number.isFinite(raw.ads[key])) p.ads[key] = raw.ads[key]
  p.daily = { day: num(raw.daily?.day, -1), index: int(raw.daily?.index, -1, DAILY_REWARDS.length - 1, -1) }
  p.quests = raw.quests && typeof raw.quests === 'object' ? raw.quests : null
  p.tutorialStep = int(raw.tutorialStep, 0, TUTORIAL.length)
  p.badges = Array.isArray(raw.badges) ? raw.badges.filter((b) => BADGES[b]) : []
  p.stats = blankStats()
  for (const key of Object.keys(p.stats)) p.stats[key] = Math.max(0, num(raw.stats?.[key]))
  p.lastSeen = num(raw.lastSeen)
  return p
}

// --- Progress & unlocks -----------------------------------------------------------------

export const chapterIndex = (id) => CHAPTERS.findIndex((c) => c.id === id)

/** Whether chapter `id` is open: the first always is; the rest once the one before is cleared. */
export function isChapterUnlocked(profile, id) {
  const chapter = CHAPTERS[chapterIndex(id)]
  if (!chapter) return false
  // Open once the one before is cleared - or once you've cleared this one yourself (a
  // team can carry a newer player through a chapter they hadn't reached: it's theirs then).
  return !chapter.unlock || (profile.cleared[chapter.unlock] || 0) >= 1 || (profile.cleared[chapter.id] || 0) >= 1
}

/** Whether difficulty `diff` of chapter `id` is open: Hard after Normal, Impossible after Hard. */
export const isDifficultyUnlocked = (profile, id, diff) =>
  Number.isInteger(diff) && isChapterUnlocked(profile, id) && diff >= 0 && diff < DIFFICULTIES.length && (profile.cleared[id] || 0) >= diff

// --- A run's numbers ------------------------------------------------------------------------

/** The chapter, difficulty and layout of the run in progress (null without one). */
export function runInfo(profile) {
  const run = profile.run
  if (!run) return null
  const ci = chapterIndex(run.chapter)
  if (ci < 0) return null
  const chapter = CHAPTERS[ci]
  return { chapter, chapterIndex: ci, difficulty: DIFFICULTIES[run.diff], layout: getLayout(ci, run.room), last: run.room >= chapter.rooms.length - 1 }
}

export const speedBoosted = (profile, now) => (profile.boosts?.speedUntil || 0) > now

/** How much faster than base you unscrew. */
export function speedMultiplier(profile, now) {
  const level = profile.run?.up.speed || 0
  return (1 + SPEED_STEP * level) * (1 + PERKS.speed.per * profile.perks.speed) * (speedBoosted(profile, now) ? 2 : 1)
}

/** Seconds of holding one action of `toolId` takes in the current run. */
export function actionTime(profile, toolId, now) {
  const info = runInfo(profile)
  const tool = toolById(toolId) || TOOLS[0]
  if (!info) return tool.time
  return (tool.time * info.chapter.tough * info.difficulty.tough) / speedMultiplier(profile, now)
}

export function bagCapacity(profile) {
  const level = profile.run?.up.bag || 0
  return Math.floor(BAG_LEVELS[level] * (1 + PERKS.bag.per * profile.perks.bag) * (profile.passes.bagX2 ? 2 : 1))
}

export const reachOf = (profile) => REACH_LEVELS[profile.run?.up.reach || 0]

export const sellMultiplier = (profile) => (1 + PERKS.sell.per * profile.perks.sell) * (profile.passes.cashX2 ? 2 : 1)

export const luckOf = (profile) => 1 + PERKS.luck.per * profile.perks.luck

export const droneRate = (profile) => DRONE_RATES[profile.perks.drone] || 0

/** What one screw of `kind` adds to the bag's value in this room. */
export function screwValue(profile, kind) {
  const info = runInfo(profile)
  if (!info) return 0
  return info.layout.value * info.chapter.scale * (kind === SCREW_GOLD ? GOLD_VALUE : 1)
}

/** Crystals one crystal screw gives in this run. */
export function crystalsPerScrew(profile) {
  const info = runInfo(profile)
  const diff = info ? info.difficulty.crystals : 1
  return Math.max(1, Math.round(CRYSTALS_PER_SCREW * diff)) * (profile.passes.crystalX2 ? 2 : 1)
}

const priceScale = (profile) => runInfo(profile)?.chapter.scale || 1

export const toolPrice = (profile, id) => (toolById(id)?.price || 0) * priceScale(profile)

/** The next level of upgrade `stat` costs this (Infinity once maxed). */
export function upgradeCost(profile, stat) {
  const up = Object.hasOwn(UPGRADES, stat) ? UPGRADES[stat] : null
  const level = profile.run?.up[stat] || 0
  if (!up || level >= up.max) return Infinity
  return up.cost(level) * priceScale(profile)
}

/** The next level of perk `id` costs this many Crystals (Infinity once maxed). */
export function perkCost(profile, id) {
  const perk = Object.hasOwn(PERKS, id) ? PERKS[id] : null
  if (!perk) return Infinity
  return perk.costs[profile.perks[id]] ?? Infinity
}

/** Starting cash for a new run of `chapter`. */
export const startingCash = (profile, chapter) => PERKS.cash.per * profile.perks.cash * chapter.scale

// --- Runs ---------------------------------------------------------------------------------

/** Your own side of a run, fresh: starting cash, an empty bag, your starting tools. */
function freshEconomy(profile, chapter) {
  const tools = profile.passes.starterDrill ? ['driver', 'drill'] : ['driver']
  return {
    cash: startingCash(profile, chapter),
    bag: 0,
    bagValue: 0,
    tools,
    tool: tools[tools.length - 1],
    up: Object.fromEntries(UPGRADE_IDS.map((id) => [id, 0])),
    screws: 0,
  }
}

/** A new run's shared side: chapter, difficulty, first room, its seed and luck. */
export function newRunSpec(profile, chapterId, diff, rand = Math.random) {
  const ci = chapterIndex(chapterId)
  return {
    chapter: CHAPTERS[ci].id,
    diff,
    room: 0,
    seed: 1 + Math.floor(rand() * (2 ** 31 - 2)),
    luck: luckOf(profile),
    removed: '',
    left: getLayout(ci, 0).count,
    time: 0,
  }
}

/**
 * Joins `profile` to a run whose shared side is `spec` (a party's), starting your own
 * side fresh. The run starts active. Alone, it replaces any saved run; with a team
 * (`team`), the saved run is set aside untouched (`profile.soloRun`) - team runs are
 * never saved, and when this one ends the solo run comes back (endTeamRun).
 */
/**
 * Team runs are just for fun: nothing in one counts towards the player's own progress -
 * no saved run, unlocks, best times, clear rewards, stats, quests or badges. The one
 * thing kept: Crystals unscrewed from crystal screws (session.js).
 */
export const countsForProgress = (profile) => !profile.run?.team

export function joinFresh(profile, spec, now, { team = false } = {}) {
  const chapter = CHAPTERS[chapterIndex(spec.chapter)]
  if (team && !profile.run?.team) {
    if (profile.run) profile.soloRun = { ...profile.run, active: false }
    else delete profile.soloRun
  }
  profile.run = { ...spec, ...freshEconomy(profile, chapter), active: true, savedAt: now }
  if (team) profile.run.team = true
  else profile.stats.runs += 1
  return { ok: true }
}

/** A team run is over (left, or cleared): it's gone, and the solo run set aside is back. */
export function endTeamRun(profile) {
  profile.run = profile.soloRun || null
  delete profile.soloRun
}

/**
 * CREATE: a fresh run of chapter `chapterId` at difficulty `diff` (any saved run is
 * replaced). The run starts active (you're in its first room).
 */
export function startRun(profile, chapterId, diff, now, rand = Math.random) {
  if (!isDifficultyUnlocked(profile, chapterId, diff)) return { ok: false, reason: 'locked' }
  return joinFresh(profile, newRunSpec(profile, chapterId, diff, rand), now)
}

/** LOAD: back into the saved run where you left it. */
export function resumeRun(profile, now) {
  if (!profile.run) return { ok: false }
  profile.run.active = true
  profile.run.savedAt = now
  return { ok: true }
}

/** Back to the lobby; the run stays saved. */
export function pauseRun(profile, now) {
  if (!profile.run) return { ok: false }
  profile.run.active = false
  profile.run.savedAt = now
  return { ok: true }
}

/**
 * Sells the bag at the hopper. (Where you're standing is the session's to check.)
 * Returns the cash it paid.
 */
export function sellBag(profile) {
  const run = profile.run
  if (!run?.active || run.bag <= 0) return { ok: false }
  const cash = run.bagValue * sellMultiplier(profile)
  const screws = run.bag
  run.cash += cash
  run.bag = 0
  run.bagValue = 0
  if (!run.team) {
    profile.stats.sells += 1
    profile.stats.cashEarned += cash
  }
  return { ok: true, cash, screws }
}

export function buyTool(profile, id) {
  const run = profile.run
  const tool = toolById(id)
  if (!run?.active || !tool || run.tools.includes(id)) return { ok: false }
  const price = toolPrice(profile, id)
  if (run.cash < price) return { ok: false, reason: 'cash' }
  run.cash -= price
  run.tools = TOOLS.filter((t) => t.id === id || run.tools.includes(t.id)).map((t) => t.id)
  run.tool = id
  return { ok: true, price }
}

export function equipTool(profile, id) {
  const run = profile.run
  if (!run?.active || !run.tools.includes(id)) return { ok: false }
  run.tool = id
  return { ok: true }
}

export function buyUpgrade(profile, stat) {
  const run = profile.run
  if (!run?.active || !Object.hasOwn(UPGRADES, stat)) return { ok: false }
  const cost = upgradeCost(profile, stat)
  if (!Number.isFinite(cost) || run.cash < cost) return { ok: false, reason: 'cash' }
  run.cash -= cost
  run.up[stat] += 1
  if (!run.team) profile.stats.upgrades += 1
  return { ok: true, cost, level: run.up[stat] }
}

/**
 * Out of the last room: Crystals, a best time, the next difficulty or chapter unlocked,
 * and the run is over. (Each member of a party gets their own.)
 */
export function clearChapter(profile) {
  const run = profile.run
  const info = runInfo(profile)
  if (!run || !info) return { ok: false }
  const key = `${run.chapter}:${run.diff}`
  const prevBest = profile.best[key] || 0
  const time = Math.round(run.time)
  if (run.team) {
    // Just for fun: the team's clear changes nothing of the player's own (and their solo
    // run, set aside, is back).
    const result = { ok: true, done: true, team: true, chapter: run.chapter, diff: run.diff, time, best: prevBest, newBest: false, crystals: 0, screws: run.screws, unlockedDifficulty: null, unlockedChapter: null }
    endTeamRun(profile)
    return result
  }
  // Best times are solo: a team's clear counts for everything else, but not the record.
  const best = run.team ? prevBest : prevBest ? Math.min(prevBest, time) : time
  if (best) profile.best[key] = best
  const before = profile.cleared[run.chapter] || 0
  profile.cleared[run.chapter] = Math.max(before, run.diff + 1)
  const crystals = Math.round(info.chapter.reward * info.difficulty.crystals)
  profile.crystals += crystals
  profile.stats.chapters += 1
  const result = {
    ok: true,
    done: true,
    chapter: run.chapter,
    diff: run.diff,
    time,
    best,
    newBest: !run.team && (!prevBest || time < prevBest),
    team: Boolean(run.team),
    crystals,
    screws: run.screws,
    unlockedDifficulty: run.diff + 1 > before && run.diff + 1 < DIFFICULTIES.length ? DIFFICULTIES[run.diff + 1].name : null,
    unlockedChapter: before === 0 ? CHAPTERS.find((c) => c.unlock === run.chapter)?.name || null : null,
  }
  // Cleared: the run's done. A team's gives way to the solo run it set aside.
  if (run.team) endTeamRun(profile)
  else profile.run = null
  return result
}

/**
 * Through the open door, alone: to the next room, or - from the last - out of the
 * chapter (clearChapter). Parties move on together through the run (session.js).
 */
export function advanceRoom(profile, now) {
  const run = profile.run
  const info = runInfo(profile)
  if (!run?.active || !info || run.left > 0) return { ok: false }
  profile.stats.rooms += 1
  if (!info.last) {
    run.room += 1
    run.removed = ''
    run.left = getLayout(info.chapterIndex, run.room).count
    run.savedAt = now
    return { ok: true, room: run.room }
  }
  return clearChapter(profile)
}

// --- Lobby: perks & skins ----------------------------------------------------------------------

export function buyPerk(profile, id) {
  if (!Object.hasOwn(PERKS, id)) return { ok: false }
  const cost = perkCost(profile, id)
  if (!Number.isFinite(cost) || profile.crystals < cost) return { ok: false }
  profile.crystals -= cost
  profile.perks[id] += 1
  return { ok: true, level: profile.perks[id] }
}

export function buySkin(profile, id) {
  const skin = SKINS.find((s) => s.id === id)
  if (!skin || profile.skins.includes(id) || profile.crystals < skin.price) return { ok: false }
  profile.crystals -= skin.price
  profile.skins = SKINS.filter((s) => s.id === id || profile.skins.includes(s.id)).map((s) => s.id)
  profile.skin = id
  return { ok: true }
}

export function equipSkin(profile, id) {
  if (!profile.skins.includes(id)) return { ok: false }
  profile.skin = skinById(id).id
  return { ok: true }
}

// --- Daily calendar ---------------------------------------------------------------------------

/**
 * Where the 7-day calendar stands today: `next` is the day (0-6) a claim would take,
 * `canClaim` whether today's is still there, and `claimed` how many of this week are
 * ticked. Missing a day starts the week again.
 */
export function dailyState(profile, now) {
  const today = dayNumber(now)
  const { day, index } = profile.daily
  if (day === today) return { canClaim: false, next: index, claimed: index + 1 }
  const streak = day === today - 1 && index < DAILY_REWARDS.length - 1
  const next = streak ? index + 1 : 0
  return { canClaim: true, next, claimed: next }
}

export function claimDaily(profile, now) {
  const state = dailyState(profile, now)
  if (!state.canClaim) return { ok: false }
  const crystals = DAILY_REWARDS[state.next]
  profile.daily = { day: dayNumber(now), index: state.next }
  profile.crystals += crystals
  return { ok: true, crystals, day: state.next }
}

// --- Boxity: ads and Gems ------------------------------------------------------------------

export function adReady(profile, placement, now) {
  const ad = Object.hasOwn(AD_REWARDS, placement) ? AD_REWARDS[placement] : null
  return Boolean(ad) && now - (profile.ads[placement] || 0) >= ad.cooldownMs
}

export function applyAdReward(profile, placement, now) {
  const ad = Object.hasOwn(AD_REWARDS, placement) ? AD_REWARDS[placement] : null
  if (!ad || !adReady(profile, placement, now)) return { ok: false }
  profile.ads[placement] = now
  if (ad.grant.crystals) profile.crystals += ad.grant.crystals
  if (ad.grant.boost === 'speed') profile.boosts.speedUntil = Math.max(now, profile.boosts.speedUntil || 0) + SPEED_BOOST_MS
  return { ok: true, label: ad.label }
}

export function applyGemProduct(profile, sku) {
  const product = Object.hasOwn(GEM_PRODUCTS, sku) ? GEM_PRODUCTS[sku] : null
  if (!product) return { ok: false }
  if (product.grant.crystals) profile.crystals += product.grant.crystals
  if (product.grant.pass) profile.passes[product.grant.pass] = true
  return { ok: true, name: product.name, crystals: product.grant.crystals || 0 }
}

// --- Badges & tutorial ---------------------------------------------------------------------

export function awardBadge(profile, id) {
  if (!Object.hasOwn(BADGES, id) || profile.badges.includes(id)) return null
  profile.badges.push(id)
  return { id, name: BADGES[id].name }
}

/** Moves the tutorial on if `event` is what its current step waits for. */
export function advanceTutorial(profile, event) {
  const step = TUTORIAL[profile.tutorialStep]
  if (!step || step.event !== event) return false
  if (step.count && profile.stats.screws < step.count) return false
  profile.tutorialStep += 1
  return true
}

export const tutorialDone = (profile) => profile.tutorialStep >= TUTORIAL.length

export { SCREW_CRYSTAL, SCREW_GOLD }
