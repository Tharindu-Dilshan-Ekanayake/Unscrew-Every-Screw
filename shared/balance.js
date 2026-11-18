/**
 * Screwball Escape - every tunable number in the game, shared by the client (display,
 * prediction, offline play) and the server (the authority).
 *
 * The loop: pick a chapter in the lobby, get locked in its rooms and unscrew EVERY screw
 * to open the exit door. Screws go in your bag; sell the bag at the hopper for cash;
 * cash buys better tools and upgrades for this run. Three rooms make a chapter. Clearing
 * one pays Crystals, which buy permanent Perks and Skins back in the lobby.
 *
 * Two currencies:
 * - cash: belongs to a run. Every run starts from (almost) nothing.
 * - Crystals: permanent. From crystal screws, chapter clears, quests and daily rewards.
 *   (Not to be confused with Boxity Gems, the platform's paid currency: GEM_PRODUCTS.)
 */

export const GAME_ID = 'screwball-escape'
export const GAME_NAME = 'Screwball Escape'

// --- Rooms -----------------------------------------------------------------------------

/**
 * Every room is a box centred on the origin: floor at y = 0, x across [-w/2, w/2], z
 * across [-d/2, d/2], ceiling at h. The exit door is in the middle of the north wall
 * (-Z); you start by the south wall facing it. Screws sit in a grid `spacing` apart on
 * the floor and the four walls, on every face of the room's `pillars` (`[x, z, size]`:
 * square columns floor to ceiling) and, in rooms with a low `ceiling`, overhead too.
 *
 * `value` is the cash one plain screw sells for (before the chapter's scale).
 */
const room = (name, w, d, h, spacing, value, { pillars = [], ceiling = false } = {}) => ({ name, w, d, h, spacing, value, pillars, ceiling })

/** Screw head styles (drawn by the client): 'phillips' (+), 'slot' (-), 'hex', 'torx' (star). */
export const CHAPTERS = [
  {
    id: 'workshop',
    name: 'The Workshop',
    blurb: 'Dusty planks, sawdust and a sea of brass screws.',
    theme: 'workshop',
    head: 'phillips',
    /** Cash values and every price in a run scale by this. */
    scale: 1,
    /** Screws take this much longer to turn. */
    tough: 1,
    /** Crystals for clearing it on Normal (Hard and Impossible multiply this). */
    reward: 40,
    rooms: [
      room('Tool Shed', 8, 8, 3.2, 0.62, 1),
      room('Sawmill', 10, 9, 3.4, 0.62, 2, { pillars: [[0, -0.6, 0.8]] }),
      room('Storage Loft', 11, 11, 3.6, 0.62, 2, { pillars: [[-2, -1.4, 0.8], [2, -1.4, 0.8]] }),
      room('The Attic', 12, 11, 3.0, 0.62, 3, { ceiling: true }),
      room('Master Bench', 14, 13, 4.0, 0.62, 4, { pillars: [[-2.6, -2.2, 0.9], [2.6, -2.2, 0.9], [-2.6, 1.6, 0.9], [2.4, 1.2, 0.9]] }),
    ],
  },
  {
    id: 'boiler',
    name: 'Boiler Room',
    blurb: 'Hot pipes, rusty plates and stubborn hex bolts.',
    theme: 'boiler',
    head: 'hex',
    scale: 4,
    tough: 1.25,
    reward: 100,
    unlock: 'workshop',
    rooms: [
      room('Valve Hall', 10, 10, 3.6, 0.6, 1, { pillars: [[0, -0.8, 1.1]] }),
      room('Pump Room', 11, 11, 3.8, 0.6, 2, { pillars: [[-2.2, -1, 1], [2.2, -1, 1]] }),
      room('Steam Tunnel', 14, 8, 3.1, 0.6, 2, { ceiling: true }),
      room('The Furnace', 12, 12, 4.0, 0.6, 3, { pillars: [[-2.4, -2, 1], [2.4, -2, 1], [-2.4, 1.6, 1], [2.2, 1.2, 1]] }),
      room('Boiler Core', 14, 13, 3.3, 0.6, 4, { ceiling: true, pillars: [[-3, -1, 1.2], [3, -1, 1.2]] }),
    ],
  },
  {
    id: 'lab',
    name: 'The Lab',
    blurb: 'Spotless tiles, humming machines and Torx screws. No mercy.',
    theme: 'lab',
    head: 'torx',
    scale: 15,
    tough: 1.5,
    reward: 220,
    unlock: 'boiler',
    rooms: [
      room('Clean Room', 11, 11, 3.6, 0.58, 1),
      room('Test Chamber', 12, 12, 3.8, 0.58, 2, { pillars: [[0, -2.4, 0.9], [-2.6, 1, 0.9], [2.2, 0.8, 0.9]] }),
      room('Cryo Vault', 12, 10, 3.0, 0.58, 2, { ceiling: true }),
      room('Server Farm', 14, 14, 3.8, 0.58, 3, { pillars: [[-3.4, -2.6, 0.8], [0, -2.6, 0.8], [3.4, -2.6, 0.8], [-3.4, 1.6, 0.8], [0, 1.6, 0.8], [2.8, 1.2, 0.8]] }),
      room('The Reactor', 15, 14, 3.3, 0.58, 4, { ceiling: true, pillars: [[-3, -1.6, 1.1], [3, -1.6, 1.1], [0, 2.2, 1.1]] }),
    ],
  },
]

export const chapterById = (id) => CHAPTERS.find((c) => c.id === id) || null

export const DIFFICULTIES = [
  { id: 'normal', name: 'Normal', tough: 1, crystals: 1 },
  { id: 'hard', name: 'Hard', tough: 1.6, crystals: 2.5 },
  { id: 'impossible', name: 'Impossible', tough: 2.4, crystals: 5 },
]

/** Screw kinds: 0 plain, 1 gold (sells for GOLD_VALUE plain ones), 2 crystal (+Crystals). */
export const SCREW_PLAIN = 0
export const SCREW_GOLD = 1
export const SCREW_CRYSTAL = 2
export const GOLD_VALUE = 15
/** Chance per screw, before Keen Eye. */
export const GOLD_CHANCE = 1 / 70
export const CRYSTAL_CHANCE = 1 / 160
/** Crystals one crystal screw gives on Normal (difficulty and passes multiply it). */
export const CRYSTALS_PER_SCREW = 1

// --- Tools -------------------------------------------------------------------------------

/**
 * Tools, bought with run cash (prices x the chapter's scale). One action takes `time`
 * seconds of holding (before speed upgrades and the chapter/difficulty toughness) and
 * removes the screw you aim at plus every other within `radius` metres, up to `max`.
 */
export const TOOLS = [
  { id: 'driver', name: 'Screwdriver', price: 0, time: 0.7, radius: 0, max: 1, blurb: 'Trusty. Slow. One screw at a time.' },
  { id: 'drill', name: 'Power Drill', price: 60, time: 0.26, radius: 0, max: 1, blurb: 'Brrrrt. Three times faster.' },
  { id: 'ratchet', name: 'Turbo Ratchet', price: 380, time: 0.5, radius: 0.92, max: 9, blurb: 'Nine screws at once.' },
  { id: 'magnet', name: 'Mega Magnet', price: 1900, time: 0.62, radius: 1.65, max: 32, blurb: 'Rips out a whole patch.' },
]

export const toolById = (id) => TOOLS.find((t) => t.id === id) || null
export const toolIndex = (id) => TOOLS.findIndex((t) => t.id === id)

// --- Run upgrades --------------------------------------------------------------------------

/** Bag capacity at each Bag Size level (before Deep Pockets and the Big Bag pass). */
export const BAG_LEVELS = [20, 40, 70, 120, 200, 320, 500, 800]
/** Reach in metres at each Reach level. */
export const REACH_LEVELS = [5.5, 6.3, 7.1, 8, 9]
/** Hand speed: +this per level. */
export const SPEED_STEP = 0.16
export const SPEED_MAX = 10

/** Per-run upgrades (prices x the chapter's scale). */
export const UPGRADES = {
  speed: {
    name: 'Hand Speed',
    blurb: 'Unscrew faster',
    max: SPEED_MAX,
    cost: (level) => Math.round(12 * Math.pow(1.62, level)),
  },
  bag: {
    name: 'Bag Size',
    blurb: 'Carry more screws',
    max: BAG_LEVELS.length - 1,
    cost: (level) => [25, 70, 180, 450, 1100, 2600, 6000][level] ?? Infinity,
  },
  reach: {
    name: 'Reach',
    blurb: 'Grab screws from further away',
    max: REACH_LEVELS.length - 1,
    cost: (level) => [45, 140, 400, 1100][level] ?? Infinity,
  },
}
export const UPGRADE_IDS = Object.keys(UPGRADES)

/** Where you have to stand to sell: within this of the hopper's centre (on its plate). */
export const SELL_RADIUS = 1.5

// --- Perks (permanent, bought with Crystals in the lobby) -------------------------------------

export const PERKS = {
  cash: { name: 'Head Start', blurb: '+$15 starting cash per level (x chapter)', icon: 'cash', costs: [10, 25, 60, 150, 400], per: 15 },
  speed: { name: 'Quick Hands', blurb: '+6% unscrew speed per level', icon: 'speed', costs: [15, 40, 100, 250, 600], per: 0.06 },
  bag: { name: 'Deep Pockets', blurb: '+10% bag size per level', icon: 'bag', costs: [15, 40, 100, 250, 600], per: 0.1 },
  sell: { name: 'Haggler', blurb: '+10% cash when you sell per level', icon: 'sell', costs: [20, 50, 120, 300, 700], per: 0.1 },
  luck: { name: 'Keen Eye', blurb: '+25% gold & crystal screws per level', icon: 'luck', costs: [25, 60, 150, 350, 800], per: 0.25 },
  drone: { name: 'Helper Drone', blurb: 'A drone unscrews screws near you', icon: 'drone', costs: [60, 200, 600], per: 0 },
}
export const PERK_IDS = Object.keys(PERKS)

/** Screws per second the Helper Drone takes at each level (index 0 = no drone). */
export const DRONE_RATES = [0, 0.7, 1.4, 2.5]
/** The drone works on screws within this of you. */
export const DRONE_RADIUS = 3.2

// --- Skins ------------------------------------------------------------------------------

/** Tool colours: `grip` is the handle, `accent` the stripes and trim. */
export const SKINS = [
  { id: 'classic', name: 'Classic', price: 0, grip: '#ffcc22', accent: '#1d1f24' },
  { id: 'ocean', name: 'Ocean', price: 30, grip: '#2fa8ff', accent: '#f4f8ff' },
  { id: 'cherry', name: 'Cherry', price: 30, grip: '#ff3b55', accent: '#2a0d12' },
  { id: 'mint', name: 'Mint', price: 50, grip: '#5df0b0', accent: '#0f3b33' },
  { id: 'sunset', name: 'Sunset', price: 90, grip: '#ff8a2a', accent: '#5a1a6e' },
  { id: 'galaxy', name: 'Galaxy', price: 160, grip: '#8b5cff', accent: '#ff5cf0', glow: true },
  { id: 'gold', name: 'Solid Gold', price: 400, grip: '#ffd24a', accent: '#fff3b0', glow: true },
]
export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0]

// --- Boosts, ads and Boxity Gems ------------------------------------------------------------

/** The Speed Boost (a rewarded ad): x2 hand speed for this long. */
export const SPEED_BOOST_MS = 3 * 60 * 1000

/**
 * Rewarded ads (Boxity): watch one to earn this. Placement names are lowercase, digits
 * and hyphens. `cooldownMs` keeps a player from chaining them.
 */
export const AD_REWARDS = {
  'free-crystals': { label: '+15 Crystals', icon: 'crystal', grant: { crystals: 15 }, cooldownMs: 5 * 60 * 1000 },
  'speed-boost': { label: 'x2 Speed for 3 minutes', icon: 'speed', grant: { boost: 'speed' }, cooldownMs: 4 * 60 * 1000 },
}

/** Boxity Gems products. Unknown skus are refused (so Boxity refunds them). */
export const GEM_PRODUCTS = {
  crystals_small: { name: 'Crystal Pouch', blurb: '150 Crystals', icon: 'crystal', grant: { crystals: 150 } },
  crystals_big: { name: 'Crystal Crate', blurb: '1,000 Crystals', icon: 'crystal', grant: { crystals: 1000 } },
  cash_x2: { name: 'x2 Cash', blurb: 'Every sale pays double, forever', icon: 'cash', grant: { pass: 'cashX2' } },
  crystal_x2: { name: 'x2 Crystals', blurb: 'Double Crystals from crystal screws, forever', icon: 'crystal', grant: { pass: 'crystalX2' } },
  big_bag: { name: 'Big Bag', blurb: 'Double bag size in every run, forever', icon: 'bag', grant: { pass: 'bagX2' } },
  starter_drill: { name: 'Starter Drill', blurb: 'Start every run with the Power Drill', icon: 'drill', grant: { pass: 'starterDrill' } },
}

// --- Parties ---------------------------------------------------------------------------

/** Up to this many friends play one run together (the screws are shared; cash, bag and tools are each player's own). */
export const MAX_PARTY = 4
/** The difficulty a team pad's run plays on. */
export const TEAM_DIFF = 0
/** A party with seats left waits this long for friends before it starts anyway. */
export const PARTY_WAIT_MS = 30_000
/** Once full (or the host says go): this long to the start. */
export const PARTY_START_MS = 3_000

// --- Daily rewards & quests ------------------------------------------------------------------

export const DAY_MS = 24 * 60 * 60 * 1000
export const dayNumber = (now) => Math.floor(now / DAY_MS)

/** A 7-day calendar of Crystals: one claim per day, back to day 1 after day 7. */
export const DAILY_REWARDS = [5, 8, 12, 15, 20, 25, 60]

/**
 * Three quests a day (an easy, a medium and a hard one, all different kinds), picked per
 * player per day from a seeded random. `targets` per tier.
 */
export const QUEST_TYPES = {
  screws: { text: 'Unscrew {n} screws', targets: [150, 600, 2000] },
  sells: { text: 'Sell your bag {n} times', targets: [5, 15, 40] },
  rooms: { text: 'Escape {n} rooms', targets: [1, 3, 6] },
  gold: { text: 'Find {n} gold screws', targets: [3, 12, 35] },
  crystal: { text: 'Find {n} crystal screws', targets: [1, 4, 12] },
  upgrades: { text: 'Buy {n} upgrades', targets: [3, 10, 25] },
  minutes: { text: 'Play for {n} minutes', targets: [5, 15, 40] },
}
export const QUESTS_PER_DAY = 3
export const QUEST_REWARDS = [6, 15, 35]
/** All three done: a bonus. */
export const QUEST_BONUS = 30

// --- Tutorial & badges -----------------------------------------------------------------------

/**
 * The first run's objectives, shown top-centre. Each ends on its `event` (sent by the
 * rules as it happens).
 */
export const TUTORIAL = [
  { text: 'Unscrew screws! Hold click on one', event: 'screw', count: 10 },
  { text: 'Walk onto the SELL hopper', event: 'sell' },
  { text: 'Upgrade your Hand Speed!', event: 'upgrade' },
  { text: 'Buy the Power Drill!', event: 'tool' },
]

export const BADGES = {
  firstScrew: { name: 'First Twist' },
  firstSell: { name: 'Scrap Dealer' },
  firstTool: { name: 'Tooled Up' },
  firstRoom: { name: 'Out of the Box' },
  workshop: { name: 'Workshop Escapee' },
  boiler: { name: 'Steam Survivor' },
  lab: { name: 'Lab Rat No More' },
  crystal: { name: 'Shiny!' },
  thousand: { name: '1,000 Screws' },
  hundredK: { name: '100,000 Screws' },
}

/** Anti-cheat slack on the server: a screw this much past your reach still counts (lag). */
export const REACH_SLACK = 2.2
/** And unscrew rate allowance over what your tool can really do. */
export const RATE_SLACK = 1.4
