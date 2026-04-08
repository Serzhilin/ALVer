// app/src/components/charts/VotePie.jsx
import { tallyVotes, CHART_COLORS_NIGHT } from './chartUtils'

const R = 14        // circle radius
const CX = 16       // centre x
const CY = 16       // centre y
const CIRCUMFERENCE = 2 * Math.PI * R  // ~87.96

function buildSegments(entries, total, colors) {
  let offset = 0
  return entries.map(([label, count], i) => {
    const slice = total > 0 ? (count / total) * CIRCUMFERENCE : 0
    const seg = { label, count, slice, offset, color: colors[i] ?? colors[colors.length - 1] }
    offset += slice
    return seg
  })
}

export default function VotePie({ poll, colors = CHART_COLORS_NIGHT, isDark = true }) {
  const tally = tallyVotes(poll)
  const entries = Object.entries(tally)
  const total = Object.values(tally).reduce((a, b) => a + b, 0)
  const segments = buildSegments(entries, total, colors)
  const maxCount = Math.max(...Object.values(tally))
  const winners = Object.values(tally).filter(c => c === maxCount)
  const isTie = total > 0 && winners.length > 1
  const leadingPct = total > 0 && !isTie ? Math.round((maxCount / total) * 100) : null
  const textColor = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)'
  const boldColor = isDark ? 'white' : 'black'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
      <div style={{ width: 130, height: 130, flexShrink: 0 }}>
        <svg width="130" height="130" viewBox="0 0 32 32"
          style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
          {segments.map(seg => (
            <circle
              key={seg.label}
              r={R} cx={CX} cy={CY}
              fill="transparent"
              stroke={seg.color}
              strokeWidth={6}
              strokeDasharray={`${seg.slice.toFixed(2)} ${(CIRCUMFERENCE - seg.slice).toFixed(2)}`}
              strokeDashoffset={`-${seg.offset.toFixed(2)}`}
            />
          ))}
          <text
            x={CX} y={CY + 1.8}
            textAnchor="middle"
            fill={boldColor}
            fontSize="5"
            fontWeight="700"
            style={{ transform: `rotate(90deg)`, transformOrigin: `${CX}px ${CY}px` }}
          >
            {leadingPct !== null ? `${leadingPct}%` : '='}
          </text>
        </svg>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(([label, count], i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.95rem', color: textColor }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: colors[i] ?? colors[colors.length - 1], flexShrink: 0 }} />
            <span>{label}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 700, color: boldColor, paddingLeft: 16 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
