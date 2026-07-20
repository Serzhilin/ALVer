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
import { Loading } from '@ecommons/ui'
import styles from './Display.module.css'

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

  if (!meeting) return (
    <div className={styles.displayLoading}>
      <Loading>{t('common.loading')}</Loading>
    </div>
  )

  const phase = meeting.phase
  const isCheckin = phase === 'open'
  const isSession = phase === 'in_session'
  const isClosed  = phase === 'archived'

  const isDark = screenTheme === 'night'
  const theme = isDark
    ? { bg: '#1A1612', text: 'white' }
    : { bg: 'var(--color-cream)', text: 'var(--color-charcoal)' }

  const chartColors = isDark ? CHART_COLORS_NIGHT : CHART_COLORS_DAY

  // Find most recently closed poll
  const closedPolls = meeting.polls.filter(p => p.status === 'closed')
  const lastClosedPoll = closedPolls[closedPolls.length - 1]

  return (
    <div className={styles.displayRoot} style={{ background: theme.bg, color: theme.text }}>
      {/* Background texture — night mode only */}
      {isDark && <div className={styles.nightOverlay} />}

      {/* Greeting flash */}
      {showGreeting && greeting && (
        <div className={styles.greetingFlash}>
          <div className={styles.greetingEmoji}>👋</div>
          <div className={styles.greetingText}>{greeting}</div>
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
        <div className={styles.draftLogoWrapper}>
          {community?.logo_url
            ? <img src={community.logo_url} alt="logo" className={styles.draftLogo} />
            : <img src="/logo.png" alt="ALVer" className={styles.draftLogoFallback} />
          }
        </div>
      )}

      {/* Meeting closed */}
      {isClosed && !showGreeting && (
        <ClosedDisplay meeting={meeting} isDark={isDark} />
      )}

      {/* SSE reconnection indicator */}
      {!sseConnected && (
        <div className={styles.reconnectBadge}>
          {t('common.reconnecting')}
        </div>
      )}

      {/* Bottom left brand tag */}
      <div className={styles.brandTag}>
        <img src="/logo.png" alt="ALVer" className={styles.brandLogo} />
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
    <div className={styles.checkinRoot}>
      {/* Logo */}
      <div className={styles.checkinLogoRow}>
        {community?.logo_url
          ? <img src={community.logo_url} alt="logo" className={styles.checkinLogo} />
          : <img src="/logo.png" alt="ALVer" className={styles.checkinLogoFallback} />
        }
      </div>

      {/* Two columns */}
      <div className={styles.checkinCols}>

        {/* Left: QR + stats */}
        <div className={styles.checkinLeft}>
          <div className={styles.checkinQrOuter}>
            <div className={styles.checkinQrFrame}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="QR check-in" className={styles.checkinQrImg} />
                : <div className={styles.checkinQrPlaceholder} />
              }
            </div>
            <p className={styles.checkinScanText} style={{ color: c.faint }}>
              {t('display.scan_checkin')}
            </p>
          </div>

          {/* Stats */}
          <div className={styles.checkinStats}>
            <Stat value={expectedCount} label={t('facilitate.expected')} color={c.statDim} labelColor={c.statLabel} />
            <div className={styles.statDivider} style={{ background: c.divider }} />
            <Stat value={meeting.checkedIn.length} label={t('display.present')} color="var(--color-terracotta)" labelColor={c.statLabel} />
            <div className={styles.statDivider} style={{ background: c.divider }} />
            <Stat value={meeting.confirmedMandates.length} label={t('display.mandates')} color={c.statMain} labelColor={c.statLabel} />
          </div>
        </div>

        {/* Right: event info */}
        <div className={styles.checkinRight}>
          <h1 className={styles.checkinTitle} style={{ color: c.title }}>
            {meeting.name}
          </h1>

          <div className={styles.checkinMetaList}>
            {dateStr && (
              <div className={styles.checkinMetaRow} style={{ color: c.meta }}>
                <span>📅</span><span>{dateStr}</span>
              </div>
            )}
            <div className={styles.checkinMetaRow} style={{ color: c.meta }}>
              <span>🕐</span><span>{meeting.time}{meeting.end_time ? ` – ${meeting.end_time}` : ''}</span>
            </div>
            <div className={styles.checkinMetaRow} style={{ color: c.meta }}>
              <span>📍</span><span>{meeting.location}</span>
            </div>
          </div>

          {meeting.agenda && (
            <div className={styles.checkinAgendaSection} style={{ borderTop: `1px solid ${c.divider}` }}>
              <div className={styles.checkinAgendaLabel} style={{ color: c.muted }}>
                {t('common.agenda')}
              </div>
              <div className={styles.checkinAgendaHtml} style={{ color: c.agendaText }}>
                <AgendaHtml html={meeting.agenda} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, color, labelColor }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statValue} style={{ color }}>{value}</div>
      <div className={styles.statLabel} style={{ color: labelColor }}>{label}</div>
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
    <div className={styles.votingRoot}>
      {/* Logo — centered, top */}
      <div className={styles.votingLogoRow}>
        {community?.logo_url
          ? <img src={community.logo_url} alt="logo" className={styles.votingLogo} />
          : <img src="/logo.png" alt="ALVer" className={styles.votingLogoFallback} />
        }
      </div>

      {/* Poll title */}
      <h1 className={styles.votingTitle} style={{ color: textColor }}>
        {poll.title}
      </h1>

      {/* Vote count + progress bar */}
      <div className={styles.votingProgressSection}>
        <div className={styles.votingProgressHeader}>
          <div className={styles.votingCountMain} style={{ color: textColor }}>
            {totalVotes}{' '}
            <span className={styles.votingCountSub} style={{ color: mutedColor }}>
              {t('display.of_total', { total: attendeeCount })}
            </span>
          </div>
          <div className={styles.votingPct} style={{ color: mutedColor }}>{pct}%</div>
        </div>
        <div className={styles.votingTrack} style={{ background: trackColor }}>
          <div className={styles.votingFill} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Chart area — full width of container */}
      <div className={styles.votingChartArea}>
        {displayMode === 'bars'    && <VoteBar     poll={poll} colors={chartColors} isDark={isDark} />}
        {displayMode === 'pie'     && <VotePie     poll={poll} colors={chartColors} isDark={isDark} />}
        {displayMode === 'bubbles' && <VoteBubbles poll={poll} colors={chartColors} isDark={isDark} />}
        {(displayMode === 'numbers' || !displayMode) && (() => {
          const tally = Object.fromEntries(poll.options.map(o => [o, 0]))
          for (const optionId of Object.values(poll.votes ?? {})) {
            const idx = poll._optionIds?.indexOf(optionId)
            if (idx != null && idx !== -1) tally[poll.options[idx]]++
          }
          const textClr = isDark ? 'white' : 'black'
          return (
            <div className={styles.votingNumbersGrid}>
              {poll.options.map((opt, i) => (
                <div key={opt} className={styles.votingNumberCard}
                  style={{ background: chartColors[i] ?? chartColors[chartColors.length - 1] }}>
                  <span className={styles.votingNumberCount} style={{ color: textClr }}>
                    {tally[opt]}
                  </span>
                  <span className={styles.votingNumberOpt} style={{ color: textClr }}>
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
    <div className={styles.resultRoot}>
      {/* Header row */}
      <div className={styles.resultHeaderRow}>
        <div className={styles.resultLogoWrap}>
          {community?.logo_url
            ? <img src={community.logo_url} alt="logo" className={styles.resultLogo} />
            : <img src="/logo.png" alt="ALVer" className={styles.resultLogoFallback} />
          }
        </div>
        <p className={styles.resultTitle} style={{ color: mutedColor }}>{poll.title}</p>
        <div className={styles.resultSpacer} />
      </div>

      {showBreakdown && (
        <div className={`animate-fade-in ${styles.resultTally}`}>
          {Object.entries(poll.result.tally).map(([opt, count]) => (
            <div key={opt} className={styles.resultTallyItem}>
              <div className={styles.resultTallyCount} style={{ color: textColor }}>{count}</div>
              <div className={styles.resultTallyOpt} style={{ color: mutedColor }}>{opt}</div>
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
    <div className={styles.betweenRoot}>
      {community?.logo_url && (
        <div className={styles.betweenLogoRow}>
          <img src={community.logo_url} alt="logo" className={styles.betweenLogo} />
        </div>
      )}
      <div className={styles.betweenMeetingName} style={{ color: mutedColor }}>
        {meeting.name}
      </div>
      <h1 className={styles.betweenTitle} style={{ color: textColor }}>
        {t('display.session_ongoing')}
      </h1>
      <div className={styles.betweenStats}>
        <div>
          <div className={styles.betweenStatValue} style={{ color: amberColor }}>{attendeeCount}</div>
          <div className={styles.betweenStatLabel} style={{ color: mutedColor }}>{t('display.eligible')}</div>
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
    <div className={styles.closedRoot}>
      <h1 className={styles.closedTitle} style={{ color: textColor }}>
        {t('display.meeting_closed')}
      </h1>
      <p className={styles.closedSubtitle} style={{ color: mutedColor }}>{meeting.name}</p>
      {closedPolls.length > 0 && (
        <div className={styles.closedPollsList}>
          {closedPolls.map(poll => (
            <div key={poll.id} className={styles.closedPollRow}
              style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
              <span className={styles.closedPollRowTitle} style={{ color: mutedColor }}>{poll.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
