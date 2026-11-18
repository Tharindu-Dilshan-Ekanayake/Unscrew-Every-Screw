import { dayNumber, QUEST_BONUS, QUEST_REWARDS, QUEST_TYPES, QUESTS_PER_DAY } from './balance.js'
import { mulberry32 } from './rng.js'

/**
 * Daily quests, as pure functions over the profile (run by the same authority as
 * logic.js). Picked per player per day from a seeded random (the day and the player's
 * id), so the server and the offline stand-in agree, and a refresh never re-rolls them.
 */

/** A stable 32-bit hash of a string (FNV-1a). */
function hashString(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Today's three quests for `profile`: an easy, a medium and a hard one, all different kinds. */
export function createQuestDay(profile, day) {
  const rand = mulberry32(hashString(`${profile.id}:${day}`))
  const kinds = Object.keys(QUEST_TYPES)
  const list = []
  for (let tier = 0; tier < QUESTS_PER_DAY; tier += 1) {
    const type = kinds.splice(Math.floor(rand() * kinds.length), 1)[0]
    list.push({ type, tier, target: QUEST_TYPES[type].targets[tier], progress: 0, claimed: false })
  }
  return { day, list, bonus: false }
}

/** Makes sure the profile holds today's quests. Returns true if a new day's were dealt. */
export function ensureQuests(profile, now) {
  const day = dayNumber(now)
  const q = profile.quests
  const valid =
    q && q.day === day && Array.isArray(q.list) && q.list.length === QUESTS_PER_DAY && q.list.every((x) => QUEST_TYPES[x?.type] && Number.isFinite(x.progress))
  if (valid) return false
  profile.quests = createQuestDay(profile, day)
  return true
}

/** A quest's line for the UI: "Unscrew 600 screws". */
export const questText = (quest) => QUEST_TYPES[quest.type]?.text.replace('{n}', quest.target.toLocaleString('en-US')) ?? ''

export const questDone = (quest) => quest.progress >= quest.target

/**
 * Adds `amount` to every unfinished quest of kind `type`. Returns the indices of the
 * quests this just finished.
 */
export function progressQuests(profile, type, amount, now) {
  if (!(amount > 0)) return []
  ensureQuests(profile, now)
  const finished = []
  profile.quests.list.forEach((quest, index) => {
    if (quest.type !== type || questDone(quest)) return
    quest.progress = Math.min(quest.target, quest.progress + amount)
    if (questDone(quest)) finished.push(index)
  })
  return finished
}

export function claimQuest(profile, index, now) {
  ensureQuests(profile, now)
  const quest = profile.quests.list[index]
  if (!quest || quest.claimed || !questDone(quest)) return { ok: false }
  quest.claimed = true
  const crystals = QUEST_REWARDS[quest.tier] || 0
  profile.crystals += crystals
  return { ok: true, crystals, label: `QUEST REWARD +${crystals} Crystals` }
}

/** Whether today's bonus chest can be opened: all three quests claimed. */
export const questsReady = (profile) => Boolean(profile.quests) && !profile.quests.bonus && profile.quests.list.every((q) => q.claimed)

export function claimQuestBonus(profile, now) {
  ensureQuests(profile, now)
  if (!questsReady(profile)) return { ok: false }
  profile.quests.bonus = true
  profile.crystals += QUEST_BONUS
  return { ok: true, crystals: QUEST_BONUS, label: `ALL QUESTS DONE +${QUEST_BONUS} Crystals` }
}
