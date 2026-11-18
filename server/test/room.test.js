import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getLayout, ROOM_PLAYER_RADIUS } from '../../shared/layout.js'
import { createProfile } from '../../shared/logic.js'
import { MAX_MOVE_SPEED, PLAZA, SPAWN } from '../../shared/world.js'
import { GameRoom } from '../src/rooms/GameRoom.js'
import { PlayerState } from '../src/rooms/schema.js'

/**
 * GameRoom's per-player plumbing, without a Colyseus server: its methods run against a
 * stand-in holding just the members and the synced players, and one member made by the
 * room's own createMember (so the session's teleports go through the real wiring).
 */
function setup(profile = createProfile('p1', 'P')) {
  const room = { members: new Map(), state: { players: new Map() } }
  for (const name of ['createMember', 'handleIntent', 'handlePosition', 'syncPlayer']) room[name] = GameRoom.prototype[name]
  const sent = []
  const client = { sessionId: 's1', send: (type, payload) => sent.push({ type, payload }) }
  const player = new PlayerState()
  Object.assign(player, { name: 'P', x: SPAWN.x, y: 0, z: SPAWN.z, rotY: Math.PI, anim: 'idle' })
  const member = room.createMember(client, player, profile, { playerId: 'p1', verified: false, owner: 'test', now: Date.now() })
  room.members.set('s1', member)
  room.state.players.set('s1', player)
  room.syncPlayer('s1')
  /** Pretends `seconds` passed since the last accepted position. */
  const wait = (seconds) => (member.lastPosAt -= seconds * 1000)
  const pos = (x, z, extra = {}) => room.handlePosition(client, { x, y: 0, z, r: 0, a: 'walk', ...extra })
  const corrections = () => sent.filter((m) => m.type === 'correct')
  return { room, client, player, member, sent, wait, pos, corrections, intent: (type, payload) => room.handleIntent(client, type, payload) }
}

const near = (a, b) => Math.abs(a - b) < 1e-6

test('lobby positions: possible moves are kept inside the yard, impossible ones snapped back', () => {
  const r = setup()
  assert.equal(r.player.inRun, false)
  r.wait(1)
  r.pos(SPAWN.x, PLAZA.maxZ + 5)
  assert.equal(r.player.z, PLAZA.maxZ, 'clamped to the yard')
  assert.equal(r.player.anim, 'walk')

  r.wait(0.5)
  r.pos(SPAWN.x, PLAZA.minZ)
  assert.equal(r.corrections().length, 1, 'faster than anyone can run')
  assert.deepEqual(r.corrections()[0].payload, { x: SPAWN.x, y: 0, z: PLAZA.maxZ })
  assert.equal(r.player.z, PLAZA.maxZ)

  r.wait(1)
  r.pos(SPAWN.x, PLAZA.maxZ - MAX_MOVE_SPEED, { y: 50, a: 'pull' })
  assert.equal(r.player.y, 6, 'jumps are capped')
  assert.equal(r.player.anim, 'idle', 'not an animation of this game')
  r.wait(1)
  r.pos(SPAWN.x, PLAZA.maxZ - MAX_MOVE_SPEED, { a: 'emote:0123456789abcdef01234567' })
  assert.equal(r.player.anim, 'emote:0123456789abcdef01234567')
  r.pos(Number.NaN, 0)
  assert.equal(r.player.z, PLAZA.maxZ - MAX_MOVE_SPEED, 'nonsense is ignored')
})

test('a run moves the player into its room: positions are then the room\'s, clamped to its walls', () => {
  const r = setup()
  r.intent('startRun', { chapter: 'workshop', diff: 0 })
  const layout = getLayout(0, 0)
  assert.equal(r.player.inRun, true)
  assert.equal(r.player.chapter, 'workshop')
  // The teleport landed through createMember's onTeleport: state and speed check both.
  assert.deepEqual([r.player.x, r.player.y, r.player.z], [layout.spawn.x, 0, layout.spawn.z])
  assert.deepEqual(r.member.lastPos, { x: layout.spawn.x, z: layout.spawn.z })
  assert.ok(Date.now() - r.member.lastPosAt < 1000)
  assert.ok(r.sent.some((m) => m.type === 'teleport'))

  // A stale lobby-coordinates report right after the jump is too far: snapped back.
  r.pos(SPAWN.x, SPAWN.z)
  assert.equal(r.corrections().length, 1)
  assert.deepEqual(r.corrections()[0].payload, { x: layout.spawn.x, y: 0, z: layout.spawn.z })

  r.wait(1)
  r.pos(layout.w, layout.spawn.z, { y: 2 })
  const edge = layout.w / 2 - ROOM_PLAYER_RADIUS
  assert.ok(near(r.player.x, edge), `x ${r.player.x} kept inside the room's wall (${edge}), not the yard's`)
  assert.equal(r.player.y, 2)
  r.wait(1)
  r.pos(edge, -layout.d)
  assert.ok(near(r.player.z, -(layout.d / 2 - ROOM_PLAYER_RADIUS)))

  r.intent('leaveRun', {})
  assert.equal(r.player.inRun, false)
  assert.equal(r.player.chapter, '')
  // Back at the lobby spawn, a little to one side (so a party doesn't land in a heap).
  assert.equal(r.player.z, SPAWN.z)
  assert.ok(Math.abs(r.player.x - SPAWN.x) <= 1.5)
  assert.deepEqual(r.member.lastPos, { x: r.player.x, z: SPAWN.z })
})

test('intents: only the session\'s own, whole difficulties, and a throwing handler never escapes', () => {
  const r = setup()
  const warn = console.warn
  const warnings = []
  console.warn = (...args) => warnings.push(args.join(' '))
  try {
    for (const type of ['__defineGetter__', 'constructor', 'toString', 'nope']) r.intent(type, {})
    assert.equal(r.member.session.inRun, false)

    r.member.session.profile.cleared.workshop = 1
    r.intent('startRun', { chapter: 'workshop', diff: 0.5 })
    assert.equal(r.member.session.inRun, false, 'no half difficulties')
    r.intent('startRun', { chapter: 'workshop', diff: 1 })
    assert.equal(r.member.session.profile.run.diff, 1)

    // An inherited key as an upgrade id is refused by the shared rules; nothing throws or changes.
    const cash = r.member.session.profile.run.cash
    assert.doesNotThrow(() => r.intent('upgrade', { stat: 'toString' }))
    assert.doesNotThrow(() => r.intent('buyPerk', { id: '__proto__' }))
    assert.doesNotThrow(() => r.intent('buyTool', null))
    assert.equal(r.member.session.profile.run.cash, cash)
  } finally {
    console.warn = warn
  }
})

test('the synced state shows screws, Crystals, skin and run', () => {
  const profile = createProfile('p1', 'P')
  Object.assign(profile, { crystals: 77, skin: 'ocean', skins: ['classic', 'ocean'] })
  profile.stats.screws = 1234
  const r = setup(profile)
  assert.deepEqual(
    { screws: r.player.screws, crystals: r.player.crystals, skin: r.player.skin, inRun: r.player.inRun, chapter: r.player.chapter },
    { screws: 1234, crystals: 77, skin: 'ocean', inRun: false, chapter: '' },
  )
  profile.stats.screws += 1
  r.room.syncPlayer('s1')
  assert.equal(r.player.screws, 1235)
})
