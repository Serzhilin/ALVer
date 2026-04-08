// app/src/components/charts/VoteBar.jsx
import { tallyVotes, CHART_COLORS_NIGHT } from './chartUtils'

export default function VoteBar({ poll, colors = CHART_COLORS_NIGHT, isDark = true }) {
  const tally = tallyVotes(poll)
  const entries = Object.entries(tally)
  const max = Math.max(...Object.values(tally), 1)
  const labelColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)'
  const countColor = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.7)'
  const trackColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)'

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {entries.map(([label, count], i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 110, textAlign: 'right', fontSize: '0.9rem', color: labelColor, flexShrink: 0 }}>
            {label}
          </span>
          <div style={{ flex: 1, height: 36, background: trackColor, borderRadius: 7, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.round((count / max) * 100)}%`,
              background: colors[i] ?? colors[colors.length - 1],
              borderRadius: 7,
              display: 'flex', alignItems: 'center', paddingLeft: 10,
              fontSize: '0.9rem', fontWeight: 700, color: 'white',
              transition: 'width 0.5s ease',
              minWidth: count > 0 ? 36 : 0,
            }}>
              {count > 0 ? count : ''}
            </div>
          </div>
          <span style={{ width: 28, textAlign: 'right', fontSize: '0.95rem', fontWeight: 700, color: countColor, flexShrink: 0 }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  )
}
