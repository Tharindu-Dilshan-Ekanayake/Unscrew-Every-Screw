import { CHAPTERS } from './balance.js'
import { createBits, decodeBits, encodeBits, getBit, setBit } from './bits.js'
import { getLayout, screwKinds } from './layout.js'

let nextRun = 1

/**
 * One run being played: the shared side of it - which chapter, which room, which screws
 * are out, the clock - for everyone in it (a solo player, or a party of up to four).
 * Each member's own side (cash, bag, tools, upgrades) stays in their profile.
 *
 * Members are PlayerSessions (session.js); the run keeps each member's `profile.run` in
 * step with its shared side, so a save is always current and anyone who leaves keeps the
 * run to LOAD later.
 */
export class RunInstance {
  /**
   * @param {{ chapter: string, diff: number, room?: number, seed: number, luck?: number,
   *           removed?: string, time?: number }} spec
   * @param {{ onEmpty?: (run: RunInstance) => void }} [hooks]
   */
  constructor(spec, { onEmpty } = {}) {
    this.id = `r${nextRun++}${Math.random().toString(36).slice(2, 7)}`
    this.chapter = spec.chapter
    this.chapterIndex = Math.max(0, CHAPTERS.findIndex((c) => c.id === spec.chapter))
    this.diff = spec.diff
    this.seed = spec.seed
    this.luck = spec.luck || 1
    this.time = spec.time || 0
    /** PlayerSessions in the run, in the order they came. */
    this.members = []
    this.onEmpty = onEmpty
    this.loadRoom(spec.room || 0, spec.removed || '')
  }

  /** Into room `room`, with `removed` (a saved bitset) already out. */
  loadRoom(room, removed = '') {
    this.room = room
    this.layout = getLayout(this.chapterIndex, room)
    this.bits = removed ? decodeBits(removed, this.layout.count) : createBits(this.layout.count)
    this.kinds = screwKinds(this.layout, this.seed, this.luck)
    let out = 0
    for (let i = 0; i < this.layout.count; i += 1) out += getBit(this.bits, i)
    this.left = this.layout.count - out
    // A fresh room saves as '' (nothing out yet), like a fresh run.
    this.removed = out ? encodeBits(this.bits) : ''
  }

  get last() {
    return this.room >= CHAPTERS[this.chapterIndex].rooms.length - 1
  }

  isOut(i) {
    return getBit(this.bits, i) === 1
  }

  /** Takes screw i out (the caller has checked it was in). */
  take(i) {
    setBit(this.bits, i)
    this.left -= 1
  }

  /** The run's shared side, as it goes into each member's profile.run. */
  shared() {
    return { runId: this.id, chapter: this.chapter, diff: this.diff, room: this.room, seed: this.seed, luck: this.luck, removed: this.removed, left: this.left, time: this.time }
  }

  /** After screws came out: the new bitset into every member's save. */
  commit() {
    this.removed = encodeBits(this.bits)
    for (const m of this.members) this.sync(m)
  }

  sync(member) {
    if (member.profile.run) Object.assign(member.profile.run, this.shared())
  }

  add(member) {
    if (!this.members.includes(member)) this.members.push(member)
    this.sync(member)
  }

  remove(member) {
    this.members = this.members.filter((m) => m !== member)
    if (this.members.length === 0) this.onEmpty?.(this)
  }

  /** Sends an event to every member (but `except`). */
  broadcast(type, payload, except = null) {
    for (const m of this.members) if (m !== except) m.emit(type, payload)
  }

  /** The run's clock (called once per tick, by its first member). */
  tick(dt) {
    this.time += dt
    for (const m of this.members) if (m.profile.run) m.profile.run.time = this.time
  }
}
