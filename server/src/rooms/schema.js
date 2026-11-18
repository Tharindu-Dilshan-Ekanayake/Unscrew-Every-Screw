import { schema, t } from '@colyseus/schema'

/**
 * Synced state, kept deliberately small: only what other players need to draw you.
 * Everything private (the run's screws, cash, perks, quests...) goes to its owner alone
 * as 'profile' messages, never through the shared state.
 */
export const PlayerState = schema(
  {
    name: t.string(),
    /** Their verified Boxity account id ('' for guests), so chat can be matched to them. */
    uid: t.string(),
    /** Lobby coordinates, or (while `inRun`) the coordinates of their own run's room. */
    x: t.float32(),
    y: t.float32(),
    z: t.float32(),
    rotY: t.float32(),
    /** 'idle' | 'walk' | 'jump' | 'emote:<Boxity emote id>' */
    anim: t.string(),
    /** What their Bloxity avatar wears, as JSON `{ equipped, proportions }` ('' = base). */
    look: t.string(),
    /** Screws unscrewed, ever (profile.stats.screws). */
    screws: t.float64().default(0),
    /** Permanent Crystals (profile.crystals). */
    crystals: t.float64().default(0),
    /** Equipped tool skin id (balance SKINS). */
    skin: t.string().default('classic'),
    /** In a run's room right now (rooms are single-player: others hide them in the lobby). */
    inRun: t.boolean().default(false),
    /** The chapter id of the run they're in ('' in the lobby). */
    chapter: t.string().default(''),
    /** The run they're in ('' in the lobby): players see the others in theirs. */
    runId: t.string().default(''),
  },
  'PlayerState',
)

export const GameState = schema(
  {
    /** sessionId -> player */
    players: t.map(PlayerState),
    /** Short code for private lobbies ('' for public ones). */
    code: t.string(),
    isPrivate: t.boolean(),
  },
  'GameState',
)
