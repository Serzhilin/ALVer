// app/src/components/charts/VoteBubbles.jsx
import { tallyVotes } from './chartUtils'

const MAX_RADIUS = 80   // px, largest possible bubble diameter
const MIN_RADIUS = 28   // px, minimum so even 0-vote options are visible
const COLORS = ['#C4622D', 'rgba(255,255,255,0.30)', 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0.08)']

export default function VoteBubbles({ poll }) {
  const tally = tallyVotes(poll)
  const entries = Object.entries(tally)
  const maxCount = Math.max(...Object.values(tally), 1)

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', justifyContent: 'center', flexWrap: 'wrap' }}>
      {entries.map(([label, count], i) => {
        // Area proportional to count; sqrt so radius scales by sqrt(ratio)
        const ratio = count / maxCount
        const diameter = Math.max(MIN_RADIUS, Math.round(MAX_RADIUS * Math.sqrt(ratio)))
        const fontSize = diameter > 60 ? '1.8rem' : diameter > 40 ? '1.2rem' : '0.85rem'

        return (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: diameter,
              height: diameter,
              borderRadius: '50%',
              background: COLORS[i] ?? COLORS[COLORS.length - 1],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, color: 'white', fontSize,
              transition: 'width 0.4s ease, height 0.4s ease',
              flexShrink: 0,
            }}>
              {count}
            </div>
            <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
