---
canDie: false
hasScore: true
---

# Screwball Escape: Boxity integration

The player cannot die: there is no death or game-over screen. Players meet in a shared
lobby (a toy screw factory's yard), walk into the elevator and pick a chapter and a
difficulty. Each chapter is three rooms whose floor and walls are covered in screws: hold
click (or USE on touch) on a screw to unscrew it into your bag, sell the bag at the SELL
hopper for cash, and spend the cash on faster tools and upgrades for this run. Unscrew
EVERY screw to open the exit door. Clearing a chapter pays Crystals, which buy permanent
Perks and tool Skins in the lobby. A run can be left at any time and LOADed later.

Rooms are single-player: players inside a run are hidden from the lobby and from each
other. The server checks every unscrew (reach, bag space, tool speed), every sale (standing
at the hopper) and every purchase; the room layouts are shared code (`shared/layout.js`),
so the client draws exactly the screws the server validates.

## Leaderboards

Scores are reported by the **game server**, never by the client
(`server/src/bloxityLeaderboards.js`, `BLOXITY_LEADERBOARDS`). Every ~20 s and when a
player leaves, each pod sends the changed scores of its verified players to
`POST {api}/v1/leaderboards/hosted/{BLOXITY_GAME_ID}/report` as `legion_<userId>`.

| Board      | Label            | Score                                | Format  |
|------------|------------------|--------------------------------------|---------|
| `screws`   | Screws Unscrewed | `profile.stats.screws`               | compact |
| `rooms`    | Rooms Escaped    | `profile.stats.rooms`                | number  |
| `chapters` | Chapters Cleared | `profile.stats.chapters`             | number  |
| `playtime` | Minutes Played   | `floor(profile.stats.playtime / 60)` | number  |

All four are `order: desc`, `mode: best`, `reset: none`. (In the database the old column
names are kept and remapped - see `server/src/db.js` - so no migration is needed.)

## Identity and saves

- Signed in: the client sends the SDK's game token (only while `getUser()` is non-null);
  the server verifies it with `POST {api}/v1/auth/game-token/verify` and saves under the
  returned `user._id` only. Ids in the join options are ignored.
- Guests (no token, a refused/expired token, or Boxity unreachable): the server makes the
  id (`guest-<uuid>`) and sends the browser a **save ticket** - that id signed with a
  per-database secret (`server/src/saveTickets.js`). The browser keeps its last 5 tickets
  (`pp.saveTickets`) and shows them on every join, so a guest gets back into their own
  save whatever the SDK's guest identity does. Forged or edited tickets are ignored.
- Carry-over: an id with no save yet gets the first unused save among Boxity's
  `carriedFrom` guest ids and the browser's ticketed guest saves, copied once.

## Screen ads

`ads.declareScreens({ panel: {}, gameplay: {} })` once after init; the client then calls
`ads.screen('panel')` while a modal panel is open and `ads.screen('gameplay')` otherwise.
Gameplay banners are **off** (no `show: true`); turning them on is the developer's call.

## Gems purchases

Boxity's purchase webhook goes to `POST /api/gems/webhook` on the game server. It is
recorded in the database by `transactionId` (idempotent) and applied exactly once by
the pod the buyer plays on. Unknown skus are answered 400 so Boxity refunds them.

## Rewarded ads

The client sends `adReward { placement, rewardToken }`; the server verifies the token
with `POST {api}/v1/ads/reward/verify` before granting anything.

## Open Rooms

Each pod reports its rooms every 2 s to `POST {MATCHMAKER_REPORT_URL}/{BLOXITY_GAME_ID}/rooms`
(`server/src/legionRoomReporter.js`, installed after `listen()`), so they show under
"Open Rooms" on the game page. The client joins `?roomId=` at launch and falls back to
normal matchmaking if that room is gone or full.

## Avatars

`client/src/game/PlayerAvatar.jsx` + `avatarRig.js` draw every slot: skin (with face,
shirt and pants), body parts, hat + hair + mask on `Neck1`, back on `Spine2`, neck/chest
on `Spine2` and waist on `Spine1` (rest-inverse placement), hands and shoes as mirrored
pairs following the leaf bones' position and rotation only. A player wearing an uploaded
character (`characterId`) gets its GLB via `avatar.getCharacter()` / `getCharacterFor()`,
with accessories fitted by `characterAccessoryMatrix`; on any failure the regular avatar
shows. Body proportions are applied by moving bones, so accessories follow them.

## Server environment

| Variable                | Purpose                                                       |
|-------------------------|---------------------------------------------------------------|
| `BLOXITY_REPORT_TOKEN`  | Token for leaderboard and room reports (none set = no reports) |
| `MATCHMAKER_REPORT_URL` | Where the Open Rooms reporter posts (injected by Boxity hosting) |
| `BLOXITY_GAME_ID`       | Hosted game id for reports (default `1-phone-drop`)              |
| `LEGION_WEBHOOK_SECRET` | Must match the webhook's `x-legion-webhook-secret` header     |
| `MONGODB_URI`           | Shared database for profiles, Gems grants and the save-ticket secret. Required when hosted: without it saves go to a file inside the pod and are lost on every redeploy (the server logs an error and `/api/health` shows `db: "sqlite"`) |
| `BLOXITY_API_URL` etc.  | Platform URLs, injected by Boxity hosting; no defaults are written in code (`server/src/bloxityEnv.js`) |
