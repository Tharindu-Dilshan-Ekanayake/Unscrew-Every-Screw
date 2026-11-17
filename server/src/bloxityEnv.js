/**
 * Where Boxity lives, for this process. Every Boxity URL the server calls or allows is
 * built from here, never hard-coded, so one image runs against production or staging
 * just by what the platform injects:
 *
 * - BLOXITY_ENV             'prod', 'stage', ... (only a label here)
 * - BLOXITY_API_URL         the platform API (auth, leaderboards, ads)
 * - BLOXITY_MATCHMAKER_URL  the play host; game frontends live on <game>.<its host>
 * - BLOXITY_PORTAL_URL      the website
 * - BLOXITY_STATIC_URL      static files
 *
 * Boxity hosting injects every one of them. No URL is written down here: a variable
 * that is missing (a laptop) is null, and whatever needs it does without - joins are
 * guests, leaderboard reports and ad rewards are skipped. To try sign-in locally, set
 * BLOXITY_API_URL in the shell that starts the server (never in a file).
 */

const GAME_FALLBACK = '1-phone-drop'

/** 'https://x.io/' -> 'https://x.io', so paths can be appended with a single '/'. */
const trimUrl = (url) => String(url).replace(/\/+$/, '')

const hostOf = (url) => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

/**
 * Reads the Boxity settings from `env` (process.env by default; tests pass their own).
 *
 * `hosted` says whether this process runs on Boxity hosting: BLOXITY_ENV is injected
 * there, and a production build is treated the same. Off it (a laptop) the server
 * trusts the ids clients claim, so development works without a Boxity account.
 */
export function readBloxityEnv(env = process.env) {
  const pick = (name) => (env[name] ? trimUrl(env[name]) : null)
  const matchmakerUrl = pick('BLOXITY_MATCHMAKER_URL')
  return {
    env: env.BLOXITY_ENV || 'none',
    apiUrl: pick('BLOXITY_API_URL'),
    matchmakerUrl,
    portalUrl: pick('BLOXITY_PORTAL_URL'),
    staticUrl: pick('BLOXITY_STATIC_URL'),
    /** Host the game's frontends are served under (<game>.<playHost>), or ''. */
    playHost: matchmakerUrl ? hostOf(matchmakerUrl) : '',
    /** The slug the Boxity SDK and APIs know the game by. */
    gameSlug: env.BLOXITY_GAME_SLUG || env.BLOXITY_GAME_ID || GAME_FALLBACK,
    /** The hosted game's id (leaderboards, Legion). */
    gameId: env.BLOXITY_GAME_ID || GAME_FALLBACK,
    hosted: Boolean(env.BLOXITY_ENV) || env.NODE_ENV === 'production',
  }
}

/** This process's settings. */
export const bloxity = readBloxityEnv()

/** `bloxity.apiUrl` + `path` ('/v1/...'), or null when no API URL was injected. */
export const apiUrl = (path, settings = bloxity) => (settings.apiUrl ? `${settings.apiUrl}${path}` : null)
