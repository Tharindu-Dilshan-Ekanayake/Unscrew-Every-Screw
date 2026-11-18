import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { createProfile } from '../../shared/logic.js'
import { PlayerSession } from '../../shared/session.js'
import { newGuestId, resolveIdentity, verifyAdReward } from '../src/bloxityApi.js'
import { readBloxityEnv } from '../src/bloxityEnv.js'
import { BLOXITY_LEADERBOARDS, changedScores, chunk, leaderboardScores, sendScores } from '../src/bloxityLeaderboards.js'
import {
  carryOverGuest,
  claimGemGrant,
  closeStorage,
  loadProfile,
  mongoUriFrom,
  openStorage,
  pendingGemGrants,
  recordGemGrant,
  releaseGemGrant,
  saveProfile,
  topPlayers,
} from '../src/db.js'
import { applyGemsFor, gemsWebhook, parseGemWebhook, profileIdOf, webhookSecretOk } from '../src/gems.js'
import { activePlayers } from '../src/registry.js'
import { issueSaveTicket, readSaveTicket, saveIdsFromTickets } from '../src/saveTickets.js'

/**
 * A stand-in for fetch: answers each call with `reply(url, init)` -> `{ status, body }`
 * (or throws, like a network failure), and remembers the calls.
 */
function fakeFetch(reply) {
  const calls = []
  const fn = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) })
    const { status = 200, body = {} } = await reply(url, init)
    return { status, json: async () => body }
  }
  fn.calls = calls
  return fn
}

const hosted = readBloxityEnv({ BLOXITY_ENV: 'stage', BLOXITY_API_URL: 'https://api.stage.example/', BLOXITY_GAME_ID: 'screwball' })
const local = readBloxityEnv({})

// --- Environment -----------------------------------------------------------------

test('Boxity URLs come only from the environment: none written down', () => {
  assert.equal(local.env, 'none')
  assert.equal(local.apiUrl, null)
  assert.equal(local.matchmakerUrl, null)
  assert.equal(local.portalUrl, null)
  assert.equal(local.staticUrl, null)
  assert.equal(local.playHost, '')
  assert.equal(local.gameSlug, '1-phone-drop')
  assert.equal(local.hosted, false)
  assert.equal(hosted.apiUrl, 'https://api.stage.example', 'trailing slash trimmed')
  assert.equal(hosted.gameSlug, 'screwball')
  assert.equal(hosted.hosted, true)
  assert.equal(readBloxityEnv({ BLOXITY_GAME_SLUG: 's', BLOXITY_GAME_ID: 'g' }).gameSlug, 's')
  assert.equal(readBloxityEnv({ NODE_ENV: 'production' }).hosted, true)
  assert.equal(readBloxityEnv({ BLOXITY_MATCHMAKER_URL: 'https://play.stage.example' }).playHost, 'play.stage.example')
  assert.equal(mongoUriFrom({ MONGO_URL: 'mongodb://m' }), 'mongodb://m', 'other spellings of the database URI')
  assert.equal(mongoUriFrom({ DATABASE_URL: 'postgres://p' }), '', 'only a mongodb:// DATABASE_URL')
})

// --- Identity --------------------------------------------------------------------

test('a valid token makes the Boxity account id the save key, whatever the client claims', async () => {
  const fetchImpl = fakeFetch(() => ({ body: { valid: true, user: { _id: 'acc1', username: 'Real' }, carriedFrom: ['g1'] } }))
  const id = await resolveIdentity({ playerId: 'someone-else', userId: 'x', token: 'tok', name: 'Fake' }, { fetchImpl, settings: hosted })
  assert.deepEqual(id, { playerId: 'acc1', verified: true, name: 'Real', carriedFrom: ['g1'], ticketed: [] })
  const [call] = fetchImpl.calls
  assert.equal(call.url, 'https://api.stage.example/v1/auth/game-token/verify')
  assert.equal(call.init.headers.Authorization, 'Bearer tok')
  assert.deepEqual(call.body, { gameSlug: 'screwball' })
})

test('guests get an id the server makes; a claimed id is never used', async () => {
  const fetchImpl = fakeFetch(() => assert.fail('no token, no call'))
  const opts = { fetchImpl, settings: hosted, makeGuestId: () => 'guest-new' }
  assert.deepEqual(await resolveIdentity({ playerId: 'acc1' }, opts), { playerId: 'guest-new', verified: false, carriedFrom: [], ticketed: [] })
  assert.equal((await resolveIdentity({ playerId: 'guest-abc', token: null }, opts)).playerId, 'guest-new')
  assert.equal((await resolveIdentity({}, opts)).playerId, 'guest-new')
  assert.match(newGuestId(), /^guest-[0-9a-f-]{36}$/)
})

test('a refused token, or Boxity down, leaves the player in the game as a guest', async () => {
  const refused = fakeFetch(() => ({ status: 401, body: { valid: false } }))
  const down = fakeFetch(() => {
    throw new Error('ECONNREFUSED')
  })
  const failing = fakeFetch(() => ({ status: 503, body: null }))
  for (const fetchImpl of [refused, down, failing]) {
    const id = await resolveIdentity({ playerId: 'acc1', token: 'tok' }, { fetchImpl, settings: hosted, makeGuestId: () => 'guest-new' })
    assert.deepEqual(id, { playerId: 'guest-new', verified: false, carriedFrom: [], ticketed: [] })
  }
  // No API URL injected (off Boxity hosting): nothing to verify with, so a guest.
  const none = fakeFetch(() => assert.fail('no API, no call'))
  assert.equal((await resolveIdentity({ token: 'tok' }, { fetchImpl: none, settings: local })).verified, false)
})

test('an ad pays only when Boxity says the token is valid', async () => {
  const yes = fakeFetch(() => ({ body: { valid: true } }))
  assert.equal(await verifyAdReward('r1', { fetchImpl: yes, settings: hosted }), true)
  assert.equal(yes.calls[0].url, 'https://api.stage.example/v1/ads/reward/verify')
  assert.deepEqual(yes.calls[0].body, { gameSlug: 'screwball', rewardToken: 'r1' })
  assert.equal(await verifyAdReward('r1', { fetchImpl: fakeFetch(() => ({ body: { valid: 'true' } })), settings: hosted }), false)
  const down = fakeFetch(() => {
    throw new Error('timeout')
  })
  assert.equal(await verifyAdReward('r1', { fetchImpl: down, settings: hosted }), false)
})

// --- Leaderboards ----------------------------------------------------------------

test('leaderboard scores are whole numbers from the profile', () => {
  const p = createProfile('a', 'A')
  Object.assign(p.stats, { screws: 1234.6, rooms: 7, chapters: 2, playtime: 3599 })
  assert.deepEqual(leaderboardScores(p), { screws: 1234, rooms: 7, chapters: 2, playtime: 59 })
  assert.deepEqual(leaderboardScores({ stats: { screws: -5, rooms: NaN } }), { screws: 0, rooms: 0, chapters: 0, playtime: 0 })
  assert.deepEqual(
    BLOXITY_LEADERBOARDS.map((b) => b.id),
    Object.keys(leaderboardScores(p)),
  )
  assert.deepEqual(
    BLOXITY_LEADERBOARDS.map((b) => [b.id, b.label, b.format]),
    [
      ['screws', 'Screws Unscrewed', 'compact'],
      ['rooms', 'Rooms Escaped', 'number'],
      ['chapters', 'Chapters Cleared', 'number'],
      ['playtime', 'Minutes Played', 'number'],
    ],
  )
  for (const b of BLOXITY_LEADERBOARDS) assert.deepEqual([b.order, b.mode, b.reset], ['desc', 'best', 'none'])
})

test('only changed scores are reported, as legion_<id>', () => {
  const p = createProfile('a', 'A')
  p.stats.rooms = 2
  const lastSent = new Map([
    ['legion_a|screws', 0],
    ['legion_a|rooms', 2],
    ['legion_a|chapters', 0],
  ])
  assert.deepEqual(changedScores([{ id: 'a', profile: p }], lastSent), [{ board: 'playtime', userId: 'legion_a', score: 0 }])
  assert.deepEqual(
    chunk([1, 2, 3, 4, 5], 2),
    [[1, 2], [3, 4], [5]],
  )
})

test('reports go in batches of 200; failed batches are retried later', async () => {
  const scores = Array.from({ length: 450 }, (_, i) => ({ board: 'screws', userId: `legion_${i}`, score: i }))
  let n = 0
  const fetchImpl = fakeFetch(() => {
    n += 1
    return n === 2 ? { status: 500 } : { body: { accepted: 1, dropped: { screws: 0 } } }
  })
  const lastSent = new Map()
  await sendScores(scores, lastSent, { token: 'rt', settings: hosted, fetchImpl })
  assert.deepEqual(
    fetchImpl.calls.map((c) => c.body.scores.length),
    [200, 200, 50],
  )
  assert.equal(fetchImpl.calls[0].url, 'https://api.stage.example/v1/leaderboards/hosted/screwball/report')
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, 'Bearer rt')
  assert.deepEqual(fetchImpl.calls[0].body.boards, BLOXITY_LEADERBOARDS)
  assert.equal(lastSent.size, 250, 'the failed batch is not marked as sent')
  assert.equal(lastSent.has('legion_250|screws'), false)
})

// --- Gems webhook ----------------------------------------------------------------

test('the webhook secret must match exactly when one is set', () => {
  assert.equal(webhookSecretOk(undefined, ''), true)
  assert.equal(webhookSecretOk('s3cret', 's3cret'), true)
  assert.equal(webhookSecretOk('s3cre', 's3cret'), false)
  assert.equal(webhookSecretOk(undefined, 's3cret'), false)
})

test('webhook bodies are checked: known sku, ids, legion_ prefix stripped', () => {
  const ok = parseGemWebhook({ transactionId: 't1', userId: 'legion_acc1', sku: 'crystals_small', productPrice: 50 })
  assert.equal(ok.ok, true)
  assert.equal(ok.grant.userId, 'acc1')
  assert.equal(profileIdOf('acc2'), 'acc2')
  assert.equal(parseGemWebhook({ transactionId: 't1', userId: 'acc1', sku: 'nope' }).status, 400)
  assert.equal(parseGemWebhook({ userId: 'acc1', sku: 'crystals_small' }).status, 400)
  assert.equal(parseGemWebhook({ transactionId: 't1', userId: 'acc1', sku: 'toString' }).status, 400, 'never an inherited key')
  assert.equal(parseGemWebhook(null).ok, false)
})

// --- Database (SQLite in memory) -------------------------------------------------

before(() => openStorage({ path: ':memory:' }))
after(() => closeStorage())

test('a Gems grant is recorded once and claimed once', async () => {
  const grant = { transactionId: 'txn-1', userId: 'acc1', sku: 'crystals_small' }
  assert.equal(await recordGemGrant(grant), true)
  assert.equal(await recordGemGrant(grant), false, 'a repeated webhook is a no-op')
  assert.deepEqual(await pendingGemGrants(['acc1', 'other']), [grant])
  assert.equal(await claimGemGrant('txn-1', 'pod-a'), true)
  assert.equal(await claimGemGrant('txn-1', 'pod-b'), false)
  assert.deepEqual(await pendingGemGrants(['acc1']), [])
  await releaseGemGrant('txn-1', 'pod-b')
  assert.deepEqual(await pendingGemGrants(['acc1']), [], 'only the claimer can release')
  await releaseGemGrant('txn-1', 'pod-a')
  assert.equal(await claimGemGrant('txn-1', 'pod-b'), true)
})

test('the webhook route records grants and answers fast', async () => {
  const call = async (body, secret) => {
    const res = { code: 200, status(c) { this.code = c; return this }, json(b) { this.body = b; return this } }
    await gemsWebhook({ body, get: () => secret }, res)
    return res.code
  }
  process.env.LEGION_WEBHOOK_SECRET = 'hook'
  try {
    const body = { transactionId: 'txn-w', userId: 'legion_acc9', sku: 'crystals_big' }
    assert.equal(await call(body, 'wrong'), 401)
    assert.equal(await call(body, 'hook'), 200)
    assert.equal(await call(body, 'hook'), 200, 'duplicates are fine')
    assert.equal(await call({ ...body, transactionId: 'txn-x', sku: 'nope' }, 'hook'), 400)
    assert.deepEqual(await pendingGemGrants(['acc9']), [{ transactionId: 'txn-w', userId: 'acc9', sku: 'crystals_big' }])
  } finally {
    delete process.env.LEGION_WEBHOOK_SECRET
  }
})

test('a pod applies grants to the verified players it holds, exactly once', async () => {
  const profile = createProfile('acc5', 'Five')
  const session = new PlayerSession(profile, { now: 0, emit: () => {}, getPosition: () => ({ x: 0, z: 0 }) })
  const member = { session, playerId: 'acc5', verified: true, owner: 'test' }
  const room = { members: new Map([['s5', member]]), syncPlayer: () => {} }
  activePlayers.set('acc5', { room, client: { sessionId: 's5' } })
  try {
    await recordGemGrant({ transactionId: 'txn-5', userId: 'acc5', sku: 'crystals_small' })
    await recordGemGrant({ transactionId: 'txn-6', userId: 'acc5', sku: 'big_bag' })
    await Promise.all([applyGemsFor(['acc5']), applyGemsFor(['acc5'])])
    assert.equal(profile.crystals, 150, 'applied once, not twice by two pollers')
    assert.equal(profile.passes.bagX2, true)
    const saved = await loadProfile('acc5', 'Five', 'test')
    assert.equal(saved.crystals, 150, 'saved')
    assert.equal(saved.passes.bagX2, true)
    assert.deepEqual(await pendingGemGrants(['acc5']), [])
  } finally {
    activePlayers.delete('acc5')
  }
})

test('guest progress carries into a new account once', async () => {
  const guest = createProfile('guest-g1', 'Guesty')
  guest.stats.screws = 777
  guest.stats.rooms = 2
  guest.crystals = 40
  await saveProfile(guest, 'x')
  assert.equal(await carryOverGuest('acc7', ['nope', 'g1'], 'Seven'), 'guest-g1', 'found under its guest- spelling')
  const carried = await loadProfile('acc7', 'Seven', 'x')
  assert.equal(carried.id, 'acc7')
  assert.equal(carried.name, 'Seven')
  assert.equal(carried.stats.screws, 777)
  assert.equal(carried.stats.rooms, 2)
  assert.equal(carried.crystals, 40)
  assert.equal(await carryOverGuest('acc8', ['guest-g1'], 'Eight'), null, 'never copied twice')
  assert.equal(await carryOverGuest('acc7', ['guest-g1'], 'Seven'), null)
  const boards = await topPlayers(10)
  assert.equal(boards.rooms.filter((r) => r.value === 2).length, 1, 'the used guest save is off the boards')

  // An account that already has progress keeps it.
  const other = createProfile('guest-g2', 'G2')
  other.stats.screws = 5
  await saveProfile(other, 'x')
  assert.equal(await carryOverGuest('acc7', ['guest-g2'], 'Seven'), null)
  assert.equal(await carryOverGuest('acc10', ['guest-g2'], 'Ten'), 'guest-g2', 'still unused, so still available')
})

test('the in-game boards: screws, rooms, chapters and playtime, best first', async () => {
  const a = createProfile('board-a', 'Ada')
  Object.assign(a.stats, { screws: 50000, rooms: 30, chapters: 9, playtime: 7200 })
  const b = createProfile('board-b', 'Bo')
  Object.assign(b.stats, { screws: 40000, rooms: 40, chapters: 8, playtime: 9000 })
  await saveProfile(a, 'x')
  await saveProfile(b, 'x')
  const boards = await topPlayers(2)
  assert.deepEqual(Object.keys(boards), ['screws', 'rooms', 'chapters', 'playtime'])
  assert.deepEqual(boards.screws, [{ name: 'Ada', value: 50000 }, { name: 'Bo', value: 40000 }])
  assert.deepEqual(boards.rooms, [{ name: 'Bo', value: 40 }, { name: 'Ada', value: 30 }])
  assert.deepEqual(boards.chapters, [{ name: 'Ada', value: 9 }, { name: 'Bo', value: 8 }])
  assert.deepEqual(boards.playtime, [{ name: 'Bo', value: 9000 }, { name: 'Ada', value: 7200 }])
})

// --- Save tickets and the Open Rooms reporter ----------------------------------------

test('save tickets: a guest gets back into the save the server made for them', async () => {
  const ticket = issueSaveTicket('guest-t1')
  assert.ok(ticket, 'the secret comes from the database')
  assert.equal(readSaveTicket(ticket), 'guest-t1')
  const [head, sig] = ticket.split('.')
  assert.equal(readSaveTicket(`${Buffer.from('guest-t2').toString('base64url')}.${sig}`), null, 'another id, same signature')
  assert.equal(readSaveTicket(`${head}.${sig.slice(0, -2)}xx`), null, 'tampered signature')
  assert.equal(readSaveTicket(issueSaveTicket('acc1')), null, 'never an account id')
  assert.equal(readSaveTicket('junk'), null)
  assert.deepEqual(saveIdsFromTickets([ticket, 'junk', ticket, issueSaveTicket('guest-t3')]), ['guest-t1', 'guest-t3'])

  const fetchImpl = fakeFetch(() => assert.fail('no token, no call'))
  const back = await resolveIdentity({ playerId: 'acc1', tickets: [ticket] }, { fetchImpl, settings: hosted })
  assert.deepEqual(back, { playerId: 'guest-t1', verified: false, carriedFrom: [], ticketed: ['guest-t1'] })
})

test('a ticketed guest save carries into an account that has none yet', async () => {
  const guest = createProfile('guest-t4', 'Guesty')
  guest.stats.screws = 777
  await saveProfile(guest, 'test')
  const ticket = issueSaveTicket('guest-t4')
  const fetchImpl = fakeFetch(() => ({ body: { valid: true, user: { _id: 'acc11', username: 'Eleven' } } }))
  const id = await resolveIdentity({ token: 'tok', tickets: [ticket] }, { fetchImpl, settings: hosted })
  assert.deepEqual(id.ticketed, ['guest-t4'])
  assert.equal(await carryOverGuest(id.playerId, id.ticketed, 'Eleven'), 'guest-t4')
  assert.equal((await loadProfile('acc11', 'Eleven', 'test')).stats.screws, 777)
})

test('the room reporter posts this pod\'s rooms to Boxity, and only when configured', async () => {
  const { installRoomReporter } = await import('../src/legionRoomReporter.js')
  const realFetch = globalThis.fetch
  const saved = { ...process.env }
  const calls = []
  const query = async () => [
    { roomId: 'abc', name: 'game', clients: 3, maxClients: 8, locked: false, private: false, metadata: { players: 3 } },
    { roomId: 'XYZ12', name: 'game', clients: 1, maxClients: 8, locked: false, private: true, metadata: {} },
  ]
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init })
    return { ok: true }
  }
  try {
    delete process.env.MATCHMAKER_REPORT_URL
    installRoomReporter({ query })()
    await new Promise((r) => setTimeout(r, 10))
    assert.equal(calls.length, 0, 'nothing without the platform variables')

    Object.assign(process.env, { MATCHMAKER_REPORT_URL: 'https://mm.test/report/', BLOXITY_REPORT_TOKEN: 'tok', BLOXITY_GAME_ID: 'screwball', POD_NAME: 'pod-1' })
    const stop = installRoomReporter({ intervalMs: 60000, query })
    await new Promise((r) => setTimeout(r, 10))
    stop()
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://mm.test/report/screwball/rooms')
    assert.equal(calls[0].init.headers.authorization, 'Bearer tok')
    const body = JSON.parse(calls[0].init.body)
    assert.equal(body.podName, 'pod-1')
    assert.equal(body.players, 4)
    assert.deepEqual(body.rooms[0], { colyseusRoomId: 'abc', name: 'game', clients: 3, maxClients: 8, locked: false, private: false, started: false, metadata: { players: 3 } })
    assert.equal(body.rooms[1].private, true)
  } finally {
    globalThis.fetch = realFetch
    process.env = saved
  }
})
