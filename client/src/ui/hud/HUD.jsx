import { useGame } from '../../store/game'
import LeftMenu from './LeftMenu'
import { ChapterClear, EnteringCover, Hint, LobbyHint, PadOverlay, PartyOverlay, Toast } from './Overlays'
import RunHUD from './RunHUD'
import TopBar from './TopBar'

/**
 * The heads-up display. In the lobby: the menu tiles down the left, Crystals, sound,
 * daily rewards, leaderboards and settings top-right; on a team pad, who's on it. In a
 * run: the room's progress,
 * the crosshair, your cash and bag, the tool hotbar and the upgrade button.
 *
 * The root ignores pointer events so the canvas and joystick underneath keep working;
 * only the buttons themselves opt back in. While a panel is open the HUD steps aside.
 */
export function HUD() {
  const panelOpen = useGame((s) => s.panel !== null)
  const inRun = useGame((s) => Boolean(s.profile.run?.active))
  const counting = useGame((s) => s.countdown !== null)
  const onPad = useGame((s) => s.pads.some((p) => p.seat >= 0))
  return (
    <div className="pp-font pointer-events-none absolute inset-0 z-20 select-none">
      <div className="absolute inset-0 transition-opacity duration-150" style={{ opacity: panelOpen ? 0 : 1, visibility: panelOpen ? 'hidden' : 'visible' }}>
        {inRun ? (
          <RunHUD />
        ) : (
          <>
            <TopBar />
            {!counting && <LeftMenu />}
            {!counting && !onPad && <LobbyHint />}
            <PadOverlay />
          </>
        )}
        <Toast />
        <Hint />
      </div>
      <PartyOverlay />
      <ChapterClear />
      <EnteringCover />
    </div>
  )
}

export default HUD
