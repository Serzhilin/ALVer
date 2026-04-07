// app/src/components/charts/VotePie.jsx
import { tallyVotes } from './chartUtils'

const COLORS = ['#C4622D', 'rgba(255,255,255,0.4)', 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.09)']
const R = 14        // circle radius
const CX = 16       // centre x
const CY = 16       // centre y
const CIRCUMFERENCE = 2 * Math.PI * R  // ~87.96

/**
 * Compute SVG stroke-dasharray segments for a donut chart.
 * Each segment: stroke-dasharray="sliceLen remainingLen", stroke-dashoffset="-offsetSoFar"
 * We rotate the SVG -90deg so segments start at 12 o'clock.
 */
function buildSegments(entries, total) {
  let offset = 0
  return entries.map(([label, count], i) => {
    const slice = total > 0 ? (count / total) * CIRCUMFERENCE : 0
    const seg = { label, count, slice, offset, color: COLORS[i] ?? COLORS[COLORS.length - 1] }
    offset += slice
    return seg
  })
}

export default function VotePie({ poll }) {
  const tally = tallyVotes(poll)
  const entries = Object.entries(tally)
  const total = Object.values(tally).reduce((a, b) => a + b, 0)
  const segments = buildSegments(entries, total)
  const leadingPct = total > 0 ? Math.round((Math.max(...Object.values(tally)) / total) * 100) : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
      <svg width="130" height="130" viewBox="0 0 32 32" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
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
        {/* Centre label — counter-rotate to stay upright */}
        <text
          x={CX} y={CY + 1.8}
          textAnchor="middle"
          fill="white"
          fontSize="5"
          fontWeight="700"
          style={{ transform: `rotate(90deg)`, transformOrigin: `${CX}px ${CY}px` }}
        >
          {leadingPct}%
        </text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(([label, count], i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.95rem', color: 'rgba(255,255,255,0.8)' }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[i] ?? COLORS[COLORS.length - 1], flexShrink: 0 }} />
            <span>{label}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'white', paddingLeft: 16 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
