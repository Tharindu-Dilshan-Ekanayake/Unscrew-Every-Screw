import { actions } from '../../net/actions'
import { useGame } from '../../store/game'
import StrokeText from '../StrokeText'
import { ChunkyButton } from '../hud/parts'
import { GRADIENTS, u } from '../hud/style'
import Panel from './Panel'

/**
 * Back to the lobby? A solo run is saved (LOAD it from the SOLO pad); a team run isn't -
 * leaving it is for good (the team plays on), and your solo save is back.
 */
export function LeavePanel() {
  const closePanel = useGame((s) => s.closePanel)
  const team = useGame((s) => Boolean(s.profile.run?.team))
  return (
    <Panel title="LEAVE?" icon="home" width={720}>
      <p className="m-0 text-center" style={{ fontSize: u(32), margin: `${u(6)} 0 ${u(20)}` }}>
        <StrokeText stroke={u(6)} style={{ whiteSpace: 'normal' }}>
          {team ? "Leave your team? Team runs aren't saved - your team plays on without you, and your solo run is still waiting." : 'Back to the lobby? Your run is saved - LOAD it from the SOLO pad to carry on.'}
        </StrokeText>
      </p>
      <div className="grid grid-cols-2" style={{ gap: u(14) }}>
        <ChunkyButton gradient={GRADIENTS.greenButton} onClick={closePanel} style={{ height: u(84) }}>
          <span style={{ fontSize: u(38) }}>
            <StrokeText stroke={u(7)}>KEEP GOING</StrokeText>
          </span>
        </ChunkyButton>
        <ChunkyButton
          gradient={GRADIENTS.redButton}
          onClick={() => {
            closePanel()
            actions.leaveRun()
          }}
          style={{ height: u(84) }}
        >
          <span style={{ fontSize: u(38) }}>
            <StrokeText stroke={u(7)}>TO LOBBY</StrokeText>
          </span>
        </ChunkyButton>
      </div>
    </Panel>
  )
}

export default LeavePanel
