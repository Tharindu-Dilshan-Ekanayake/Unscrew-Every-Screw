import { saveProfile, topPlayers } from './db.js'
import { activePlayers, broadcastAll } from './registry.js'

const REFRESH_MS = 60_000
let cached = { screws: [], rooms: [], chapters: [], playtime: [], updatedAt: 0 }

/**
 * Latest top-10 boards for the lobby: Screws Unscrewed, Rooms Escaped, Chapters Cleared
 * and Playtime (seconds), each `[{ name, value }]` (db.js topPlayers).
 */
export function getLeaderboards() {
  return cached
}

async function refresh() {
  try {
    // Fold in progress from people still playing here, so the boards aren't a save
    // behind. Other pods do the same for theirs.
    await Promise.all(
      [...activePlayers.values()].map(({ room, client }) => {
        const member = room.members.get(client.sessionId)
        return member ? saveProfile(member.session.profile, member.owner) : null
      }),
    )
    cached = { ...(await topPlayers(10)), updatedAt: Date.now() }
    broadcastAll('leaderboards', cached)
  } catch (err) {
    console.error('[leaderboards] refresh failed', err)
  }
}

export function startLeaderboards() {
  refresh()
  const id = setInterval(refresh, REFRESH_MS)
  return () => clearInterval(id)
}
