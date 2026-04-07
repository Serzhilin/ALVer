import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useMeeting, getGreeting } from '../context/MeetingContext'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useCommunity } from '../context/CommunityContext'
import AgendaHtml from '../components/AgendaHtml'
import VoteBar     from '../components/charts/VoteBar'
import VotePie     from '../components/charts/VotePie'
import VoteBubbles from '../components/charts/VoteBubbles'

export default function Display() {
  const { id } = useParams()
  const { meeting, activePoll, attendeeCount, sseConnected, setMeetingId, displayMode } = useMeeting()
  const { community } = useCommunity() || {}
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
  const isClosed = phase === 'archived'

  // Find most recently closed poll
  const closedPolls = meeting.polls.filter(p => p.status === 'closed')
  const lastClosedPoll = closedPolls[closedPolls.length - 1]

  return (
    <div style={{
      minHeight: '100vh',
      background: isCheckin ? 'var(--color-cream)' : '#1A1612',
      color: isCheckin ? 'var(--color-charcoal)' : 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'Inter, sans-serif',
    }}>
      {/* Background texture — dark mode only */}
      {!isCheckin && <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 30% 40%, rgba(196,98,45,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(212,136,74,0.05) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />}

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
          <div style={{ fontSize: '4rem', fontFamily: 'var(--font-title)', fontWeight: 600, textAlign: 'center', padding: '0 60px', lineHeight: 1.2 }}>
            {greeting}
          </div>
        </div>
      )}

      {/* Check-in phase */}
      {isCheckin && !showGreeting && (
        <CheckinDisplay meeting={meeting} attendeeCount={attendeeCount} community={community} meetingId={id} communitySlug={community?.slug} dark={false} />
      )}

      {/* Active vote */}
      {isSession && activePoll && !showGreeting && (
        <VotingDisplay poll={activePoll} attendeeCount={attendeeCount} displayMode={displayMode} />
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

      {/* Language switcher — top right */}
      <div style={{ position: 'absolute', top: 20, right: 24 }}>
        <LanguageSwitcher light={!isCheckin} />
      </div>

      {/* SSE reconnection indicator */}
      {!sseConnected && (
        <div style={{ position: 'absolute', top: 16, right: 100, background: 'rgba(245,158,11,0.9)', color: 'white', borderRadius: 6, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 500 }}>
          {t('common.reconnecting')}
        </div>
      )}

      {/* Bottom left brand tag */}
      <div style={{ position: 'absolute', bottom: 20, left: 32, opacity: 0.4, fontSize: '0.8rem' }}>
        🏛️ ALVer
      </div>
    </div>
  )
}

function CheckinDisplay({ meeting, attendeeCount, community, meetingId, communitySlug, dark = true }) {
  const { t, i18n } = useTranslation()
  const [qrDataUrl, setQrDataUrl] = useState(null)

  // Color tokens — swap based on background
  const c = dark ? {
    title:      'white',
    meta:       'rgba(255,255,255,0.7)',
    muted:      'rgba(255,255,255,0.35)',
    faint:      'rgba(255,255,255,0.6)',
    divider:    'rgba(255,255,255,0.1)',
    agendaText: 'rgba(255,255,255,0.65)',
    statMain:   'white',
    statDim:    'rgba(255,255,255,0.5)',
    statLabel:  'rgba(255,255,255,0.4)',
  } : {
    title:      'var(--color-charcoal)',
    meta:       'var(--color-charcoal-light)',
    muted:      'var(--color-charcoal-light)',
    faint:      'var(--color-charcoal-light)',
    divider:    'var(--color-sand)',
    agendaText: 'var(--color-charcoal)',
    statMain:   'var(--color-charcoal)',
    statDim:    'var(--color-charcoal-light)',
    statLabel:  'var(--color-charcoal-light)',
  }

  useEffect(() => {
    const base = import.meta.env.VITE_PUBLIC_ALVER_BASE_URL || window.location.origin
    const url = `${base}/${communitySlug}/meeting/${meetingId}/attend`
    QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: '#1A1612', light: '#ffffff' } })
      .then(setQrDataUrl)
      .catch(console.error)
  }, [meetingId, communitySlug])

  const dateLocale = i18n.language === 'nl' ? 'nl-NL' : 'en-GB'
  const dateStr = meeting.date
    ? new Date(meeting.date + 'T12:00').toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })
    : null

  const expectedCount = (meeting.preRegistrations || []).length

  return (
    <div style={{ width: '100%', maxWidth: 1200, display: 'flex', flexDirection: 'column', gap: 40 }}>
      {/* Logo */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {community?.logo_url
          ? <img src={community.logo_url} alt="logo" style={{ height: 80, maxWidth: 320, objectFit: 'contain' }} />
          : <div style={{ fontFamily: 'var(--font-title)', fontWeight: 700, fontSize: '2rem', color: c.title, opacity: 0.8 }}>🏛️ ALVer</div>
        }
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'start' }}>

        {/* Left: QR + stats */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 36 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ background: 'white', padding: 20, borderRadius: 16, boxShadow: '0 0 60px rgba(196,98,45,0.25)' }}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR check-in" width={200} height={200} style={{ display: 'block' }} />
                : <div style={{ width: 200, height: 200, background: 'rgba(0,0,0,0.04)', borderRadius: 4 }} />
              }
            </div>
            <p style={{ color: c.faint, fontSize: '1rem', margin: 0, textAlign: 'center' }}>
              {t('display.scan_checkin')}
            </p>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Stat value={expectedCount} label={t('facilitate.expected')} color={c.statDim} labelColor={c.statLabel} />
            <div style={{ width: 1, background: c.divider }} />
            <Stat value={meeting.checkedIn.length} label={t('display.present')} color="var(--color-terracotta)" labelColor={c.statLabel} />
            <div style={{ width: 1, background: c.divider }} />
            <Stat value={meeting.confirmedMandates.length} label={t('display.mandates')} color={c.statMain} labelColor={c.statLabel} />
          </div>
        </div>

        {/* Right: event info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '2.2rem', color: c.title, margin: 0, lineHeight: 1.2 }}>
            {meeting.name}
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {dateStr && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: c.meta, fontSize: '1.05rem' }}>
                <span>📅</span><span>{dateStr}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: c.meta, fontSize: '1.05rem' }}>
              <span>🕐</span><span>{meeting.time}</span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', color: c.meta, fontSize: '1.05rem' }}>
              <span>📍</span><span>{meeting.location}</span>
            </div>
          </div>

          {meeting.agenda && (
            <div style={{ borderTop: `1px solid ${c.divider}`, paddingTop: 24 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14 }}>
                {t('common.agenda')}
              </div>
              <AgendaHtml html={meeting.agenda} style={{ fontSize: '0.95rem', color: c.agendaText, lineHeight: 1.9 }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, color, labelColor }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '3.5rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ color: labelColor, fontSize: '0.85rem', marginTop: 6 }}>{label}</div>
    </div>
  )
}

function VotingDisplay({ poll, attendeeCount, displayMode }) {
  const { t } = useTranslation()
  const totalVotes = Object.keys(poll.votes).length + (poll.onBehalfVoters?.size ?? 0)
  const pct = attendeeCount > 0 ? Math.round((totalVotes / attendeeCount) * 100) : 0

  return (
    <div style={{ textAlign: 'center', maxWidth: 900, width: '100%', animation: 'slideIn 0.4s ease' }}>
      <div style={{ marginBottom: 16, color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {t('display.voting_open')}
      </div>
      <h1 style={{
        fontFamily: 'var(--font-title)', fontSize: '2.4rem', fontWeight: 600,
        color: 'white', lineHeight: 1.3, margin: '0 0 40px',
      }}>
        {poll.title}
      </h1>

      {/* Progress indicator — shown in all modes */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-amber)', lineHeight: 1 }}>
          {totalVotes} <span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>{t('display.of_total', { total: attendeeCount })}</span>
        </div>
        <div style={{ maxWidth: 400, margin: '12px auto 0' }}>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 3,
              background: 'linear-gradient(90deg, var(--color-terracotta), var(--color-amber))',
              width: `${pct}%`, transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', marginTop: 6 }}>{pct}%</div>
        </div>
      </div>

      {/* Chart area — switches by displayMode */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {displayMode === 'bars'    && <VoteBar     poll={poll} attendeeCount={attendeeCount} />}
        {displayMode === 'pie'     && <VotePie     poll={poll} attendeeCount={attendeeCount} />}
        {displayMode === 'bubbles' && <VoteBubbles poll={poll} attendeeCount={attendeeCount} />}
        {(displayMode === 'numbers' || !displayMode) && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            {poll.options.map(opt => (
              <span key={opt} style={{
                padding: '8px 24px', borderRadius: 8,
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                fontSize: '1.1rem', color: 'rgba(255,255,255,0.6)',
              }}>{opt}</span>
            ))}
          </div>
        )}
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
      <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '3rem', color: 'white', margin: '0 0 40px' }}>
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
      <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '2.5rem', color: 'white', margin: '0 0 12px' }}>
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

