import { dayNumber, DRONE_RADIUS, RATE_SLACK, REACH_SLACK, SCREW_CRYSTAL, SCREW_GOLD, toolById } from './balance.js'
import { claimQuest, claimQuestBonus, ensureQuests, progressQuests, questText } from './engage.js'
import { atDoor, atHopper, spawnPoint } from './layout.js'
import {
  actionTime,
  advanceTutorial,
  applyAdReward,
  applyGemProduct,
  awardBadge,
  bagCapacity,
  buyPerk,
  buySkin,
  buyTool,
  buyUpgrade,
  claimDaily,
  clearChapter,
  countsForProgress,
  crystalsPerScrew,
  droneRate,
  endTeamRun,
  equipSkin,
  equipTool,
  isDifficultyUnlocked,
  joinFresh,
  newRunSpec,
  pauseRun,
  reachOf,
  resumeRun,
  screwValue,
  sellBag,
} from './logic.js'
import { RunInstance } from './run.js'
import { SPAWN } from './world.js'

/** Slack (m) on where you must stand to use the door (lag). */
const STAND_SLACK = 1.4
/** Slack on standing at the hopper: just enough for lag, so you can't sell from across the room. */
const SELL_SLACK = 0.9
/** Eye height above the feet, for reach checks. */
const EYE = 1.6
/** Most screw ids one 'unscrew' message may carry. */
const MAX_IDS = 64
/** Quest progress is sent at least this often (seconds) while it's changing. */
const QUEST_SYNC = 5

/** Runs made where no host keeps a registry (offline play, tests). */
const standaloneRuns = { create: (spec) => new RunInstance(spec) }

/**
 * Starts a run for `members` (PlayerSessions, `host` among them): a party, or a party of
 * one. `action` 'start' makes a new run of `chapter`/`diff`; 'load' carries on the host's
 * saved run. Everyone but a loading host starts their own side (cash, bag, tools) fresh.
 * Returns the run, or null if it couldn't start.
 */
export function startParty(host, members, { action, chapter, diff, pad }, now, runs = standaloneRuns) {
  const players = members.filter((m) => !m.inRun)
  if (!players.includes(host)) return null
  // A team pad's run: always a new one, and never saved (each player's solo save waits).
  const team = Boolean(pad)
  if (team && action === 'load') return null
  let spec
  if (action === 'load') {
    if (!host.profile.run) return null
    spec = { ...host.profile.run }
  } else {
    if (!isDifficultyUnlocked(host.profile, String(chapter), Number(diff))) return null
    spec = newRunSpec(host.profile, String(chapter), Number(diff), host.rand)
  }
  const run = runs.create(spec)
  players.forEach((m, k) => m.joinRun(run, { fresh: !(action === 'load' && m === host), team, now, k, n: players.length }))
  return run
}

/**
 * One player's authoritative session: validates intents and reports what happened
 * through `emit`. The run being played (shared with a party, or alone) is a RunInstance;
 * this session is one of its members.
 *
 * Transport-agnostic on purpose. The Colyseus room wraps one of these per client; the
 * offline mode wraps one for the local player. Either way the rules that run are the same.
 *
 * Events emitted (type, payload):
 * - 'profile'    { profile, session }  full state, after anything structural
 * - 'unscrewed'  { ok, bad, taken, bag, bagValue, crystals, left, gold, crystal, gained, screws }
 *                  your batch: taken (`ok`), refused (`bad`: the client puts them back), or
 *                  already gone to a teammate (`taken`)
 * - 'screwsGone' { ids, left }  a teammate took these
 * - 'sold'       { cash, screws }
 * - 'roomClear'  {}  the last screw of the room is out: the door opens
 * - 'room'       { room }  through the door into the next room
 * - 'chapterClear' { chapter, diff, time, best, newBest, crystals, screws, ... }
 * - 'teleport'   { x, y, z, yaw }  you were moved (into a room, back to the lobby)
 * - 'badge'      { id, name }
 * - 'quest'      { index, text }  one of today's quests just finished
 * - 'reward'     { label, crystals? }  an ad reward, a Gems purchase or a claim landed
 *
 * `onTeleport(x, z)` lets the host accept the jump in position; `runs` ({ create(spec) })
 * lets it keep the runs it hosts.
 */
export class PlayerSession {
  /**
   * @param {object} profile normalized profile (see logic.normalizeProfile)
   * @param {{ now: number, emit: (type: string, payload?: object) => void,
   *           getPosition: () => {x: number, y: number, z: number},
   *           onTeleport?: (x: number, z: number) => void, rand?: () => number,
   *           runs?: { create: (spec: object) => RunInstance } }} options
   */
  constructor(profile, { now, emit, getPosition, onTeleport, rand = Math.random, runs = standaloneRuns }) {
    this.profile = profile
    this.session = { startedAt: now }
    this.emit = emit
    this.getPosition = getPosition
    this.onTeleport = onTeleport
    this.rand = rand
    this.runs = runs
    ensureQuests(profile, now)
    this.day = dayNumber(now)
    this.minuteTimer = 0
    this.questsChanged = false
    this.questSync = 0
    this.dirty = false
    /** The run you're in (a RunInstance), or null in the lobby. */
    this.run = null
    /** Unscrew allowance (token buckets): your hands, and the drone. */
    this.hands = { tokens: 0, at: now }
    this.drone = { tokens: 0, at: now }
    // A run always resumes in the lobby (normalizeProfile clears `active`).
    if (profile.run) profile.run.active = false
  }

  /** Whether the player is inside a run's room right now (positions are room coordinates). */
  get inRun() {
    return this.run !== null
  }

  /** The current room's layout while in a run, else null. */
  get layout() {
    return this.run ? this.run.layout : null
  }

  // --- Plumbing --------------------------------------------------------------------

  sendProfile() {
    this.dirty = false
    this.questsChanged = false
    this.questSync = 0
    this.emit('profile', { profile: this.profile, session: this.session })
  }

  /** In a team run: just for fun, so nothing of it is kept (see logic countsForProgress). */
  get teamRun() {
    return !countsForProgress(this.profile)
  }

  badge(id) {
    if (this.teamRun) return
    const badge = awardBadge(this.profile, id)
    if (badge) {
      this.dirty = true
      this.emit('badge', badge)
    }
  }

  tutorial(event) {
    if (this.teamRun) return
    if (advanceTutorial(this.profile, event)) this.dirty = true
  }

  quest(type, amount, now) {
    if (this.teamRun) return
    const finished = progressQuests(this.profile, type, amount, now)
    if (amount > 0) this.questsChanged = true
    if (finished.length) this.dirty = true
    for (const index of finished) this.emit('quest', { index, text: questText(this.profile.quests.list[index]) })
  }

  teleport(x, z, yaw) {
    this.onTeleport?.(x, z)
    this.emit('teleport', { x, y: 0, z, yaw })
  }

  toLobby() {
    this.teleport(SPAWN.x + (this.rand() - 0.5) * 3, SPAWN.z, Math.PI)
  }

  /**
   * Into `run`: your own side started fresh (`fresh`) or carried on from your save, as
   * member `k` of `n` (where you stand at the start).
   */
  joinRun(run, { fresh, team = false, now, k = 0, n = 1 }) {
    if (fresh) joinFresh(this.profile, run.shared(), now, { team })
    else resumeRun(this.profile, now)
    this.run = run
    run.add(this)
    this.hands = { tokens: 0, at: now }
    this.drone = { tokens: 0, at: now }
    this.sendProfile()
    const at = spawnPoint(run.layout, k, n)
    this.teleport(at.x, at.z, at.yaw)
  }

  /**
   * Out of the run (back to the lobby, or gone). A solo run stays saved for LOAD; a team
   * run is over for you (the team plays on) and your solo save is back.
   */
  exitRun(now, { silent = false } = {}) {
    const run = this.run
    if (!run) return
    this.run = null
    if (this.profile.run?.team) endTeamRun(this.profile)
    else {
      run.sync(this)
      pauseRun(this.profile, now)
    }
    run.remove(this)
    if (silent) return
    this.sendProfile()
    this.toLobby()
  }

  /** Whether this player can start a party run of this kind right now. */
  canHost({ action, chapter, diff }) {
    if (this.inRun) return false
    if (action === 'load') return Boolean(this.profile.run)
    return isDifficultyUnlocked(this.profile, String(chapter), Number(diff))
  }

  // --- Intents ---------------------------------------------------------------------

  /** Dispatches one client message. Unknown types are ignored. */
  handle(type, payload = {}, now) {
    // Own handlers only: never a name every object inherits ('toString', '__proto__'...).
    if (!Object.hasOwn(this.handlers, type)) return
    const handler = this.handlers[type]
    if (typeof handler !== 'function') return
    handler.call(this, payload || {}, now)
    if (this.dirty) this.sendProfile()
  }

  handlers = {
    /** CREATE, alone: a new run of `chapter` at difficulty `diff`, straight into its first room. */
    startRun({ chapter, diff }, now) {
      if (this.inRun) return
      startParty(this, [this], { action: 'start', chapter, diff }, now, this.runs)
    },

    /** LOAD, alone: back into the saved run. */
    loadRun(_payload, now) {
      if (this.inRun || !this.profile.run) return
      startParty(this, [this], { action: 'load' }, now, this.runs)
    },

    /** Back to the lobby; the run stays saved for LOAD. */
    leaveRun(_payload, now) {
      this.exitRun(now)
    },

    /**
     * Screws the client unscrewed: `ids`, by your hands (aimed, within reach) or by your
     * Helper Drone (`drone`, near you). Each is checked - real, still in, close enough,
     * room in your bag, and not faster than your tool (or drone) can go - and taken or
     * refused one by one. One a teammate already took is `taken`: it's out, just not yours.
     */
    unscrew({ ids, drone }, now) {
      const run = this.run
      const mine = this.profile.run
      if (!run || !mine || !Array.isArray(ids) || !ids.length) return
      const { layout, kinds } = run
      const byDrone = Boolean(drone)
      const bucket = byDrone ? this.drone : this.hands
      let rate
      let cap
      if (byDrone) {
        rate = droneRate(this.profile) * RATE_SLACK
        cap = 4
      } else {
        const tool = toolById(mine.tool)
        rate = (tool.max / actionTime(this.profile, tool.id, now)) * RATE_SLACK
        cap = tool.max * 2 + 3
      }
      if (rate <= 0) return
      bucket.tokens = Math.min(cap, bucket.tokens + ((now - bucket.at) / 1000) * rate)
      bucket.at = now

      const p = this.getPosition()
      const ex = p.x
      const ey = (p.y || 0) + EYE
      const ez = p.z
      const reach = byDrone ? DRONE_RADIUS + EYE + REACH_SLACK : reachOf(this.profile) + REACH_SLACK
      const reachSq = reach * reach
      const capacity = bagCapacity(this.profile)
      const crystalsEach = crystalsPerScrew(this.profile)

      const ok = []
      const bad = []
      const taken = []
      let gold = 0
      let crystal = 0
      let crystals = 0
      let gained = 0
      for (const raw of ids.slice(0, MAX_IDS)) {
        const i = Number(raw)
        if (!Number.isInteger(i) || i < 0 || i >= layout.count) continue
        if (run.isOut(i)) {
          taken.push(i)
          continue
        }
        const dx = layout.pos[i * 3] - ex
        const dy = layout.pos[i * 3 + 1] - ey
        const dz = layout.pos[i * 3 + 2] - ez
        const kind = kinds[i]
        const needsBag = kind !== SCREW_CRYSTAL
        if (dx * dx + dy * dy + dz * dz > reachSq || bucket.tokens < 1 || (needsBag && mine.bag >= capacity)) {
          bad.push(i)
          continue
        }
        bucket.tokens -= 1
        run.take(i)
        ok.push(i)
        mine.screws += 1
        if (!this.teamRun) this.profile.stats.screws += 1
        if (kind === SCREW_CRYSTAL) {
          crystal += 1
          crystals += crystalsEach
        } else {
          if (kind === SCREW_GOLD) gold += 1
          const value = screwValue(this.profile, kind)
          mine.bag += 1
          mine.bagValue += value
          gained += value
        }
      }
      if (ok.length) {
        run.commit()
        // Crystals unscrewed are kept even in a team run (the one thing a team run keeps).
        this.profile.crystals += crystals
        if (!this.teamRun) {
          this.profile.stats.gold += gold
          this.profile.stats.crystal += crystal
        }
        const total = this.profile.stats.screws
        this.quest('screws', ok.length, now)
        if (gold) this.quest('gold', gold, now)
        if (crystal) {
          this.quest('crystal', crystal, now)
          this.badge('crystal')
        }
        this.tutorial('screw')
        this.badge('firstScrew')
        if (total >= 1000) this.badge('thousand')
        if (total >= 100000) this.badge('hundredK')
        run.broadcast('screwsGone', { ids: ok, left: run.left }, this)
      }
      this.emit('unscrewed', {
        ok,
        bad,
        taken,
        bag: mine.bag,
        bagValue: mine.bagValue,
        crystals: this.profile.crystals,
        left: run.left,
        gold,
        crystal,
        gained,
        drone: byDrone,
        screws: this.profile.stats.screws,
      })
      if (ok.length && run.left === 0) {
        run.broadcast('roomClear', {})
        for (const m of run.members) m.dirty = true
        for (const m of run.members) if (m !== this) m.sendProfile()
      }
    },

    /** Sells your bag: only standing at the SELL hopper. */
    sell(_payload, now) {
      const layout = this.layout
      if (!layout) return
      const p = this.getPosition()
      if (!atHopper(layout, p.x, p.z, SELL_SLACK)) return
      const result = sellBag(this.profile)
      if (!result.ok) return
      this.emit('sold', { cash: result.cash, screws: result.screws })
      this.quest('sells', 1, now)
      this.tutorial('sell')
      this.badge('firstSell')
      this.dirty = true
    },

    /** Buys a tool with this run's cash (from its pedestal or the hotbar). */
    buyTool({ id }) {
      const result = buyTool(this.profile, String(id))
      if (!result.ok) return
      this.tutorial('tool')
      this.badge('firstTool')
      this.dirty = true
    },

    equipTool({ id }) {
      if (equipTool(this.profile, String(id)).ok) this.dirty = true
    },

    upgrade({ stat }, now) {
      const result = buyUpgrade(this.profile, String(stat))
      if (!result.ok) return
      this.quest('upgrades', 1, now)
      this.tutorial('upgrade')
      this.dirty = true
    },

    /**
     * Through the open exit door: the whole party moves on together - into the next room,
     * or out of the chapter, each with their own rewards.
     */
    nextRoom(_payload, now) {
      const run = this.run
      if (!run || run.left > 0) return
      const p = this.getPosition()
      if (!atDoor(run.layout, p.x, p.z, STAND_SLACK)) return
      const members = [...run.members]
      for (const m of members) {
        if (!m.teamRun) m.profile.stats.rooms += 1
        m.quest('rooms', 1, now)
        m.badge('firstRoom')
      }
      if (!run.last) {
        run.loadRoom(run.room + 1, '')
        members.forEach((m, k) => {
          run.sync(m)
          m.profile.run.savedAt = now
          m.emit('room', { room: run.room })
          m.sendProfile()
          const at = spawnPoint(run.layout, k, members.length)
          m.teleport(at.x, at.z, at.yaw)
        })
        return
      }
      for (const m of members) {
        run.sync(m)
        const result = clearChapter(m.profile)
        m.run = null
        run.remove(m)
        m.badge(result.chapter)
        m.emit('chapterClear', result)
        m.sendProfile()
        m.toLobby()
      }
    },

    buyPerk({ id }) {
      if (this.inRun) return
      if (buyPerk(this.profile, String(id)).ok) this.dirty = true
    },

    buySkin({ id }) {
      if (buySkin(this.profile, String(id)).ok) this.dirty = true
    },

    equipSkin({ id }) {
      if (equipSkin(this.profile, String(id)).ok) this.dirty = true
    },

    claimDaily(_payload, now) {
      const result = claimDaily(this.profile, now)
      if (!result.ok) return
      this.dirty = true
      this.emit('reward', { label: `DAY ${result.day + 1} REWARD`, crystals: result.crystals })
    },

    claimQuest({ index }, now) {
      const result = claimQuest(this.profile, Number(index), now)
      if (!result.ok) return
      this.dirty = true
      this.emit('reward', { label: result.label, crystals: result.crystals })
    },

    claimQuestBonus(_payload, now) {
      const result = claimQuestBonus(this.profile, now)
      if (!result.ok) return
      this.dirty = true
      this.emit('reward', { label: result.label, crystals: result.crystals })
    },
  }

  // --- Granted by the host, never by a client message --------------------------------

  /** A rewarded ad the host has verified with Boxity (or, offline, that Boxity reported watched). */
  grantAdReward(placement, now) {
    const result = applyAdReward(this.profile, placement, now)
    if (!result.ok) return result
    this.emit('reward', { label: result.label })
    this.sendProfile()
    return result
  }

  /** A Gems purchase Boxity has confirmed (its webhook, recorded by the host). */
  grantGemProduct(sku) {
    const result = applyGemProduct(this.profile, sku)
    if (!result.ok) return result
    this.emit('reward', { label: result.name, crystals: result.crystals })
    this.sendProfile()
    return result
  }

  // --- Simulation ------------------------------------------------------------------

  /**
   * Advances the clock: playtime, quests and the day - and, for the first member of a run,
   * the run's own clock. Call at a steady rate.
   */
  tick(dt, now) {
    if (!this.teamRun) this.profile.stats.playtime += dt
    if (this.run && this.run.members[0] === this) this.run.tick(dt)
    this.minuteTimer += dt
    if (this.minuteTimer >= 60) {
      this.minuteTimer -= 60
      this.quest('minutes', 1, now)
    }
    this.questSync += dt
    if (this.questsChanged && this.questSync >= QUEST_SYNC) this.dirty = true
    const day = dayNumber(now)
    if (day !== this.day) {
      this.day = day
      if (ensureQuests(this.profile, now)) this.dirty = true
    }
    if (this.dirty) this.sendProfile()
  }
}
