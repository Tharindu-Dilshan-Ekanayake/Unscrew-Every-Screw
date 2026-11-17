/**
 * Every tunable number in the game. Rules live in logic.js; this file is only data,
 * so balancing never means touching code. `scripts/balance-sim.mjs` plays the game
 * with these numbers and prints the pacing (time to each rebirth, arm and stage).
 *
 * Shared by client (display) and server (authority): both always agree on costs and
 * multipliers because they read the same table.
 *
 * The loop (Phone Plunge): practise throwing on the throw pads for SKILL -> walk to the DROP ZONE at the
 * cliff edge, charge the throw meter and fling your phone off the edge -> it falls through
 * the clouds onto the hotel far below, smashes its glass roof and then floor after floor
 * (more Skill smashes deeper, and every metre pays) -> Wins -> newer phones, eggs and
 * throw pads -> rebirth at max level for a bigger Skill multiplier and a higher cap ->
 * smash deeper still.
 *
 * Inside the code the template's names stay (so saves and the server never change):
 * `health` is SKILL, a `tire` is a PHONE, a `pad` is a throw pad, a `roll` is a drop and a
 * `zone` is one floor of the hotel. Only what players see was renamed. How each phone
 * looks is client/src/game/phoneStyles.js.
 */

// --- Health and levels --------------------------------------------------------------

/**
 * Skill comes from throwing your phone - a click, a tap, THROW, or standing on a throw
 * pad, which throws by itself every TRAIN_INTERVAL - and nothing else (not walking): one
 * throw, one gain, more on a throw pad (PADS mult). The server takes at most one throw
 * every TOSS_COOLDOWN seconds; the client's throw (game/practice.js TOSS_TIME) takes a
 * little longer, so honest clicking never hits the limit.
 */
export const TOSS_COOLDOWN = 0.35
/**
 * Seconds between the throws a throw pad makes by itself while you stand on it; also the
 * pace of the Skill earned while you were away (logic.applyOfflineProgress).
 */
export const TRAIN_INTERVAL = 0.6

/**
 * Your level comes from your Health: reaching level L takes healthForLevel(L) Health.
 * Each level needs LEVEL_GROWTH_EARLY times the last at first, easing towards
 * LEVEL_GROWTH_LATE: early rebirths multiply your gains many times over (a new bar,
 * x2 from the rebirth itself, the next phone), later ones much less, and the levels
 * keep step so every rebirth takes a little longer than the one before.
 */
export const LEVEL_BASE = 20
export const LEVEL_GROWTH_EARLY = 1.3
export const LEVEL_GROWTH_LATE = 1.097
export const LEVEL_GROWTH_FADE = 100
/** Levels past this are not reachable: the table stops here. */
export const MAX_LEVEL = 1200

const LEVEL_TABLE = (() => {
  const table = new Float64Array(MAX_LEVEL + 1)
  let need = LEVEL_BASE
  for (let level = 2; level <= MAX_LEVEL; level += 1) {
    table[level] = table[level - 1] + need
    const growth = LEVEL_GROWTH_LATE + (LEVEL_GROWTH_EARLY - LEVEL_GROWTH_LATE) * Math.exp(-level / LEVEL_GROWTH_FADE)
    need *= growth
  }
  return table
})()

/** Two significant figures: level thresholds read cleanly (2,300, not 2,317). */
const round2 = (n) => {
  if (n < 100) return Math.round(n)
  const step = 10 ** (Math.floor(Math.log10(n)) - 1)
  return Math.round(n / step) * step
}

export const healthForLevel = (level) => (level <= 1 ? 0 : round2(LEVEL_TABLE[Math.min(MAX_LEVEL, level)]))

// --- Rebirth ----------------------------------------------------------------------

/** Max level by rebirth count: R0 = 15, R1 = 23, then +8 per rebirth. */
export const levelCap = (rebirths) => Math.min(MAX_LEVEL, 15 + 8 * Math.max(0, rebirths))

/** Health multiplier from rebirths, as in the reference: R0 = x1, R1 = x2, R2 = x3 ... */
export const rebirthMultiplier = (rebirths) => 1 + Math.max(0, rebirths)

/**
 * From Rebirth 15, every 5th rebirth (15, 20, 25...) comes with a gift of eggs: late in
 * the game, when each rebirth takes longest, there's always one coming up. One more egg
 * every 10 rebirths, up to 6.
 */
export const REBIRTH_GIFT_FROM = 15
export const REBIRTH_GIFT_EVERY = 5
export function rebirthGift(rebirths) {
  if (rebirths < REBIRTH_GIFT_FROM || (rebirths - REBIRTH_GIFT_FROM) % REBIRTH_GIFT_EVERY !== 0) return null
  const amount = Math.min(6, 3 + Math.floor((rebirths - REBIRTH_GIFT_FROM) / 10))
  return { rebirths, item: 'eggVolcano', amount, label: `${amount} Volcano Eggs` }
}
/** The next rebirth after `rebirths` that brings a gift, and the gift. */
export function nextRebirthGift(rebirths) {
  const from = Math.max(REBIRTH_GIFT_FROM, rebirths + 1)
  const at = from + ((REBIRTH_GIFT_EVERY - ((from - REBIRTH_GIFT_FROM) % REBIRTH_GIFT_EVERY)) % REBIRTH_GIFT_EVERY)
  return rebirthGift(at)
}

/** Skipping straight to a rebirth costs this many max-level drops' worth of Wins. */
export const REBIRTH_SKIP_ROLLS = 10

// --- Training pads (throw pads) --------------------------------------------------

/**
 * Throw pads, south to north in world.js order. Standing on one you practise throwing
 * your phone down its lane at a target: a throw (a rep, and a Skill gain) every
 * TRAIN_INTERVAL. `rebirths` = rebirths needed; `product` = the SHOP
 * pass that unlocks it instead; `world` = the only world it works in (the beach
 * pads at the north end of the row work in Palm Beach only, and stand locked in
 * World 1 as a teaser).
 */
export const PADS = [
  { id: 'starter', name: 'Basic Throw Pad', mult: 1, rebirths: 0 },
  { id: 'speed', name: 'Bouncy Throw Pad', mult: 2, rebirths: 1 },
  { id: 'turbo', name: 'Turbo Throw Pad', mult: 4, rebirths: 2 },
  { id: 'nitro', name: 'Steel Throw Pad', mult: 10, rebirths: 4 },
  { id: 'rocket', name: 'Rocket Throw Pad', mult: 20, rebirths: 6 },
  { id: 'diamond', name: 'Crystal Throw Pad', mult: 40, product: 'padVeryOp', tag: 'VERY OP!' },
  { id: 'galaxy', name: 'Galaxy Throw Pad', mult: 100, product: 'padBest', tag: 'BEST OVERALL!' },
  // Kept close to the Galaxy Throw Pad: every Skill multiplier here speeds up the whole
  // late game (scripts/balance-sim.mjs) - the beach pads are milestones, not a jump.
  { id: 'surf', name: 'Surf Throw Pad', mult: 115, rebirths: 10, world: 1 },
  { id: 'tsunami', name: 'Tsunami Throw Pad', mult: 130, rebirths: 16, world: 1 },
]

// --- Phones (the template's tires) -------------------------------------------------

/**
 * The phone you drop. `power` is the Skill every single gain is worth before multipliers
 * (the "+1" of the Button Phone); `cost` is in Wins; `rarity` (RARITIES) is shown on its
 * stand. Bought in order at the phone shop, they run through the history of the mobile
 * phone: an old button phone, a flip phone, a slider and a keyboard phone, the first
 * touch phones with their home buttons, then the notch, then the island - all the way up
 * to the 18 Pro Max. (No brand names: a published game must not use a real company's
 * trademarks.) About x2.6 power for x2.8-x3.3 the Wins each. The ids are the template's
 * (saves and the server key on them). How each one looks: client/src/game/phoneStyles.js.
 */
export const TIRES = [
  { id: 'bicycle', name: 'Button Phone', power: 1, cost: 0, rarity: 'common' },
  // Cheap enough to buy with the Wins from your very first drop.
  { id: 'mountain', name: 'Flip Phone', power: 3, cost: 1, rarity: 'common' },
  { id: 'wood', name: 'Slider Phone', power: 5, cost: 15, rarity: 'common' },
  { id: 'stone', name: 'Keyboard Phone', power: 12, cost: 75, rarity: 'uncommon' },
  { id: 'cookie', name: 'Touch Phone', power: 30, cost: 300, rarity: 'uncommon' },
  { id: 'pizza', name: 'Phone 3G', power: 75, cost: 1200, rarity: 'rare' },
  { id: 'donut', name: 'Phone 4', power: 200, cost: 4500, rarity: 'rare' },
  { id: 'watermelon', name: 'Phone 5', power: 500, cost: 16000, rarity: 'rare' },
  { id: 'monster', name: 'Phone 6 Plus', power: 1250, cost: 55000, rarity: 'epic' },
  { id: 'mint', name: 'Phone 7', power: 3500, cost: 180000, rarity: 'epic' },
  { id: 'silver', name: 'Phone 8', power: 9000, cost: 600000, rarity: 'epic' },
  { id: 'ice', name: 'Phone X', power: 23000, cost: 2e6, rarity: 'epic' },
  { id: 'gold', name: 'Phone XS Max', power: 60000, cost: 6e6, rarity: 'legendary' },
  { id: 'lava', name: 'Phone 11 Pro', power: 155000, cost: 17e6, rarity: 'legendary' },
  { id: 'platinum', name: 'Phone 12 Pro', power: 400000, cost: 48e6, rarity: 'legendary' },
  { id: 'emerald', name: 'Phone 13 Pro Max', power: 1.05e6, cost: 135e6, rarity: 'legendary' },
  { id: 'ruby', name: 'Phone 14 Pro', power: 2.7e6, cost: 380e6, rarity: 'mythic' },
  { id: 'diamond', name: 'Phone 15 Pro Max', power: 7e6, cost: 1.05e9, rarity: 'mythic' },
  { id: 'rainbow', name: 'Phone 16 Pro', power: 1.8e7, cost: 3e9, rarity: 'mythic' },
  { id: 'unicorn', name: 'Phone 16 Pro Max', power: 4.8e7, cost: 8.5e9, rarity: 'mythic' },
  { id: 'galaxy', name: 'Phone 17 Pro', power: 1.25e8, cost: 2.4e10, rarity: 'secret' },
  { id: 'dragon', name: 'Phone 17 Pro Max', power: 3.3e8, cost: 6.8e10, rarity: 'secret' },
  { id: 'cosmic', name: 'Phone 18 Pro', power: 8.6e8, cost: 1.9e11, rarity: 'secret' },
  { id: 'infinity', name: 'Phone 18 Pro Max', power: 2.2e9, cost: 5.4e11, rarity: 'secret' },
]

// --- Dropping (the template's rolls) -----------------------------------------------

/**
 * Depths are metres below the edge you throw from. The hotel's glass roof is DROP_ROOF
 * metres down: every drop falls that far through the clouds first, smashes the glass and
 * lands somewhere inside. Floor `i` of the hotel (FLOORS / ZONES) starts at `start`
 * metres; the glass roof is the top of floor 0.
 */
export const DROP_ROOF = 300

/**
 * How deep a drop goes (in metres): 0 Skill still smashes ROLL_BASE metres (through the
 * roof into the first floor), and each floor is reached with the Skill in its `wall`,
 * less WALL_MARGIN; in between, depth follows Skill (in log terms) from one floor's top
 * to the next. So the floors' `wall` Skill sets the pace. See logic.rollReach.
 */
export const ROLL_BASE = DROP_ROOF + 60
export const ROLL_H0 = 50
/** A floor's `wall` is this many times the Skill that just reaches its top. */
export const WALL_MARGIN = 1.3

/** Room themes (client/src/game/roll/roomThemes.js builds each one's furniture). */
export const ROOM_THEMES = ['pool', 'lounge', 'bedroom', 'bathroom', 'kitchen', 'dining', 'library', 'gym', 'arcade', 'cinema', 'spa', 'ballroom', 'office', 'music', 'kids', 'garden', 'laundry', 'aquarium', 'art', 'vault']

/**
 * The hotel's sixty floors, top to bottom: [id, name, room theme, top (metres below the
 * roof), wall, winsPerMeter, smash, discover]. Each floor is a stretch of depth a little
 * longer than the one above (100 m, 106 m, 112 m ... about 450 m). The first twenty are
 * the hotel proper, the next twenty its deluxe floors, the last twenty its secret
 * basement levels. `wall` = the Skill that paces how deep a drop smashes (see
 * ROLL_BASE); each about twice the last. `winsPerMeter` pays for every metre smashed
 * through on the floor - the deeper, the more each metre pays - and `discover` is a
 * one-off prize the first time you ever reach the floor. `smash` is left over from the
 * template and no longer paid. Numbers from scripts/gen-stages.py.
 */
const FLOOR_TABLE = [
  ['sunroom-pool', 'Sunroom Pool', 'pool', 0, 0, 0.006, 0, 0],
  ['sky-lounge', 'Sky Lounge', 'lounge', 100, 11, 0.0072, 2, 5],
  ['starlight-suite', 'Starlight Suite', 'bedroom', 200, 21, 0.00984, 3, 7],
  ['marble-bathroom', 'Marble Bathroom', 'bathroom', 306, 41, 0.0135, 4, 9],
  ['chef-kitchen', 'Chef Kitchen', 'kitchen', 418, 79, 0.0185, 5, 13],
  ['grand-dining-hall', 'Grand Dining Hall', 'dining', 536, 150, 0.0255, 7, 18],
  ['quiet-library', 'Quiet Library', 'library', 660, 300, 0.0351, 10, 24],
  ['fitness-club', 'Fitness Club', 'gym', 790, 590, 0.0486, 13, 34],
  ['pixel-arcade', 'Pixel Arcade', 'arcade', 926, 1200, 0.0673, 19, 47],
  ['movie-theater', 'Movie Theater', 'cinema', 1068, 2300, 0.0934, 26, 65],
  ['lotus-spa', 'Lotus Spa', 'spa', 1216, 4600, 0.13, 36, 90],
  ['crystal-ballroom', 'Crystal Ballroom', 'ballroom', 1370, 9200, 0.181, 50, 130],
  ['board-room', 'Board Room', 'office', 1530, 18000, 0.253, 70, 180],
  ['music-studio', 'Music Studio', 'music', 1696, 37000, 0.355, 99, 250],
  ['kids-club', 'Kids Club', 'kids', 1868, 75000, 0.498, 140, 350],
  ['indoor-garden', 'Indoor Garden', 'garden', 2046, 150000, 0.7, 190, 490],
  ['laundry-room', 'Laundry Room', 'laundry', 2230, 310000, 0.987, 270, 690],
  ['shark-aquarium', 'Shark Aquarium', 'aquarium', 2420, 640000, 1.39, 390, 970],
  ['art-gallery', 'Art Gallery', 'art', 2616, 1.3e6, 1.97, 550, 1400],
  ['hotel-vault', 'Hotel Vault', 'vault', 2818, 2.7e6, 2.8, 780, 1900],
  ['lagoon-pool', 'Lagoon Pool', 'pool', 3026, 5.7e6, 3.98, 1100, 2800],
  ['velvet-lounge', 'Velvet Lounge', 'lounge', 3240, 1.2e7, 5.66, 1600, 3900],
  ['honeymoon-suite', 'Honeymoon Suite', 'bedroom', 3460, 2.5e7, 8.08, 2200, 5600],
  ['golden-bathroom', 'Golden Bathroom', 'bathroom', 3686, 5.3e7, 11.6, 3200, 8000],
  ['pastry-kitchen', 'Pastry Kitchen', 'kitchen', 3918, 1.1e8, 16.6, 4600, 12000],
  ['banquet-hall', 'Banquet Hall', 'dining', 4156, 2.4e8, 23.8, 6600, 17000],
  ['ancient-archive', 'Ancient Archive', 'library', 4400, 5.1e8, 34.2, 9500, 24000],
  ['boxing-gym', 'Boxing Gym', 'gym', 4650, 1.1e9, 49.3, 14000, 34000],
  ['retro-arcade', 'Retro Arcade', 'arcade', 4906, 2.3e9, 71.3, 20000, 50000],
  ['giant-screen-theater', 'Giant Screen Theater', 'cinema', 5168, 5e9, 103, 29000, 72000],
  ['hot-spring-spa', 'Hot Spring Spa', 'spa', 5436, 1.1e10, 150, 42000, 100000],
  ['disco-ballroom', 'Disco Ballroom', 'ballroom', 5710, 2.4e10, 218, 60000, 150000],
  ['tech-lab', 'Tech Lab', 'office', 5990, 5.2e10, 317, 88000, 220000],
  ['rock-stage', 'Rock Stage', 'music', 6276, 1.1e11, 462, 130000, 320000],
  ['toy-room', 'Toy Room', 'kids', 6568, 2.5e11, 676, 190000, 470000],
  ['jungle-atrium', 'Jungle Atrium', 'garden', 6866, 5.6e11, 990, 270000, 690000],
  ['steam-laundry', 'Steam Laundry', 'laundry', 7170, 1.2e12, 1450, 400000, 1e6],
  ['jellyfish-tank', 'Jellyfish Tank', 'aquarium', 7480, 2.8e12, 2140, 590000, 1.5e6],
  ['sculpture-hall', 'Sculpture Hall', 'art', 7796, 6.2e12, 3150, 870000, 2.2e6],
  ['diamond-vault', 'Diamond Vault', 'vault', 8118, 1.4e13, 4650, 1.3e6, 3.2e6],
  ['neon-pool', 'Neon Pool', 'pool', 8446, 3.2e13, 6870, 1.9e6, 4.8e6],
  ['night-club', 'Night Club', 'lounge', 8780, 7.2e13, 10200, 2.8e6, 7.1e6],
  ['king-chamber', 'King Chamber', 'bedroom', 9120, 1.6e14, 15100, 4.2e6, 1e7],
  ['crystal-washroom', 'Crystal Washroom', 'bathroom', 9466, 3.7e14, 22500, 6.2e6, 1.6e7],
  ['robot-kitchen', 'Robot Kitchen', 'kitchen', 9818, 8.6e14, 33500, 9.3e6, 2.3e7],
  ['feast-hall', 'Feast Hall', 'dining', 10176, 2e15, 50000, 1.4e7, 3.5e7],
  ['wizard-library', 'Wizard Library', 'library', 10540, 4.6e15, 74800, 2.1e7, 5.2e7],
  ['titan-gym', 'Titan Gym', 'gym', 10910, 1.1e16, 112000, 3.1e7, 7.8e7],
  ['mega-arcade', 'Mega Arcade', 'arcade', 11286, 2.5e16, 168000, 4.7e7, 1.2e8],
  ['space-cinema', 'Space Cinema', 'cinema', 11668, 5.8e16, 253000, 7e7, 1.8e8],
  ['lava-spa', 'Lava Spa', 'spa', 12056, 1.4e17, 382000, 1.1e8, 2.7e8],
  ['galaxy-ballroom', 'Galaxy Ballroom', 'ballroom', 12450, 3.2e17, 576000, 1.6e8, 4e8],
  ['control-room', 'Control Room', 'office', 12850, 7.6e17, 872000, 2.4e8, 6.1e8],
  ['laser-studio', 'Laser Studio', 'music', 13256, 1.8e18, 1300000, 3.7e8, 9.2e8],
  ['candy-playroom', 'Candy Playroom', 'kids', 13668, 4.3e18, 2000000, 5.6e8, 1.4e9],
  ['mushroom-garden', 'Mushroom Garden', 'garden', 14086, 1e19, 3000000, 8.5e8, 2.1e9],
  ['slime-laundry', 'Slime Laundry', 'laundry', 14510, 2.5e19, 4700000, 1.3e9, 3.2e9],
  ['deep-sea-tank', 'Deep Sea Tank', 'aquarium', 14940, 6e19, 7100000, 2e9, 4.9e9],
  ['treasure-gallery', 'Treasure Gallery', 'art', 15376, 1.5e20, 11000000, 3e9, 7.5e9],
  ['core-vault', 'Core Vault', 'vault', 15818, 3.5e20, 17000000, 4.6e9, 1.2e10],
]

export const ZONES = FLOOR_TABLE.map(([id, name, theme, start, wall, winsPerMeter, smash, discover]) => ({
  id,
  name,
  theme,
  start: DROP_ROOF + start,
  wall,
  winsPerMeter,
  smash,
  discover,
}))
/** The same table by its game name. */
export const FLOORS = ZONES

/** Wins pickups down the hotel: the first 40 m under the roof, then every 80 m. */
export const TROPHY_FIRST = DROP_ROOF + 40
export const TROPHY_SPACING = 80
/** A trophy is worth this many metres of its zone's Wins (at least 1). */
export const TROPHY_METERS = 80

/**
 * Seconds from letting go of the DROP button to the phone leaving your hand: the throw's
 * swing. (The charge before it is yours: you hold for as long as you like, and the server
 * only hears about the release.)
 */
export const ROLL_LAUNCH = 0.55
/** Seconds the phone falls through the sky, from your hand to the hotel's glass roof. */
export const DROP_AIR = 2.4
/** Seconds the phone takes to bounce and settle once it stops on a floor. */
export const DROP_SETTLE = 0.6
/** Seconds smashing down through the hotel for a drop `below` metres under the roof. */
export const towerDuration = (below) => 0.8 + 1.7 * Math.log(1 + Math.max(0, below) / 60)
/**
 * Seconds a drop to depth `distance` takes: the throw, the fall to the roof, smashing
 * down floor by floor and settling. Logarithmic: deep drops stay short.
 */
export const rollDuration = (distance) => ROLL_LAUNCH + DROP_AIR + towerDuration(distance - DROP_ROOF) + DROP_SETTLE
/** The result popup after the phone stops, before you're back at the drop zone. */
export const ROLL_RECOVERY = 2.2

/**
 * The throw meter. Stand in the DROP ZONE and hold DROP (or E): the meter charges up, and
 * once full it wobbles: it bounces off the top and back, again and again (TWANG_PERIOD a
 * bounce, dipping TWANG_DEPTH). Let go to throw. `accuracy` is how full the meter was when
 * you let go: 1 at the very top of a bounce. The grade it lands in decides the drop, each
 * grade clearly apart from the next: how deep it smashes (`reach`, a share of the depth
 * under the roof your Skill alone would reach - half for a WEAK throw, half as deep again
 * for a PERFECT one) and how many Wins it pays (`bonus`). Auto Drop skips the meter: a
 * plain x1 drop, between GOOD and GREAT.
 *
 * Wins are the Skill's worth times `bonus` - not paid by the metres the grade adds: late
 * in the game each floor pays ~1.4 times the last, so paying for half as deep again would
 * multiply a PERFECT drop's Wins dozens of times over (logic.applyRoll).
 */
/** Seconds the throw meter takes to charge from empty to full. */
export const CHARGE_TIME = 0.9
/**
 * Seconds per wobble at full charge, and how far down the meter each one dips. The
 * bounce is sharp at the top (|sin|), so the PERFECT moment is ~0.1 s each time: a real
 * test of timing, still fair on a phone, and a throw let go at full charge is never
 * worse than GOOD.
 */
export const TWANG_PERIOD = 0.75
export const TWANG_DEPTH = 0.5
/** The meter (0-1) `seconds` after reaching full charge: bouncing off the top. */
export const twangAt = (seconds) => 1 - TWANG_DEPTH * Math.abs(Math.sin((Math.PI * Math.max(0, seconds)) / TWANG_PERIOD))
/**
 * Grades by `min` accuracy: PERFECT is the top 12% of the meter, GREAT 30%, GOOD 60%.
 * `reach` is [at the grade's outer edge, at its inner edge]: a little further the nearer
 * the top within a grade, and a big step up to the next.
 */
export const HIT_GRADES = [
  { id: 'perfect', min: 0.88, reach: [1.4, 1.5], bonus: 1.6, label: 'PERFECT THROW!' },
  { id: 'great', min: 0.7, reach: [1.1, 1.2], bonus: 1.25, label: 'GREAT THROW!' },
  { id: 'good', min: 0.4, reach: [0.8, 0.9], bonus: 1, label: 'GOOD THROW' },
  { id: 'weak', min: 0, reach: [0.5, 0.6], bonus: 0.75, label: 'WEAK THROW...' },
]
const clampAccuracy = (accuracy) => Math.min(1, Math.max(0, accuracy))
/** The grade for a meter `accuracy` (0-1), or null for a drop without the meter. */
export const hitGrade = (accuracy) => (Number.isFinite(accuracy) ? HIT_GRADES.find((g) => clampAccuracy(accuracy) >= g.min) : null)
/**
 * How deep a throw at meter `accuracy` smashes, as a share of the depth under the roof
 * your Skill alone would reach: 0.5 barely charged, 1.5 at the top of a wobble, in a
 * clear step per grade; 1 for a drop without the meter.
 */
export function hitReach(accuracy) {
  const grade = hitGrade(accuracy)
  if (!grade) return 1
  const index = HIT_GRADES.indexOf(grade)
  const top = index > 0 ? HIT_GRADES[index - 1].min : 1
  const t = Math.min(1, (clampAccuracy(accuracy) - grade.min) / (top - grade.min))
  return grade.reach[0] + (grade.reach[1] - grade.reach[0]) * t
}

// --- Pets & eggs ------------------------------------------------------------------

export const RARITIES = {
  common: { name: 'Common', color: '#b9c3cf', order: 0 },
  uncommon: { name: 'Uncommon', color: '#4ade80', order: 1 },
  rare: { name: 'Rare', color: '#38bdf8', order: 2 },
  epic: { name: 'Epic', color: '#b15cff', order: 3 },
  legendary: { name: 'Legendary', color: '#ffc41f', order: 4 },
  mythic: { name: 'Mythic', color: '#ff3b6b', order: 5 },
  secret: { name: 'Secret', color: '#ff5bd8', order: 6 },
}

/** `mult` multiplies Skill gains. Equipped pets stack additively (see logic.js). */
export const PETS = {
  cat: { name: 'Cat', rarity: 'common', mult: 1.1 },
  dog: { name: 'Dog', rarity: 'common', mult: 1.15 },
  bunny: { name: 'Bunny', rarity: 'uncommon', mult: 1.25 },
  bear: { name: 'Bear', rarity: 'rare', mult: 1.5 },
  cow: { name: 'Cow', rarity: 'uncommon', mult: 1.4 },
  parrot: { name: 'Parrot', rarity: 'rare', mult: 1.7 },
  fox: { name: 'Fox', rarity: 'epic', mult: 2.2 },
  tiger: { name: 'Tiger', rarity: 'legendary', mult: 3 },
  flamingo: { name: 'Flamingo', rarity: 'uncommon', mult: 2.5 },
  turtle: { name: 'Turtle', rarity: 'rare', mult: 3.2 },
  owl: { name: 'Owl', rarity: 'epic', mult: 4.5 },
  phoenix: { name: 'Phoenix', rarity: 'legendary', mult: 7 },
  pony: { name: 'Pony', rarity: 'rare', mult: 5 },
  unicorn: { name: 'Unicorn', rarity: 'epic', mult: 8 },
  pegasus: { name: 'Pegasus', rarity: 'legendary', mult: 13 },
  salamander: { name: 'Salamander', rarity: 'rare', mult: 10 },
  firebird: { name: 'Fire Bird', rarity: 'epic', mult: 16 },
  golem: { name: 'Magma Golem', rarity: 'legendary', mult: 26 },
  inferno: { name: 'Inferno Wolf', rarity: 'mythic', mult: 45 },
  dragon: { name: 'Dragon', rarity: 'epic', mult: 2.5 },
  crab: { name: 'Lucky Crab', rarity: 'uncommon', mult: 1.2 },
  sphinx: { name: 'Sphinx', rarity: 'secret', mult: 80 },
  // Palm Beach's Beach Egg: the Kraken is the best pet in the game, but only just - the
  // best three pets set the late game's pace (scripts/balance-sim.mjs).
  seagull: { name: 'Seagull', rarity: 'rare', mult: 16 },
  dolphin: { name: 'Dolphin', rarity: 'epic', mult: 22 },
  shark: { name: 'Shark', rarity: 'legendary', mult: 32 },
  kraken: { name: 'Kraken', rarity: 'mythic', mult: 55 },
}

/**
 * Eggs, bought with Wins. `world` = the only world it hatches in (the Beach Egg: Palm
 * Beach). `pets` are [petId, weight] - weights are percentages and
 * sum to 100. Each egg is priced at about the Wins of a few drops at the stage of the
 * game whose pets it beats.
 */
export const EGGS = {
  basic: { name: 'Basic', cost: { wins: 15 }, pets: [['cat', 45], ['dog', 30], ['bunny', 20], ['bear', 5]] },
  meadow: { name: 'Grass', cost: { wins: 120 }, pets: [['cow', 45], ['parrot', 30], ['fox', 20], ['tiger', 5]] },
  sunset: { name: 'Sunset', cost: { wins: 750 }, pets: [['flamingo', 45], ['turtle', 30], ['owl', 20], ['phoenix', 5]] },
  unicorn: { name: 'Unicorn', cost: { wins: 6000 }, pets: [['pony', 50], ['unicorn', 35], ['pegasus', 15]] },
  volcano: { name: 'Volcano', cost: { wins: 35000 }, pets: [['salamander', 50], ['firebird', 30], ['golem', 15], ['inferno', 5]] },
  beach: { name: 'Beach', cost: { wins: 2000000 }, world: 1, pets: [['seagull', 45], ['dolphin', 30], ['shark', 20], ['kraken', 5]] },
}

export const MAX_EQUIPPED_PETS = 3
export const MAX_PET_INVENTORY = 60
/** Multi-hatch opens this many at once, for that many times the cost. */
export const MULTI_HATCH = 3

// --- Items, boosts, rewards -------------------------------------------------------

export const POTION_DURATION_MS = 5 * 60 * 1000

export const ITEMS = {
  potionHealth: { name: 'x2 Skill Potion', kind: 'potion', boost: 'health', durationMs: POTION_DURATION_MS },
  potionWins: { name: 'x2 Wins Potion', kind: 'potion', boost: 'wins', durationMs: POTION_DURATION_MS },
  eggMeadow: { name: 'Grass Egg', kind: 'egg', egg: 'meadow' },
  eggSunset: { name: 'Sunset Egg', kind: 'egg', egg: 'sunset' },
  eggUnicorn: { name: 'Unicorn Egg', kind: 'egg', egg: 'unicorn' },
  eggVolcano: { name: 'Volcano Egg', kind: 'egg', egg: 'volcano' },
}

/** 7-day cycle; day N unlocks N x 24h after the cycle started. */
export const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000
export const DAILY_REWARDS = [
  { label: 'x2 Wins', icon: 'potionWins', sub: '5m', grant: { item: 'potionWins' } },
  { label: 'Dragon', icon: 'pet:dragon', sub: 'x1', grant: { pet: 'dragon' } },
  { label: 'x2 Skill', icon: 'potionHealth', sub: '5m', grant: { item: 'potionHealth' } },
  { label: 'Unicorn Egg', icon: 'egg:unicorn', sub: 'x1', grant: { item: 'eggUnicorn' } },
  { label: 'x2 Skill', icon: 'potionHealth', sub: '5m', grant: { item: 'potionHealth' } },
  { label: 'x2 Wins', icon: 'potionWins', sub: '5m', grant: { item: 'potionWins' } },
  { label: 'Volcano Egg', icon: 'egg:volcano', sub: 'x1', grant: { item: 'eggVolcano' } },
]

/**
 * Claimable once each per session, after this many minutes played: something to look
 * forward to every few minutes for the first hour.
 */
export const PLAYTIME_REWARDS = [
  { minutes: 3, label: '+10 Wins', icon: 'trophy', grant: { wins: 10 } },
  { minutes: 8, label: 'x2 Skill', icon: 'potionHealth', grant: { item: 'potionHealth' } },
  { minutes: 15, label: 'Grass Egg', icon: 'egg:meadow', grant: { item: 'eggMeadow' } },
  { minutes: 25, label: 'x2 Wins', icon: 'potionWins', grant: { item: 'potionWins' } },
  { minutes: 35, label: '+250 Wins', icon: 'trophy', grant: { wins: 250 } },
  { minutes: 45, label: 'Sunset Egg', icon: 'egg:sunset', grant: { item: 'eggSunset' } },
  { minutes: 60, label: 'x2 Skill', icon: 'potionHealth', grant: { item: 'potionHealth' } },
  { minutes: 90, label: 'Unicorn Egg', icon: 'egg:unicorn', grant: { item: 'eggUnicorn' } },
]

/** The stand by spawn: a pet the first time, a potion on later sessions. */
export const FREE_REWARD = { firstTime: { pet: 'crab' }, repeat: { item: 'potionHealth' } }

/** Offline training: a quarter of your pad's rate, for up to 8 hours away. */
export const OFFLINE_RATE = 0.25
export const OFFLINE_MAX_MS = 8 * 60 * 60 * 1000
export const OFFLINE_MIN_MS = 60 * 1000

/**
 * The world portal (placed by PORTALS in world.js): its name, and what opens it the
 * first time - this many rebirths AND this many Wins held (not spent). After that it's
 * open for good, both ways. Stepping through earns the badge of the same id.
 */
export const WORLD_PORTALS = {
  world2: { name: 'Palm Beach', wins: 1000000, rebirths: 8 },
}

/**
 * Palm Beach's Secret Star, hidden somewhere in its lobby (STAR in world.js): finding it
 * doubles every Skill gain for good, in every world.
 */
export const SECRET_STAR = { world: 1, power: 2 }

// --- Worlds -----------------------------------------------------------------------

/**
 * Palm Beach (World 2), through the portal once you've rebirthed 8 times and hold 1M
 * Wins: a sunny cliff over the sea. Its own Beach Egg, two beach throw pads and a Secret
 * Star, and its own tower to drop on - the Beach Resort, one floor for each of the
 * hotel's - where every metre, trophy and first-visit prize pays `wins` times as much.
 * Its floors need the same Skill as World 1's - a harder World 2 would pay less than
 * World 1 right after each rebirth - so going over is always worth it, and coming back
 * (the same portal) costs nothing.
 */
export const WORLDS = [
  { id: 'world1', name: 'Sky City', wins: 1 },
  { id: 'world2', name: 'Palm Beach', wins: 3 },
]

/** The Beach Resort's floors in Palm Beach: [id, name, room theme], one for each of World 1's. */
const WORLD2_STAGES = [
  ['w2-infinity-pool', 'Infinity Pool', 'pool'],
  ['w2-tiki-lounge', 'Tiki Lounge', 'lounge'],
  ['w2-seashell-suite', 'Seashell Suite', 'bedroom'],
  ['w2-coral-bathroom', 'Coral Bathroom', 'bathroom'],
  ['w2-coconut-kitchen', 'Coconut Kitchen', 'kitchen'],
  ['w2-seafood-diner', 'Seafood Diner', 'dining'],
  ['w2-driftwood-library', 'Driftwood Library', 'library'],
  ['w2-beach-gym', 'Beach Gym', 'gym'],
  ['w2-boardwalk-arcade', 'Boardwalk Arcade', 'arcade'],
  ['w2-sunset-cinema', 'Sunset Cinema', 'cinema'],
  ['w2-seaweed-spa', 'Seaweed Spa', 'spa'],
  ['w2-luau-ballroom', 'Luau Ballroom', 'ballroom'],
  ['w2-lifeguard-office', 'Lifeguard Office', 'office'],
  ['w2-steel-drum-studio', 'Steel Drum Studio', 'music'],
  ['w2-sandcastle-club', 'Sandcastle Club', 'kids'],
  ['w2-palm-atrium', 'Palm Atrium', 'garden'],
  ['w2-towel-laundry', 'Towel Laundry', 'laundry'],
  ['w2-reef-aquarium', 'Reef Aquarium', 'aquarium'],
  ['w2-shell-gallery', 'Shell Gallery', 'art'],
  ['w2-pirate-vault', 'Pirate Vault', 'vault'],
  ['w2-wave-pool', 'Wave Pool', 'pool'],
  ['w2-hammock-lounge', 'Hammock Lounge', 'lounge'],
  ['w2-pelican-suite', 'Pelican Suite', 'bedroom'],
  ['w2-pearl-bathroom', 'Pearl Bathroom', 'bathroom'],
  ['w2-mango-kitchen', 'Mango Kitchen', 'kitchen'],
  ['w2-clam-bake-hall', 'Clam Bake Hall', 'dining'],
  ['w2-captain-library', 'Captain Library', 'library'],
  ['w2-surf-gym', 'Surf Gym', 'gym'],
  ['w2-pier-arcade', 'Pier Arcade', 'arcade'],
  ['w2-dive-in-cinema', 'Dive-In Cinema', 'cinema'],
  ['w2-hot-sand-spa', 'Hot Sand Spa', 'spa'],
  ['w2-hula-ballroom', 'Hula Ballroom', 'ballroom'],
  ['w2-harbor-office', 'Harbor Office', 'office'],
  ['w2-ukulele-studio', 'Ukulele Studio', 'music'],
  ['w2-crab-playroom', 'Crab Playroom', 'kids'],
  ['w2-banana-garden', 'Banana Garden', 'garden'],
  ['w2-sail-laundry', 'Sail Laundry', 'laundry'],
  ['w2-turtle-tank', 'Turtle Tank', 'aquarium'],
  ['w2-coral-gallery', 'Coral Gallery', 'art'],
  ['w2-treasure-vault', 'Treasure Vault', 'vault'],
  ['w2-moonlit-pool', 'Moonlit Pool', 'pool'],
  ['w2-starfish-lounge', 'Starfish Lounge', 'lounge'],
  ['w2-mermaid-suite', 'Mermaid Suite', 'bedroom'],
  ['w2-lagoon-bathroom', 'Lagoon Bathroom', 'bathroom'],
  ['w2-shipwreck-galley', 'Shipwreck Galley', 'kitchen'],
  ['w2-kraken-hall', 'Kraken Hall', 'dining'],
  ['w2-lighthouse-library', 'Lighthouse Library', 'library'],
  ['w2-shark-gym', 'Shark Gym', 'gym'],
  ['w2-neon-arcade', 'Neon Arcade', 'arcade'],
  ['w2-deep-sea-cinema', 'Deep Sea Cinema', 'cinema'],
  ['w2-volcano-spa', 'Volcano Spa', 'spa'],
  ['w2-atlantis-ballroom', 'Atlantis Ballroom', 'ballroom'],
  ['w2-sub-control-room', 'Sub Control Room', 'office'],
  ['w2-siren-studio', 'Siren Studio', 'music'],
  ['w2-bubble-playroom', 'Bubble Playroom', 'kids'],
  ['w2-kelp-garden', 'Kelp Garden', 'garden'],
  ['w2-tidal-laundry', 'Tidal Laundry', 'laundry'],
  ['w2-abyss-aquarium', 'Abyss Aquarium', 'aquarium'],
  ['w2-pearl-gallery', 'Pearl Gallery', 'art'],
  ['w2-golden-vault', 'Golden Vault', 'vault'],
]

const worldZones = (world) =>
  ZONES.map((zone, i) => {
    const mult = WORLDS[world].wins
    const [id, name, theme] = world === 1 ? WORLD2_STAGES[i] : [zone.id, zone.name, zone.theme]
    return {
      ...zone,
      id,
      name,
      theme,
      winsPerMeter: zone.winsPerMeter * mult,
      smash: zone.smash * mult,
      discover: zone.discover * mult,
    }
  })

/** Each world's floors, as ZONES: `WORLD_ZONES[profile.world]`. */
export const WORLD_ZONES = [ZONES, worldZones(1)]
export const zonesOf = (world) => WORLD_ZONES[world] ?? ZONES

// --- Shop -------------------------------------------------------------------------

/**
 * The shop. Wins are the game's only currency: everything here, like phones and eggs,
 * is bought with them. `pass` = permanent unlock; `consumable` = grants every time.
 */
export const SHOP = {
  healthX2: { name: 'x2 Skill', price: 400, kind: 'pass' },
  winsX2: { name: 'x2 Wins', price: 2500, kind: 'pass' },
  autoRoll: { name: 'Auto Drop', price: 150, kind: 'pass' },
  padVeryOp: { name: 'VERY OP! Throw Pad', price: 150000, kind: 'pass' },
  padBest: { name: 'BEST OVERALL! Throw Pad', price: 2500000, kind: 'pass' },
  sphinx: { name: 'Sphinx', price: 2500000, kind: 'consumable', grant: { pet: 'sphinx' }, stock: 1000 },
}

/**
 * Boxity Gems products, by sku. Prices live in Boxity's catalog, never here: the game
 * only names the sku and, once Boxity confirms the sale, grants what it says. Wins
 * packs grow with you: `winsRolls` max-level drops' worth of Wins.
 */
export const GEM_PRODUCTS = {
  wins_small: { name: 'Pile of Wins', blurb: '10 max-level drops of Wins', icon: 'trophy', grant: { winsRolls: 10 } },
  wins_big: { name: 'Mountain of Wins', blurb: '60 max-level drops of Wins', icon: 'trophy', grant: { winsRolls: 60 } },
  potion_bundle: { name: 'Potion Bundle', blurb: '3 x2 Skill + 3 x2 Wins potions', icon: 'potionHealth', grant: { items: { potionHealth: 3, potionWins: 3 } } },
  volcano_eggs: { name: '3 Volcano Eggs', blurb: 'The best pets in the game', icon: 'egg:volcano', grant: { items: { eggVolcano: 3 } } },
  auto_roll: { name: 'Auto Drop', blurb: 'Throws your phone for you from the Drop Zone', icon: 'tire', grant: { pass: 'autoRoll' } },
  health_x2: { name: 'x2 Skill', blurb: 'Double every Skill gain, forever', icon: 'heart', grant: { pass: 'healthX2' } },
  wins_x2: { name: 'x2 Wins', blurb: 'Double every drop’s Wins, forever', icon: 'trophy', grant: { pass: 'winsX2' } },
  pad_best: { name: 'Galaxy Throw Pad', blurb: 'Unlocks the x100 Galaxy throw pad', icon: 'portal', grant: { pass: 'padBest' } },
}

/**
 * Rewarded ads (Boxity): watch one to earn this. Placement names are lowercase, digits
 * and hyphens. `cooldownMs` keeps a player from chaining them.
 */
export const AD_REWARDS = {
  'health-potion': { label: 'x2 Skill Potion', icon: 'potionHealth', grant: { item: 'potionHealth' }, cooldownMs: 3 * 60 * 1000 },
  'wins-potion': { label: 'x2 Wins Potion', icon: 'potionWins', grant: { item: 'potionWins' }, cooldownMs: 3 * 60 * 1000 },
}

/** Sphinx stock shown before the server reports the live count. */
export const SPHINX_STOCK_DEFAULT = 954

/**
 * The three Skill packs under the level bar. They grow with you: each gives `share`
 * of the Skill your next level needs, for `rolls` drops' worth of Wins at that Skill.
 * Packs aren't held back by the level cap.
 */
export const HEALTH_PACKS = [
  { share: 1, rolls: 1 },
  { share: 5, rolls: 4 },
  { share: 20, rolls: 12 },
]

// --- Coming back for more: streaks, quests, combos, lucky gifts, friends ---------------

/**
 * A game day, in UTC: quests reset and login streaks count by it, the same for everyone
 * everywhere (`dayNumber(now)` is the day since 1970).
 */
export const DAY_MS = 24 * 60 * 60 * 1000
export const dayNumber = (now) => Math.floor(now / DAY_MS)

/**
 * Login streak: play on consecutive days and every drop pays STREAK_STEP more Wins per
 * day in a row (day 1 x1, day 2 x1.1 ... day 11 and on x2). Miss a day and it starts again
 * from day 1 - the reason to come back tomorrow.
 */
export const STREAK_STEP = 0.1
export const STREAK_MAX_DAYS = 11
export const streakMultiplier = (days) => 1 + STREAK_STEP * (Math.min(STREAK_MAX_DAYS, Math.max(1, days)) - 1)

/**
 * PERFECT combo: PERFECT throws in a row each pay COMBO_STEP more Wins than the last
 * (the 2nd +10%, the 3rd +20% ... up to +COMBO_MAX); anything less than PERFECT breaks it.
 * Kept for the session, never saved.
 */
export const COMBO_STEP = 0.1
export const COMBO_MAX = 0.5
export const comboBonus = (combo) => 1 + Math.min(COMBO_MAX, COMBO_STEP * Math.max(0, combo - 1))

/**
 * Playing together: every other player in your server (and your world) adds CROWD_STEP
 * to your drops' Wins, up to CROWD_MAX - bring your friends.
 */
export const CROWD_STEP = 0.1
export const CROWD_MAX = 0.3
export const crowdBonus = (others) => 1 + Math.min(CROWD_MAX, CROWD_STEP * Math.max(0, others))

/**
 * Lucky gifts: each drop has LUCKY_CHANCE of landing a surprise on top of its Wins.
 * `weight`s are relative. Wins gifts grow with you (`winsRolls` max-level drops' worth);
 * an egg gift is an egg that fits how far you've got (logic.eggItemFor).
 */
export const LUCKY_CHANCE = 0.08
export const LUCKY_GIFTS = [
  { weight: 45, label: 'Bag of Wins', icon: 'trophy', grant: { winsRolls: 4 } },
  { weight: 20, label: 'x2 Wins Potion', icon: 'potionWins', grant: { item: 'potionWins' } },
  { weight: 20, label: 'x2 Skill Potion', icon: 'potionHealth', grant: { item: 'potionHealth' } },
  { weight: 15, label: 'Mystery Egg', icon: 'egg', grant: { egg: true } },
]

/**
 * Daily quests: QUESTS_PER_DAY a day - an EASY, a MEDIUM and a HARD one of different
 * kinds, picked fresh each day for each player - and a bonus chest for finishing all
 * three. Rewards grow with you: `winsRolls` max-level drops' worth of Wins (HARD adds
 * a potion; the chest adds an egg that fits your progress).
 *
 * Each kind counts one thing (`counter`, fed by the session as you play) up to its
 * target; `mode: 'best'` keeps the best single value instead of adding up. `targets` are
 * per tier; `scale` scales them with your deepest drop so far ('total': that many of it in
 * metres, 'best': that share of it). `{n}` in `text` is the target.
 */
export const QUESTS_PER_DAY = 3
export const QUEST_TIERS = [
  { id: 'easy', label: 'EASY', winsRolls: 3 },
  { id: 'medium', label: 'MEDIUM', winsRolls: 6 },
  { id: 'hard', label: 'HARD', winsRolls: 12, item: 'potionWins' },
]
export const QUEST_BONUS = { winsRolls: 15 }
export const QUEST_TYPES = {
  launch: { counter: 'launch', text: 'Drop your phone {n} times', targets: [5, 12, 25] },
  great: { counter: 'great', text: 'Get {n} GREAT or PERFECT throws', targets: [2, 5, 10] },
  perfect: { counter: 'perfect', text: 'Get {n} PERFECT throws', targets: [1, 3, 6] },
  combo: { counter: 'combo', mode: 'best', text: 'Hit a PERFECT throw combo of {n}', targets: [2, 3, 4] },
  reps: { counter: 'rep', text: 'Make {n} practice throws', targets: [40, 120, 300] },
  meters: { counter: 'meters', text: 'Smash {n} m deep in total', scale: 'total', targets: [4, 10, 25] },
  far: { counter: 'far', mode: 'best', text: 'Smash {n} m deep in one drop', scale: 'best', targets: [0.6, 0.8, 0.95] },
  hatch: { counter: 'hatch', text: 'Hatch {n} pets', targets: [1, 3, 6] },
  minutes: { counter: 'minute', text: 'Play for {n} minutes', targets: [5, 15, 30] },
}

// --- Tutorial & badges ------------------------------------------------------------

/**
 * The guide for new players: train, drop, spend the Wins on a new phone, drop deeper,
 * rebirth. Each step completes when its event fires (and, with `health`, once you have
 * that much); after the last the guide is done.
 */
export const TUTORIAL = [
  { text: 'Stand on a throw pad or tap to throw your phone for Skill', event: 'train', target: 'pad0', health: 30 },
  { text: 'Go to the DROP ZONE, hold DROP and let go at the top!', event: 'roll', target: 'roll' },
  { text: 'Buy the Flip Phone with your Wins!', event: 'buyTire', target: 'tires' },
]

export const BADGES = {
  firstRoll: { name: 'First Drop' },
  firstRebirth: { name: 'First Rebirth' },
  firstPet: { name: 'Pet Owner' },
  firstWall: { name: 'Floor Smasher' },
  kilometer: { name: '1 Kilometre Drop' },
  space: { name: 'Deluxe Smasher' },
  cosmic: { name: 'Core Crusher' },
  world2: { name: 'Beach Bum' },
  secretStar: { name: 'Star Finder' },
}
