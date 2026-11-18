import { useEffect, useState } from 'react'

import { CHAPTERS, DIFFICULTIES } from '@shared/balance'
import { formatDuration, formatNumber } from '@shared/format'
import { getLayout } from '@shared/layout'
import { chapterIndex, isChapterUnlocked, isDifficultyUnlocked } from '@shared/logic'

import boilerShot from '../../assets/chapters/boiler.webp'
import labShot from '../../assets/chapters/lab.webp'
import workshopShot from '../../assets/chapters/workshop.webp'
import { sfx } from '../../audio/sfx'
import { prefetchStage } from '../../game/stageLoader'
import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import Icon from '../Icon'
import StrokeText from '../StrokeText'
import useNow from '../useNow'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

/** Each chapter's card colours. */
const LOOKS = {
  workshop: 'linear-gradient(160deg, #e8b46a 0%, #a8743f 55%, #5a3a1c 100%)',
  boiler: 'linear-gradient(160deg, #ff9a5a 0%, #9c4a34 55%, #2d1a14 100%)',
  lab: 'linear-gradient(160deg, #e8fbff 0%, #6fd0f0 55%, #1f6f9a 100%)',
}

/** A room from each chapter (rendered from the game itself, 512px webp). */
const SHOTS = { workshop: workshopShot, boiler: boilerShot, lab: labShot }

/** A card's background: the chapter's room, darkening towards the bottom so its name reads. */
const cardBackground = (chapter) => `linear-gradient(180deg, rgb(10 12 20 / 0) 35%, rgb(10 12 20 / 0.85) 100%), url(${SHOTS[chapter.id]}) center / cover no-repeat, ${LOOKS[chapter.theme]}`

/** The chosen chapter's panel: its room as a banner, fading into a dark board under the text. */
const detailBackground = (chapter) =>
  `linear-gradient(180deg, rgb(14 16 26 / 0.15) 0%, rgb(14 16 26 / 0.7) 30%, rgb(14 16 26 / 0.93) 55%), url(${SHOTS[chapter.id]}) top / 100% auto no-repeat, ${LOOKS[chapter.theme]}`

const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

function ChapterCard({ chapter, selected, locked, onClick }) {
  const before = CHAPTERS.find((c) => c.id === chapter.unlock)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      className="pp-btn pointer-events-auto relative flex w-full items-end overflow-hidden text-left"
      style={{
        height: u(118),
        borderRadius: u(12),
        background: cardBackground(chapter),
        border: `${u(5)} solid ${selected ? '#ffffff' : '#0b0c0e'}`,
        boxShadow: selected ? `0 0 ${u(16)} rgba(255,255,255,0.6)` : 'none',
        filter: locked ? 'grayscale(0.85) brightness(0.55)' : 'none',
        padding: u(10),
      }}
    >
      <span style={{ fontSize: u(34), lineHeight: 1 }}>
        <StrokeText stroke={u(7)} gradient={GRADIENTS.gold} style={{ whiteSpace: 'normal' }}>
          {chapter.name}
        </StrokeText>
      </span>
      {locked && (
        <span className="absolute left-0 right-0 flex items-center justify-center text-center" style={{ top: u(10), gap: u(6), fontSize: u(22), padding: `0 ${u(8)}` }}>
          <Icon name="lock" size={u(34)} />
          <StrokeText stroke={u(5)} style={{ whiteSpace: 'normal' }}>
            Clear {before?.name}
          </StrokeText>
        </span>
      )}
    </button>
  )
}

/** The saved run: where it's up to, LOAD to carry on. */
function SavedRun({ run, onLoad }) {
  const now = useNow(30000)
  const ci = chapterIndex(run.chapter)
  const chapter = CHAPTERS[ci]
  const count = getLayout(ci, run.room).count
  const pct = Math.floor(((count - run.left) / count) * 100)
  const ago = run.savedAt ? formatDuration(now - run.savedAt) : null
  return (
    <div className="flex min-w-0 flex-col items-center text-center" style={{ padding: u(16), borderRadius: u(12), background: GRADIENTS.card, border: `${u(5)} solid #0b0c0e`, gap: u(6) }}>
      <span style={{ fontSize: u(36) }}>
        <StrokeText stroke={u(7)} gradient={GRADIENTS.cash}>
          SAVED RUN
        </StrokeText>
      </span>
      <span style={{ fontSize: u(32) }}>
        <StrokeText stroke={u(6)} style={{ whiteSpace: 'normal' }}>
          ROOM {run.room + 1} / {chapter.rooms.length} · {pct}%
        </StrokeText>
      </span>
      <div className="flex w-full" style={{ gap: u(6) }}>
        {chapter.rooms.map((_, i) => (
          <div
            key={i}
            className="flex-1"
            style={{
              height: u(16),
              borderRadius: u(6),
              border: `${u(3)} solid #0b0c0e`,
              background: i < run.room ? '#ffc21a' : i === run.room ? `linear-gradient(90deg, #ffc21a ${Math.max(pct, 4)}%, #5a6274 ${Math.max(pct, 4)}%)` : '#5a6274',
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: u(26) }}>
        <StrokeText stroke={u(5)} fill="#ffd27a" style={{ whiteSpace: 'normal' }}>
          {chapter.name} · {DIFFICULTIES[run.diff].name}
        </StrokeText>
      </span>
      <span style={{ fontSize: u(24) }}>
        <StrokeText stroke={u(5)} style={{ whiteSpace: 'normal' }}>
          ${formatNumber(run.cash)} cash · {formatNumber(run.screws)} screws
        </StrokeText>
      </span>
      {ago && (
        <span style={{ fontSize: u(22) }}>
          <StrokeText stroke={u(4)} fill="#cfd8ff">
            saved {ago} ago
          </StrokeText>
        </span>
      )}
      <div className="flex-1" />
      <ChunkyButton gradient={GRADIENTS.greenButton} onClick={onLoad} className="w-full" style={{ height: u(72), marginTop: u(6) }}>
        <span style={{ fontSize: u(40) }}>
          <StrokeText stroke={u(8)}>LOAD</StrokeText>
        </span>
      </ChunkyButton>
    </div>
  )
}

/**
 * The SOLO pad's panel: pick a chapter and a difficulty and CREATE a new run, or LOAD the
 * one you saved. (Team runs start on the team pads, a section per chapter: nothing to
 * pick there.)
 */
export function ChaptersPanel() {
  const profile = useGame((s) => s.profile)
  const closePanel = useGame((s) => s.closePanel)
  const firstOpen = CHAPTERS.filter((c) => isChapterUnlocked(profile, c.id)).pop() || CHAPTERS[0]
  // Opens on your saved run's chapter, or your furthest.
  const [chapterId, setChapterId] = useState(profile.run?.chapter || firstOpen.id)
  const [diff, setDiff] = useState(0)
  const chapter = CHAPTERS.find((c) => c.id === chapterId)
  const diffOpen = isDifficultyUnlocked(profile, chapterId, diff)
  const savedRun = Boolean(profile.run)
  // The room's code, fetched while you choose.
  useEffect(prefetchStage, [])

  const begin = (action) => {
    sfx.click()
    closePanel()
    const run = profile.run
    const pick = action === 'load' && run ? { chapter: run.chapter, diff: run.diff } : { chapter: chapterId, diff }
    actions.createParty(pick.chapter, pick.diff, action)
  }

  return (
    <Panel title="SOLO PLAY" icon="solo" width={savedRun ? 1320 : 1160}>
      <div className={`chapters-grid${savedRun ? ' has-run' : ''}`}>
        <div className="chapters-list">
          {CHAPTERS.map((c) => (
            <ChapterCard
              key={c.id}
              chapter={c}
              selected={c.id === chapterId}
              locked={!isChapterUnlocked(profile, c.id)}
              onClick={() => {
                sfx.click()
                setChapterId(c.id)
                setDiff(0)
              }}
            />
          ))}
          <div className="flex items-center justify-center text-center" style={{ minHeight: u(70), borderRadius: u(12), background: GRADIENTS.cardLocked, border: `${u(5)} solid #0b0c0e`, fontSize: u(26), padding: u(6) }}>
            <StrokeText stroke={u(6)} fill="#8a93a6" style={{ whiteSpace: 'normal' }}>
              MORE COMING SOON
            </StrokeText>
          </div>
        </div>

        <div className="flex min-w-0 flex-col items-center text-center" style={{ padding: u(18), borderRadius: u(12), background: detailBackground(chapter), border: `${u(5)} solid #0b0c0e`, gap: u(10) }}>
          <span style={{ fontSize: u(60), lineHeight: 1 }}>
            <StrokeText stroke={u(11)} gradient={GRADIENTS.gold} style={{ whiteSpace: 'normal' }}>
              {chapter.name}
            </StrokeText>
          </span>
          <span style={{ fontSize: u(28) }}>
            <StrokeText stroke={u(6)} style={{ whiteSpace: 'normal' }}>
              {chapter.blurb} {chapter.rooms.length} rooms.
            </StrokeText>
          </span>
          <div className="grid w-full grid-cols-3" style={{ gap: u(10) }}>
            {DIFFICULTIES.map((d, i) => {
              const open = isDifficultyUnlocked(profile, chapterId, i)
              const best = profile.best[`${chapterId}:${i}`]
              return (
                <ChunkyButton
                  key={d.id}
                  gradient={i === diff ? GRADIENTS.goldButton : open ? GRADIENTS.slate : GRADIENTS.greyButton}
                  onClick={() => {
                    sfx.click()
                    setDiff(i)
                  }}
                  className="difficulty-btn"
                  style={{ height: u(92), flexDirection: 'column', minWidth: 0 }}
                >
                  {!open && <Icon name="lock" size={u(34)} className="absolute" style={{ top: u(-14), right: u(-10) }} />}
                  <span className="difficulty-name">
                    <StrokeText stroke={u(6)}>{d.name}</StrokeText>
                  </span>
                  <span className="difficulty-sub">
                    <StrokeText stroke={u(4)}>{best ? `Best ${formatTime(best)}` : open ? `x${d.crystals} Crystals` : `Clear ${DIFFICULTIES[i - 1]?.name}`}</StrokeText>
                  </span>
                </ChunkyButton>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center justify-center" style={{ gap: u(10), fontSize: u(32) }}>
            <StrokeText stroke={u(6)}>Clear reward:</StrokeText>
            <Icon name="crystal" size={u(40)} />
            <StrokeText stroke={u(6)} gradient={GRADIENTS.crystal}>
              {formatNumber(Math.round(chapter.reward * DIFFICULTIES[diff].crystals))}
            </StrokeText>
          </div>
          <ChunkyButton gradient={diffOpen ? GRADIENTS.greenButton : GRADIENTS.greyButton} disabled={!diffOpen} onClick={() => begin('start')} style={{ width: '100%', maxWidth: u(420), height: u(96) }}>
            <span style={{ fontSize: u(50) }}>
              <StrokeText stroke={u(9)}>CREATE</StrokeText>
            </span>
          </ChunkyButton>
          {savedRun && (
            <span style={{ fontSize: u(22) }}>
              <StrokeText stroke={u(5)} fill="#ffd27a" style={{ whiteSpace: 'normal' }}>
                CREATE starts over: your saved run will be replaced.
              </StrokeText>
            </span>
          )}
        </div>

        {savedRun && <SavedRun run={profile.run} onLoad={() => begin('load')} />}
      </div>
    </Panel>
  )
}

export default ChaptersPanel
