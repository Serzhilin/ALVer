import { useState, useEffect, useRef } from 'react'
import { useMeeting, getGreeting } from '../context/MeetingContext'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

export default function Display() {
  const { id } = useParams()
  const { meeting, activePoll, attendeeCount, setMeetingId } = useMeeting()
  const { t } = useTranslation()

  useEffect(() => { setMeetingId(id) }, [id])

  const [greeting, setGreeting] = useState(null)
  const [showGreeting, setShowGreeting] = useState(false)
  const [revealResult, setRevealResult] = useState(false)
  const prevCheckedIn = useRef(0)
  const prevActivePoll = useRef(null)
  const greetingTimer = useRef(null)

  // Detect new check-in
  useEffect(() => {
    if (!meeting) return
    const cur = meeting.checkedIn.length
    if (cur > prevCheckedIn.current) {
      const newest = meeting.checkedIn[meeting.checkedIn.length - 1]
      const g = getGreeting(newest.name.split(' ')[0])
      setGreeting(g)
      setShowGreeting(true)
      if (greetingTimer.current) clearTimeout(greetingTimer.current)
      greetingTimer.current = setTimeout(() => setShowGreeting(false), 3200)
    }
    prevCheckedIn.current = cur
  }, [meeting?.checkedIn])

  // Detect poll close -> reveal result
  useEffect(() => {
    if (!activePoll && prevActivePoll.current) {
      setRevealResult(true)
      setTimeout(() => setRevealResult(false), 8000)
    }
    prevActivePoll.current = activePoll?.id
  }, [activePoll])

  if (!meeting) return <div style={{ minHeight: '100vh', background: '#1A1612', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}>{t('common.loading')}</div>

  const phase = meeting.phase
  const isCheckin = phase === 'open'
  const isSession = phase === 'in_session'
  const isClosed = phase === 'closed' || phase === 'archived'

  // Find most recently closed poll
  const closedPolls = meeting.polls.filter(p => p.status === 'closed')
  const lastClosedPoll = closedPolls[closedPolls.length - 1]

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1A1612',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Background texture */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 30% 40%, rgba(196,98,45,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(212,136,74,0.05) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      {/* Greeting flash */}
      {showGreeting && greeting && (
        <div
          className="greeting-flash"
          style={{
            position: 'absolute', inset: 0,
            background: 'rgba(196,98,45,0.95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column',
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: '5rem', marginBottom: 24 }}>👋</div>
          <div style={{ fontSize: '4rem', fontFamily: 'Playfair Display, serif', fontWeight: 600, textAlign: 'center', padding: '0 60px', lineHeight: 1.2 }}>
            {greeting}
          </div>
        </div>
      )}

      {/* Check-in phase */}
      {isCheckin && !showGreeting && (
        <CheckinDisplay meeting={meeting} attendeeCount={attendeeCount} />
      )}

      {/* Active vote */}
      {isSession && activePoll && !showGreeting && (
        <VotingDisplay poll={activePoll} attendeeCount={attendeeCount} />
      )}

      {/* Result reveal */}
      {isSession && !activePoll && revealResult && lastClosedPoll?.result && !showGreeting && (
        <ResultDisplay poll={lastClosedPoll} />
      )}

      {/* Between agenda items */}
      {isSession && !activePoll && !revealResult && !showGreeting && (
        <BetweenItems meeting={meeting} attendeeCount={attendeeCount} />
      )}

      {/* Meeting closed */}
      {isClosed && !showGreeting && (
        <ClosedDisplay meeting={meeting} />
      )}

      {/* Corner info */}
      <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 32px', alignItems: 'center', opacity: 0.6 }}>
        <span style={{ fontSize: '0.8rem' }}>🏛️ ALVer</span>
        <LanguageSwitcher light />
        <span style={{ fontSize: '0.8rem' }}>{meeting.time} · {meeting.location}</span>
      </div>
    </div>
  )
}

function CheckinDisplay({ meeting, attendeeCount }) {
  const { t } = useTranslation()
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick(x => x + 1), 3000)
    return () => clearInterval(timer)
  }, [])

  const names = meeting.checkedIn.slice(-8).map(c => c.name.split(' ')[0])

  return (
    <div style={{ textAlign: 'center', width: '100%', maxWidth: 800 }}>
      {/* QR */}
      <div style={{ marginBottom: 40 }}>
        <QRPlaceholder />
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem', marginTop: 16 }}>
          {t('display.scan_checkin')}
        </p>
      </div>

      {/* Counter */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 48, marginBottom: 40 }}>
        <div>
          <div style={{ fontSize: '4rem', fontWeight: 700, color: 'white', lineHeight: 1 }}>{meeting.checkedIn.length}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginTop: 6 }}>{t('display.present')}</div>
        </div>
        <div style={{ width: 1, background: 'rgba(255,255,255,0.15)' }} />
        <div>
          <div style={{ fontSize: '4rem', fontWeight: 700, color: 'var(--color-amber)', lineHeight: 1 }}>{meeting.confirmedMandates.length}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', marginTop: 6 }}>{t('display.mandates')}</div>
        </div>
      </div>

      {/* Scrolling names */}
      {names.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
          {names.map((n, i) => (
            <span
              key={n + i}
              style={{
                padding: '6px 18px', background: 'rgba(255,255,255,0.1)', borderRadius: 24,
                fontSize: '1.1rem', color: 'rgba(255,255,255,0.85)',
              }}
            >
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function VotingDisplay({ poll, attendeeCount }) {
  const { t } = useTranslation()
  const totalVotes = Object.keys(poll.votes).length + poll.manualVotes.length
  const pct = attendeeCount > 0 ? Math.round((totalVotes / attendeeCount) * 100) : 0

  return (
    <div style={{ textAlign: 'center', maxWidth: 900, width: '100%', animation: 'slideIn 0.4s ease' }}>
      <div style={{ marginBottom: 16, color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {t('display.voting_open')}
      </div>
      <h1 style={{
        fontFamily: 'Playfair Display, serif', fontSize: '2.4rem', fontWeight: 600,
        color: 'white', lineHeight: 1.3, margin: '0 0 48px',
      }}>
        {poll.title}
      </h1>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 40, alignItems: 'center', marginBottom: 40 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '5rem', fontWeight: 700, color: 'var(--color-amber)', lineHeight: 1 }}>{totalVotes}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '1rem', marginTop: 8 }}>{t('display.of_total', { total: attendeeCount })}</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem' }}>{t('display.voted')}</div>
        </div>
      </div>

      {/* Progress */}
      <div style={{ maxWidth: 500, margin: '0 auto' }}>
        <div style={{ height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            background: 'linear-gradient(90deg, var(--color-terracotta), var(--color-amber))',
            width: `${pct}%`, transition: 'width 0.5s ease',
          }} />
        </div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: 8 }}>{pct}%</div>
      </div>

      <div style={{ marginTop: 32, display: 'flex', justifyContent: 'center', gap: 16 }}>
        {poll.options.map(opt => (
          <span key={opt} style={{
            padding: '8px 24px', borderRadius: 8,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
            fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)',
          }}>{opt}</span>
        ))}
      </div>
    </div>
  )
}

function ResultDisplay({ poll }) {
  const { t } = useTranslation()
  const [showBreakdown, setShowBreakdown] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowBreakdown(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{ textAlign: 'center', maxWidth: 900, width: '100%' }}>
      <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0 0 24px', fontSize: '0.9rem' }}>{poll.title}</p>

      <div className="reveal-result" style={{ marginBottom: 40 }}>
        <div style={{
          display: 'inline-block',
          padding: '24px 64px',
          borderRadius: 16,
          background: poll.result.aangenomen ? 'rgba(45,122,74,0.2)' : 'rgba(196,45,45,0.2)',
          border: `2px solid ${poll.result.aangenomen ? 'rgba(45,122,74,0.5)' : 'rgba(196,45,45,0.5)'}`,
        }}>
          <div style={{
            fontSize: '4rem', fontWeight: 700,
            color: poll.result.aangenomen ? '#4CAF81' : '#EF5350',
            fontFamily: 'Playfair Display, serif',
            letterSpacing: '-1px',
          }}>
            {poll.result.aangenomen ? t('results.adopted_display') : t('results.rejected_display')}
          </div>
        </div>
      </div>

      {showBreakdown && (
        <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'center', gap: 48 }}>
          {Object.entries(poll.result.tally).map(([opt, count]) => (
            <div key={opt} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', fontWeight: 700, color: 'white', lineHeight: 1 }}>{count}</div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.95rem', marginTop: 6 }}>{opt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BetweenItems({ meeting, attendeeCount }) {
  const { t } = useTranslation()
  return (
    <div style={{ textAlign: 'center', maxWidth: 800 }}>
      <div style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.4)', marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {meeting.name}
      </div>
      <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '3rem', color: 'white', margin: '0 0 40px' }}>
        {t('display.session_ongoing')}
      </h1>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
        <div>
          <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--color-amber)', lineHeight: 1 }}>{attendeeCount}</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', marginTop: 6 }}>{t('display.eligible')}</div>
        </div>
      </div>
    </div>
  )
}

function ClosedDisplay({ meeting }) {
  const { t } = useTranslation()
  const closedPolls = meeting.polls.filter(p => p.status === 'closed' && p.result)
  return (
    <div style={{ textAlign: 'center', maxWidth: 800, width: '100%' }}>
      <h1 style={{ fontFamily: 'Playfair Display, serif', fontSize: '2.5rem', color: 'white', margin: '0 0 12px' }}>
        {t('display.meeting_closed')}
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.4)', margin: '0 0 40px' }}>{meeting.name}</p>
      {closedPolls.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {closedPolls.map(poll => (
            <div key={poll.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 24px',
              background: 'rgba(255,255,255,0.06)', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', textAlign: 'left', flex: 1 }}>{poll.title}</span>
              <span style={{
                padding: '4px 16px', borderRadius: 6, fontWeight: 700, fontSize: '0.85rem', marginLeft: 20,
                background: poll.result.aangenomen ? 'rgba(45,122,74,0.2)' : 'rgba(196,45,45,0.2)',
                color: poll.result.aangenomen ? '#4CAF81' : '#EF5350',
                whiteSpace: 'nowrap',
              }}>
                {poll.result.aangenomen ? t('results.adopted_short') : t('results.rejected_short')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QRPlaceholder() {
  // Stable QR-like placeholder (no random)
  const cells = []
  const size = 9
  const pattern = [
    [1,1,1,1,1,1,1,0,1],
    [1,0,0,0,0,0,1,0,0],
    [1,0,1,1,1,0,1,0,1],
    [1,0,1,1,1,0,1,0,0],
    [1,0,1,1,1,0,1,0,1],
    [1,0,0,0,0,0,1,0,1],
    [1,1,1,1,1,1,1,0,0],
    [0,0,0,1,0,0,0,1,0],
    [1,0,1,0,1,1,0,0,1],
  ]
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const filled = pattern[r]?.[c] === 1
      cells.push(
        <rect key={`${r}-${c}`} x={c * 16} y={r * 16} width={14} height={14} rx={2}
          fill={filled ? 'white' : 'transparent'} opacity={filled ? 1 : 0} />
      )
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{
        background: 'white', padding: 16, borderRadius: 12,
        boxShadow: '0 0 40px rgba(196,98,45,0.3)',
      }}>
        <svg width={144} height={144} viewBox={`0 0 ${size * 16} ${size * 16}`} style={{ display: 'block' }}>
          <rect width={size * 16} height={size * 16} fill="white" />
          {cells}
        </svg>
      </div>
    </div>
  )
}
