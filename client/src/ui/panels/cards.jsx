import Icon from '../Icon'
import StrokeText from '../StrokeText'
import { GRADIENTS, u } from '../hud/style'

const BLURB_STYLE = { color: '#dfe6f5', fontFamily: 'system-ui, sans-serif', fontWeight: 700 }

export function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: u(40), marginBottom: u(8) }}>
      <StrokeText stroke={u(8)} gradient={GRADIENTS.gold}>
        {children}
      </StrokeText>
    </div>
  )
}

/**
 * A shop card: icon, name, a line about it, an optional level row, and its button
 * (children).
 */
export function ShopCard({ icon, iconNode, name, blurb, level, max, faded, highlight, children }) {
  return (
    <div
      className="flex flex-col items-center text-center"
      style={{
        padding: u(12),
        borderRadius: u(10),
        border: `${u(5)} solid ${highlight ? '#ffd23a' : '#0b0c0e'}`,
        background: faded ? GRADIENTS.cardLocked : GRADIENTS.card,
        gap: u(4),
      }}
    >
      {iconNode || <Icon name={icon} size={u(84)} />}
      <span style={{ fontSize: u(name.length > 13 ? 26 : 32), lineHeight: 1.1 }}>
        <StrokeText stroke={u(6)} style={{ whiteSpace: 'normal' }}>
          {name}
        </StrokeText>
      </span>
      {blurb && (
        <span className="whitespace-normal" style={{ fontSize: u(18), minHeight: u(44) }}>
          <span style={BLURB_STYLE}>{blurb}</span>
        </span>
      )}
      {/* Whatever the description's length, the level row and button sit at the bottom,
          level with the neighbouring cards'. */}
      <div className="flex-1" />
      {max !== undefined && (
        <div className="flex w-full justify-center" style={{ gap: u(4), margin: `${u(2)} 0 ${u(4)}` }}>
          {Array.from({ length: max }, (_, i) => (
            <span key={i} style={{ width: u(Math.min(26, 220 / max)), height: u(12), borderRadius: u(4), background: i < level ? '#ffc21a' : '#3a3f4a', border: `${u(2)} solid #111` }} />
          ))}
        </div>
      )}
      {children}
    </div>
  )
}
