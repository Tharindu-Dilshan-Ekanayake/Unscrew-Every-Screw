import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { Color } from 'three'

import { CHAPTERS } from '@shared/balance'
import { getLayout } from '@shared/layout'
import { chapterIndex } from '@shared/logic'

import { getGame, useGame } from '../../store/game'
import { syncRoom } from '../roomState'
import RemoteAvatars from '../remote/RemoteAvatars'
import RemotePlayers from '../remote/RemotePlayers'
import Drone from './Drone'
import FirstPerson from './FirstPerson'
import FlyingScrews from './FlyingScrews'
import RoomShell from './RoomShell'
import ScrewField from './ScrewField'
import Stations from './Stations'
import { roomTheme } from './themes'
import Unscrewer from './Unscrewer'
import Viewmodel from './Viewmodel'

/** Clears the "entering" cover once the room has drawn a frame. */
function ReadySignal() {
  const sent = useRef(false)
  useFrame(() => {
    if (sent.current) return
    sent.current = true
    setTimeout(() => getGame().setEntering(false), 0)
  })
  return null
}

/**
 * A run's room - its own lazily loaded chunk, so the lobby never pays for it. Everything
 * here is built for the one room you're in and disposed when you leave it (each part
 * cleans up its own geometry, textures and materials on unmount).
 */
export default function RunStage() {
  const get = useThree((s) => s.get)
  const chapterId = useGame((s) => s.profile.run?.chapter)
  const roomIndex = useGame((s) => s.profile.run?.room ?? 0)
  const ci = Math.max(0, chapterIndex(chapterId))
  const chapter = CHAPTERS[ci]
  const theme = useMemo(() => roomTheme(chapter, roomIndex), [chapter, roomIndex])
  const layout = useMemo(() => getLayout(ci, roomIndex), [ci, roomIndex])

  // The room's own backdrop; the lobby's fog pushed out of the way.
  useEffect(() => {
    const { scene } = get()
    const background = scene.background
    const fog = scene.fog
    const near = fog?.near
    const far = fog?.far
    scene.background = new Color(theme.background)
    if (fog) {
      fog.near = 40
      fog.far = 120
    }
    return () => {
      scene.background = background
      if (fog) {
        fog.near = near
        fog.far = far
      }
    }
  }, [get, theme])

  // In case the stage mounted before the profile's room was taken in.
  useEffect(() => {
    syncRoom(getGame().profile)
  }, [layout])

  return (
    <>
      <hemisphereLight args={[theme.hemiSky, theme.hemiGround, theme.hemi]} />
      <directionalLight color={theme.sun} intensity={theme.sunIntensity} position={[3, 10, 5]} />
      <RoomShell key={`shell:${layout.key}`} layout={layout} theme={theme} themeId={chapter.theme} />
      <Stations key={`stations:${layout.key}`} layout={layout} theme={theme} />
      <ScrewField key={`screws:${layout.key}`} layout={layout} head={chapter.head} screwColor={theme.screw} />
      <FirstPerson layout={layout} />
      <Unscrewer layout={layout} />
      <Viewmodel />
      <FlyingScrews head={chapter.head} screwColor={theme.screw} />
      <Drone />
      {/* Your party: the others in this run, as their avatars. */}
      <RemotePlayers />
      <RemoteAvatars />
      <ReadySignal key={`ready:${layout.key}`} />
    </>
  )
}
