import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useMeeting, getGreeting } from '../context/MeetingContext'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCommunity } from '../context/CommunityContext'
import AgendaHtml from '../components/AgendaHtml'
import VoteBar     from '../components/charts/VoteBar'
import VotePie     from '../components/charts/VotePie'
import VoteBubbles from '../components/charts/VoteBubbles'
import { CHART_COLORS_NIGHT, CHART_COLORS_DAY } from '../components/charts/chartUtils'

export default function Display() {
  const { id } = useParams()
  const { meeting, activePoll, attendeeCount, sseConnected, setMeetingId, displayMode, screenTheme, screenLanguage } = useMeeting()
  const { community } = useCommunity() || {}
  const { t, i18n } = useTranslation()

  useEffect(() => { setMeetingId(id) }, [id])

  // Propagate facilitator's language selection to this tab
  useEffect(() => {
    if (screenLanguage) i18n.changeLanguage(screenLanguage)
  }, [screenLanguage])

  const [greeting, setGreeting] = useState(null)
  const [showGreeting, setShowGreeting] = useState(false)
  const [revealResult, setRevealResult] = useState(false)
  const prevCheckedIn = useRef(null)   // null = not yet initialized (prevents stale greeting on load)
  const prevActivePoll = useRef(null)
  const greetingTimer = useRef(null)

  // Detect new check-in — initialize silently on first render
  useEffect(() => {
    if (!meeting) return
    const cur = meeting.checkedIn.length
    if (prevCheckedIn.current === null) {
      prevCheckedIn.current = cur
      return
    }
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

  if (!meeting) return <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</div>

  const phase = meeting.phase
  const isCheckin = phase === 'open'
  const isSession = phase === 'in_session'
  const isClosed  = phase === 'archived'

  const isDark = screenTheme === 'night'
  const theme = isDark
    ? { bg: '#1A1612', text: 'white', muted: 'rgba(255,255,255,0.5)' }
    : { bg: 'var(--color-cream)', text: 'var(--color-charcoal)', muted: 'rgba(44,42,39,0.45)' }

  const chartColors = isDark ? CHART_COLORS_NIGHT : CHART_COLORS_DAY

  // Find most recently closed poll
  const closedPolls = meeting.polls.filter(p => p.status === 'closed')
  const lastClosedPoll = closedPolls[closedPolls.length - 1]

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: theme.bg,
      color: theme.text,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '3vw',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'Inter, sans-serif',
      fontSize: '1.2vw',
    }}>
      {/* Background texture — night mode only */}
      {isDark && <div style={{
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
          <div style={{ fontSize: '8vw', marginBottom: '3vh' }}>👋</div>
          <div style={{ fontSize: '6vw', fontFamily: 'var(--font-title)', fontWeight: 600, textAlign: 'center', padding: '0 8vw', lineHeight: 1.2 }}>
            {greeting}
          </div>
        </div>
      )}

      {/* Check-in phase */}
      {isCheckin && !showGreeting && (
        <CheckinDisplay meeting={meeting} attendeeCount={attendeeCount} community={community} meetingId={id} communitySlug={community?.slug} dark={isDark} />
      )}

      {/* Active vote */}
      {isSession && activePoll && !showGreeting && (
        <VotingDisplay poll={activePoll} attendeeCount={attendeeCount} displayMode={displayMode} community={community} chartColors={chartColors} isDark={isDark} />
      )}

      {/* Result reveal */}
      {isSession && !activePoll && revealResult && lastClosedPoll?.result && !showGreeting && (
        <ResultDisplay poll={lastClosedPoll} community={community} isDark={isDark} />
      )}

      {/* Between agenda items */}
      {isSession && !activePoll && !revealResult && !showGreeting && (
        <BetweenItems meeting={meeting} attendeeCount={attendeeCount} community={community} isDark={isDark} />
      )}

      {/* Draft — just the logo */}
      {phase === 'draft' && !showGreeting && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {community?.logo_url
            ? <img src={community.logo_url} alt="logo" style={{ height: '20vh', maxWidth: '40vw', objectFit: 'contain', opacity: 0.7 }} />
            : <img src="/logo.png" alt="ALVer" style={{ height: '20vh', maxWidth: '40vw', objectFit: 'contain', opacity: 0.4 }} />
          }
        </div>
      )}

      {/* Meeting closed */}
      {isClosed && !showGreeting && (
        <ClosedDisplay meeting={meeting} isDark={isDark} />
      )}

      {/* SSE reconnection indicator */}
      {!sseConnected && (
        <div style={{ position: 'absolute', top: 16, right: 24, background: 'rgba(245,158,11,0.9)', color: 'white', borderRadius: 6, padding: '4px 12px', fontSize: '0.75rem', fontWeight: 500 }}>
          {t('common.reconnecting')}
        </div>
      )}

      {/* Bottom left brand tag */}
      <div style={{ position: 'absolute', bottom: 20, left: 32, opacity: 0.35 }}>
        <img src="/logo.png" alt="ALVer" style={{ height: 28, objectFit: 'contain' }} />
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
    <div style={{ width: '90vw', display: 'flex', flexDirection: 'column', gap: '4vh' }}>
      {/* Logo */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {community?.logo_url
          ? <img src={community.logo_url} alt="logo" style={{ height: '8vh', maxWidth: '25vw', objectFit: 'contain' }} />
          : <img src="/logo.png" alt="ALVer" style={{ height: '8vh', maxWidth: '25vw', objectFit: 'contain', opacity: 0.8 }} />
        }
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5vw', alignItems: 'start' }}>

        {/* Left: QR + stats */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4vh' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2vh' }}>
            <div style={{ background: 'white', padding: '2vw', borderRadius: 16, boxShadow: '0 0 60px rgba(196,98,45,0.25)' }}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR check-in" style={{ display: 'block', width: '18vw', height: '18vw' }} />
                : <div style={{ width: '18vw', height: '18vw', background: 'rgba(0,0,0,0.04)', borderRadius: 4 }} />
              }
            </div>
            <p style={{ color: c.faint, fontSize: '1.4vw', margin: 0, textAlign: 'center' }}>
              {t('display.scan_checkin')}
            </p>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '3vw', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Stat value={expectedCount} label={t('facilitate.expected')} color={c.statDim} labelColor={c.statLabel} />
            <div style={{ width: 1, background: c.divider }} />
            <Stat value={meeting.checkedIn.length} label={t('display.present')} color="var(--color-terracotta)" labelColor={c.statLabel} />
            <div style={{ width: 1, background: c.divider }} />
            <Stat value={meeting.confirmedMandates.length} label={t('display.mandates')} color={c.statMain} labelColor={c.statLabel} />
          </div>
        </div>

        {/* Right: event info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3vh' }}>
          <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '3.5vw', color: c.title, margin: 0, lineHeight: 1.2 }}>
            {meeting.name}
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5vh' }}>
            {dateStr && (
              <div style={{ display: 'flex', gap: '1vw', alignItems: 'center', color: c.meta, fontSize: '1.6vw' }}>
                <span>📅</span><span>{dateStr}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '1vw', alignItems: 'center', color: c.meta, fontSize: '1.6vw' }}>
              <span>🕐</span><span>{meeting.time}{meeting.end_time ? ` – ${meeting.end_time}` : ''}</span>
            </div>
            <div style={{ display: 'flex', gap: '1vw', alignItems: 'center', color: c.meta, fontSize: '1.6vw' }}>
              <span>📍</span><span>{meeting.location}</span>
            </div>
          </div>

          {meeting.agenda && (
            <div style={{ borderTop: `1px solid ${c.divider}`, paddingTop: '2vh' }}>
              <div style={{ fontSize: '1vw', fontWeight: 600, color: c.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1.5vh' }}>
                {t('common.agenda')}
              </div>
              <AgendaHtml html={meeting.agenda} style={{ fontSize: '1.4vw', color: c.agendaText, lineHeight: 1.9 }} />
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
      <div style={{ fontSize: '5vw', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ color: labelColor, fontSize: '1.2vw', marginTop: '0.8vh' }}>{label}</div>
    </div>
  )
}

function VotingDisplay({ poll, attendeeCount, displayMode, community, chartColors, isDark }) {
  const { t } = useTranslation()
  const totalVotes = Object.keys(poll.votes).length + (poll.onBehalfVoters?.size ?? 0)
  const pct = attendeeCount > 0 ? Math.round((totalVotes / attendeeCount) * 100) : 0
  const textColor = isDark ? 'white' : 'var(--color-charcoal)'
  const mutedColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(44,42,39,0.45)'
  const trackColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(44,42,39,0.12)'

  return (
    <div style={{ width: '70vw', display: 'flex', flexDirection: 'column', gap: 0, animation: 'slideIn 0.4s ease' }}>
      {/* Logo — centered, top */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '3vh' }}>
        {community?.logo_url
          ? <img src={community.logo_url} alt="logo" style={{ height: '7vh', maxWidth: '20vw', objectFit: 'contain' }} />
          : <img src="/logo.png" alt="ALVer" style={{ height: '7vh', maxWidth: '20vw', objectFit: 'contain', opacity: 0.7 }} />
        }
      </div>

      {/* Poll title */}
      <h1 style={{
        fontFamily: 'var(--font-title)',
        fontSize: '3.5vw',
        fontWeight: 600,
        color: textColor,
        lineHeight: 1.2,
        margin: '0 0 3vh',
        textAlign: 'center',
      }}>
        {poll.title}
      </h1>

      {/* Vote count + progress bar */}
      <div style={{ marginBottom: '4vh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1vh' }}>
          <div style={{ fontSize: '2vw', fontWeight: 700, color: textColor, lineHeight: 1 }}>
            {totalVotes} <span style={{ fontSize: '1.2vw', color: mutedColor, fontWeight: 400 }}>{t('display.of_total', { total: attendeeCount })}</span>
          </div>
          <div style={{ color: mutedColor, fontSize: '1.2vw' }}>{pct}%</div>
        </div>
        <div style={{ height: '0.8vh', background: trackColor, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            background: 'linear-gradient(90deg, var(--color-terracotta), var(--color-amber))',
            width: `${pct}%`, transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {/* Chart area — full width of container */}
      <div style={{ width: '100%' }}>
        {displayMode === 'bars'    && <VoteBar     poll={poll} colors={chartColors} isDark={isDark} />}
        {displayMode === 'pie'     && <VotePie     poll={poll} colors={chartColors} isDark={isDark} />}
        {displayMode === 'bubbles' && <VoteBubbles poll={poll} colors={chartColors} isDark={isDark} />}
        {(displayMode === 'numbers' || !displayMode) && (() => {
          const tally = Object.fromEntries(poll.options.map(o => [o, 0]))
          for (const optionId of Object.values(poll.votes ?? {})) {
            const idx = poll._optionIds?.indexOf(optionId)
            if (idx != null && idx !== -1) tally[poll.options[idx]]++
          }
          return (
            <div style={{ display: 'flex', gap: '2vw', flexWrap: 'wrap', justifyContent: 'center' }}>
              {poll.options.map((opt, i) => (
                <div key={opt} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5vh',
                  padding: '3vh 4vw', borderRadius: 16,
                  background: chartColors[i] ?? chartColors[chartColors.length - 1],
                  minWidth: '10vw',
                }}>
                  <span style={{ fontSize: '6vw', fontWeight: 700, color: isDark ? 'white' : 'black', lineHeight: 1 }}>
                    {tally[opt]}
                  </span>
                  <span style={{ fontSize: '1.5vw', color: isDark ? 'white' : 'black' }}>
                    {opt}
                  </span>
                </div>
              ))}
            </div>
          )
        })()}
      </div>
    </div>
  )
}

function ResultDisplay({ poll, community, isDark }) {
  const { t } = useTranslation()
  const [showBreakdown, setShowBreakdown] = useState(false)
  const textColor = isDark ? 'white' : 'var(--color-charcoal)'
  const mutedColor = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(44,42,39,0.45)'

  useEffect(() => {
    const timer = setTimeout(() => setShowBreakdown(true), 2000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{ width: '80vw' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0 4vh', gap: '2vw' }}>
        <div style={{ flexShrink: 0 }}>
          {community?.logo_url
            ? <img src={community.logo_url} alt="logo" style={{ height: '6vh', maxWidth: '15vw', objectFit: 'contain' }} />
            : <img src="/logo.png" alt="ALVer" style={{ height: '6vh', maxWidth: '15vw', objectFit: 'contain', opacity: 0.7 }} />
          }
        </div>
        <p style={{ color: mutedColor, margin: 0, fontSize: '1.4vw', flex: 1, textAlign: 'center' }}>{poll.title}</p>
        <div style={{ width: '15vw', flexShrink: 0 }} />
      </div>

      {showBreakdown && (
        <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'center', gap: '5vw', flexWrap: 'wrap' }}>
          {Object.entries(poll.result.tally).map(([opt, count]) => (
            <div key={opt} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '7vw', fontWeight: 700, color: textColor, lineHeight: 1 }}>{count}</div>
              <div style={{ color: mutedColor, fontSize: '1.5vw', marginTop: '1vh' }}>{opt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BetweenItems({ meeting, attendeeCount, community, isDark }) {
  const { t } = useTranslation()
  const textColor = isDark ? 'white' : 'var(--color-charcoal)'
  const mutedColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(44,42,39,0.45)'
  const amberColor = isDark ? 'var(--color-amber)' : 'var(--color-terracotta)'

  return (
    <div style={{ textAlign: 'center', width: '60vw' }}>
      {community?.logo_url && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '3vh' }}>
          <img src={community.logo_url} alt="logo" style={{ height: '7vh', maxWidth: '20vw', objectFit: 'contain' }} />
        </div>
      )}
      <div style={{ fontSize: '1.2vw', color: mutedColor, marginBottom: '2vh', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {meeting.name}
      </div>
      <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '4vw', color: textColor, margin: '0 0 5vh' }}>
        {t('display.session_ongoing')}
      </h1>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '4vw' }}>
        <div>
          <div style={{ fontSize: '5vw', fontWeight: 700, color: amberColor, lineHeight: 1 }}>{attendeeCount}</div>
          <div style={{ color: mutedColor, fontSize: '1.2vw', marginTop: '1vh' }}>{t('display.eligible')}</div>
        </div>
      </div>
    </div>
  )
}

function ClosedDisplay({ meeting, isDark }) {
  const { t } = useTranslation()
  const textColor = isDark ? 'white' : 'var(--color-charcoal)'
  const mutedColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(44,42,39,0.45)'
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(44,42,39,0.05)'
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(44,42,39,0.1)'
  const closedPolls = meeting.polls.filter(p => p.status === 'closed' && p.result)

  return (
    <div style={{ textAlign: 'center', width: '60vw' }}>
      <h1 style={{ fontFamily: 'var(--font-title)', fontSize: '3.5vw', color: textColor, margin: '0 0 1vh' }}>
        {t('display.meeting_closed')}
      </h1>
      <p style={{ color: mutedColor, margin: '0 0 4vh', fontSize: '1.4vw' }}>{meeting.name}</p>
      {closedPolls.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {closedPolls.map(poll => (
            <div key={poll.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 24px',
              background: cardBg, borderRadius: 10,
              border: `1px solid ${cardBorder}`,
            }}>
              <span style={{ fontSize: '0.9rem', color: mutedColor, textAlign: 'left', flex: 1 }}>{poll.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
