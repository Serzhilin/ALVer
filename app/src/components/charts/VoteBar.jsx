// app/src/components/charts/VoteBar.jsx
import { tallyVotes } from './chartUtils'

const COLORS = [
  'linear-gradient(90deg, #C4622D, #D4884A)',
  'rgba(255,255,255,0.22)',
  'rgba(255,255,255,0.12)',
  'rgba(255,255,255,0.08)',
]

export default function VoteBar({ poll }) {
  const tally = tallyVotes(poll)
  const entries = Object.entries(tally)
  const max = Math.max(...Object.values(tally), 1)

  return (
    <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {entries.map(([label, count], i) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 90, textAlign: 'right', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>
            {label}
          </span>
          <div style={{ flex: 1, height: 32, background: 'rgba(255,255,255,0.07)', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.round((count / max) * 100)}%`,
              background: COLORS[i] ?? COLORS[COLORS.length - 1],
              borderRadius: 7,
              display: 'flex', alignItems: 'center', paddingLeft: 10,
              fontSize: '0.9rem', fontWeight: 700, color: 'white',
              transition: 'width 0.5s ease',
              minWidth: count > 0 ? 32 : 0,
            }}>
              {count > 0 ? count : ''}
            </div>
          </div>
          <span style={{ width: 24, textAlign: 'right', fontSize: '0.95rem', fontWeight: 700, color: 'rgba(255,255,255,0.75)', flexShrink: 0 }}>
            {count}
          </span>
        </div>
      ))}
    </div>
  )
}
