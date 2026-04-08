// app/src/components/charts/VoteBubbles.jsx
import { tallyVotes, CHART_COLORS_NIGHT } from './chartUtils'

const MAX_RADIUS = 100  // px, largest possible bubble diameter
const MIN_RADIUS = 32   // px, minimum so even 0-vote options are visible

export default function VoteBubbles({ poll, colors = CHART_COLORS_NIGHT, isDark = true }) {
  const tally = tallyVotes(poll)
  const entries = Object.entries(tally)
  const maxCount = Math.max(...Object.values(tally), 1)
  const labelColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)'

  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-end', justifyContent: 'center', flexWrap: 'wrap' }}>
      {entries.map(([label, count], i) => {
        const ratio = count / maxCount
        const diameter = Math.max(MIN_RADIUS, Math.round(MAX_RADIUS * Math.sqrt(ratio)))
        const fontSize = diameter > 70 ? '2rem' : diameter > 48 ? '1.3rem' : '0.9rem'

        return (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: diameter,
              height: diameter,
              borderRadius: '50%',
              background: colors[i] ?? colors[colors.length - 1],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: 'white', fontSize,
              transition: 'width 0.4s ease, height 0.4s ease',
              flexShrink: 0,
            }}>
              {count}
            </div>
            <span style={{ fontSize: '0.9rem', color: labelColor, textAlign: 'center' }}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
