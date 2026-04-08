import { useState, useEffect, useRef } from 'react'
import { useMeeting } from '../context/MeetingContext'
import { useUser } from '../context/UserContext'
import { useCommunity } from '../context/CommunityContext'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LoginScreen from '../components/LoginScreen'
import AppHeader from '../components/AppHeader'
import AgendaHtml from '../components/AgendaHtml'

export default function Attend() {
  const { id } = useParams()
  const { meeting, activePoll, attendeeCount, sseConnected, checkIn, castVote, setMeetingId } = useMeeting()
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const { user, login, logout } = useUser()
  const { community } = useCommunity() || {}

  useEffect(() => {
    setMeetingId(id)
    localStorage.setItem('alver_attend_meeting_id', id)
  }, [id])


  useEffect(() => {
    if (meeting?.phase === 'archived') {
      localStorage.removeItem('alver_my_name')
      localStorage.removeItem('alver_attend_meeting_id')
    }
  }, [meeting?.phase])

  const [myName, setMyName] = useState(() => localStorage.getItem('alver_my_name') || '')
  const [checkedIn, setCheckedIn] = useState(false)
  const [votedPolls, setVotedPolls] = useState({})
  const checkInFired = useRef(false)

  // Resolve name from eID and check in if appropriate.
  // open phase: QR on display screen → scan → auto-check-in.
  // in_session: no auto-check-in — facilitator must add manually (locked screen shown).
  useEffect(() => {
    if (!user || !meeting || checkedIn || checkInFired.current) return
    checkInFired.current = true
    const name = (user.firstName && user.lastName)
      ? `${user.firstName} ${user.lastName}`
      : user.displayName
    localStorage.removeItem('alver_my_name')
    setMyName(name)
    const found = meeting.checkedIn.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (found) {
      setCheckedIn(true)
    } else if (meeting.phase === 'open') {
      checkIn(name)
        .then(() => setCheckedIn(true))
        .catch(err => console.warn('Auto check-in failed:', err))
    }
    // in_session: checkedIn stays false → locked screen or caught by second effect after manual add
  }, [user?.ename, meeting?.id])

  // Catch manual check-in by facilitator while meeting is already live.
  // The effect above fires once and marks checkInFired — so SSE-driven updates
  // to meeting.checkedIn won't re-trigger it. This separate effect handles that.
  useEffect(() => {
    if (checkedIn || !myName || !meeting) return
    const found = meeting.checkedIn.find(c => c.name.toLowerCase() === myName.toLowerCase())
    if (found) setCheckedIn(true)
  }, [meeting?.checkedIn?.length, myName, checkedIn])

  function handleVote(pollId, option, isMandate = false) {
    // Set optimistic local state immediately — disables buttons before re-render
    setVotedPolls(prev => ({
      ...prev,
      [pollId]: isMandate ? { ...prev[pollId], mandate: option } : { ...prev[pollId], own: option }
    }))
    castVote(pollId, myName, option, isMandate, myMandate?.from)
  }

  if (!meeting) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--color-charcoal-light)', fontSize: '0.9rem' }}>{t('common.loading')}</span>
      </div>
    )
  }

  // My mandate and member info (safe: meeting is loaded)
  const myMandate = myName ? meeting.confirmedMandates.find(m => m.to.toLowerCase() === myName.toLowerCase()) : null
  const myAttendee = myName ? meeting.checkedIn.find(c => c.name.toLowerCase() === myName.toLowerCase()) : null
  const amAspirant = myAttendee?.isAspirant || false

  const isInSession = meeting.phase === 'in_session'
  const isClosed = meeting.phase === 'archived'

  const dateLocale = i18n.language === 'nl' ? 'nl-NL' : 'en-GB'
  const dateStr = meeting.date
    ? new Date(meeting.date + 'T12:00').toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })
    : null

  // ── Not checked in ───────────────────────────────────────────────────────
  if (!checkedIn && user) {
    // If meeting is live and this user isn't in checkedIn list — block them
    if (meeting.phase === 'in_session') {
      return (
        <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>🔒</div>
          <h2 style={{ margin: '0 0 10px', fontSize: '1.1rem', fontFamily: 'Inter, sans-serif', fontWeight: 600, color: 'var(--color-charcoal)' }}>
            {meeting.name}
          </h2>
          <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.9rem', margin: '0 0 8px', lineHeight: 1.5 }}>
            {t('attend.session_locked_hint')}
          </p>
          <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.82rem', margin: 0 }}>
            {t('attend.session_locked_sub')}
          </p>
        </div>
      )
    }
    // archived: show results; open: show meeting info — in both cases without voting access
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', flexDirection: 'column' }}>
        <AppHeader
          logo={community?.logo_url}
          title={meeting.name}
          liveIndicator={false}
          user={user ?? (myName ? { displayName: myName } : null)}
          onLogout={logout}
        />
        <div style={{ flex: 1, maxWidth: 480, width: '100%', margin: '0 auto', padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {meeting.phase === 'archived'
            ? <ClosedMeetingScreen meeting={meeting} votedPolls={{}} onArchive={() => navigate(`/${community?.slug}/meeting/${meeting.id}/archive`)} t={t} />
            : <WaitingScreen meeting={meeting} dateStr={dateStr} t={t} />
          }
        </div>
      </div>
    )
  }

  // ── Not logged in: show eID login full-screen ─────────────────────────────
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          background: 'var(--color-primary, var(--color-terracotta))',
          padding: '40px 28px 32px',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {community?.logo_url
            ? <img src={community.logo_url} alt="logo" style={{ height: 48, maxWidth: 160, objectFit: 'contain', marginBottom: 8 }} />
            : <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>ALVer</div>
          }
          <h1 style={{ color: 'white', fontSize: '1.6rem', fontFamily: 'var(--font-title)', margin: 0, lineHeight: 1.2 }}>
            {meeting.name}
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 12 }}>
            {dateStr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem' }}>
                <span>📅</span><span>{dateStr}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem' }}>
              <span>🕐</span><span>{meeting.time}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.85)', fontSize: '0.9rem' }}>
              <span>📍</span><span>{meeting.location}</span>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, background: 'white', borderRadius: '20px 20px 0 0', marginTop: -16, padding: '32px 24px 40px', display: 'flex', flexDirection: 'column' }}>
          <LoginScreen onSuccess={(token, u) => login(token, u)} nameOption={false} returnTo={location.pathname} />
        </div>
      </div>
    )
  }

  // ── Checked in ────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', flexDirection: 'column' }}>
      {!sseConnected && (
        <div style={{ background: '#f59e0b', color: 'white', textAlign: 'center', padding: '6px 16px', fontSize: '0.82rem', fontWeight: 500 }}>
          {t('common.reconnecting')}
        </div>
      )}

      <AppHeader
        logo={community?.logo_url}
        title={meeting.name}
        liveIndicator={false}
        user={user ?? (myName ? { displayName: myName } : null)}
        onLogout={logout}
      />

      {/* Content */}
      <div style={{ flex: 1, maxWidth: 480, width: '100%', margin: '0 auto', padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Aspirant notice */}
        {amAspirant && (
          <div style={{ padding: '12px 16px', background: 'rgba(196,98,45,0.08)', borderRadius: 10, border: '1px solid rgba(196,98,45,0.2)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-terracotta)', fontWeight: 500 }}>
              {t('attend.aspirant_notice')}
            </span>
          </div>
        )}

        {/* Mandate notice */}
        {myMandate && (
          <div style={{ padding: '12px 16px', background: 'rgba(45,98,196,0.06)', borderRadius: 10, border: '1.5px solid rgba(45,98,196,0.2)' }}>
            <span style={{ fontSize: '0.85rem', color: '#2D62C4', fontWeight: 500 }}>
              {t('attend.has_mandate_prefix')} <strong>{myMandate.from}</strong>
              {myMandate.note && <span style={{ fontWeight: 400, color: 'var(--color-charcoal-light)' }}> — {myMandate.note}</span>}
            </span>
          </div>
        )}

        {/* Meeting not started */}
        {!isInSession && !isClosed && (
          <WaitingScreen meeting={meeting} dateStr={dateStr} t={t} />
        )}

        {/* In session: active poll */}
        {isInSession && activePoll && !amAspirant && (
          <VoteCard
            poll={activePoll}
            votedPolls={votedPolls}
            myMandate={myMandate}
            myName={myName}
            onVote={handleVote}
            attendeeCount={attendeeCount}
            t={t}
          />
        )}

        {/* In session: aspirant sees poll but can't vote */}
        {isInSession && activePoll && amAspirant && (
          <div style={{ background: 'white', borderRadius: 14, padding: '24px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: 12 }}>🗳️</div>
            <p style={{ color: 'var(--color-charcoal)', fontSize: '0.95rem', margin: '0 0 8px', fontWeight: 500, lineHeight: 1.5 }}>
              {activePoll.title}
            </p>
            <p style={{ color: 'var(--color-terracotta)', fontSize: '0.82rem', margin: 0 }}>
              {t('attend.aspirant_no_vote')}
            </p>
          </div>
        )}

        {/* In session: waiting for poll (only if more polls are queued) */}
        {isInSession && !activePoll && meeting.polls.some(p => p.status === 'queued') && (
          <div style={{ background: 'white', borderRadius: 14, padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 14 }}>💬</div>
            <p style={{ color: 'var(--color-charcoal)', fontSize: '1rem', margin: '0 0 6px', fontWeight: 500 }}>
              {t('attend.waiting').split('.')[0]}
            </p>
            <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: 0 }}>
              {t('attend.waiting').split('.').slice(1).join('.').trim()}
            </p>
          </div>
        )}

        {/* Closed poll results (during session) */}
        {isInSession && meeting.polls.filter(p => p.status === 'closed').map(poll => (
          <ClosedPollResult key={poll.id} poll={poll} votedPolls={votedPolls} t={t} />
        ))}

        {/* Meeting closed */}
        {isClosed && (
          <ClosedMeetingScreen meeting={meeting} votedPolls={votedPolls} onArchive={() => navigate(`/${community?.slug}/meeting/${meeting.id}/archive`)} t={t} />
        )}

        {/* Agenda (in session, no active poll) */}
        {isInSession && !activePoll && meeting.agenda && (
          <div style={{ background: 'white', borderRadius: 14, padding: '20px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-charcoal-light)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              📋 {t('common.agenda')}
            </div>
            <AgendaHtml html={meeting.agenda} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-screens ───────────────────────────────────────────────────────────────

function WaitingScreen({ meeting, dateStr, t }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>⏳</div>
        <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
          {t('attend.not_started_title')}
        </h2>
        <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.88rem', margin: '0 0 20px', lineHeight: 1.5 }}>
          {t('attend.not_started_hint')}
        </p>
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
          {dateStr && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>
              <span>📅</span><span>{dateStr}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>
            <span>🕐</span><span>{meeting.time}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>
            <span>📍</span><span>{meeting.location}</span>
          </div>
        </div>
      </div>
      {meeting.agenda && (
        <div style={{ background: 'white', borderRadius: 14, padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-charcoal-light)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
            📋 {t('common.agenda')}
          </div>
          <AgendaHtml html={meeting.agenda} />
        </div>
      )}
    </div>
  )
}

function VoteCard({ poll, votedPolls, myMandate, myName, onVote, attendeeCount, t }) {
  // Resolve own vote: live data takes priority over in-memory state
  const myVoteOptionId = myName ? poll.votes[myName] ?? poll.votes[Object.keys(poll.votes).find(k => k.toLowerCase() === myName.toLowerCase())] : null
  const myVoteLabel = myVoteOptionId ? poll.options[poll._optionIds?.indexOf(myVoteOptionId)] ?? votedPolls[poll.id]?.own : votedPolls[poll.id]?.own
  const myVote = myVoteLabel || null

  // Resolve mandate vote: live data (onBehalfVoters) takes priority
  const mandateAlreadyVoted = myMandate && poll.onBehalfVoters?.has(myMandate.from)
  const myMandateVote = mandateAlreadyVoted ? true : votedPolls[poll.id]?.mandate

  const totalVotes = Object.keys(poll.votes).length + (poll.onBehalfVoters?.size ?? 0)

  return (
    <div className="animate-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Banner */}
      <div style={{
        background: 'var(--color-terracotta)', borderRadius: '14px 14px 0 0',
        padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem' }}>{t('attend.voting_open')}</span>
        <span className="animate-pulse-soft" style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.85)', display: 'inline-block', marginLeft: 'auto' }} />
      </div>

      <div style={{ background: 'white', borderRadius: '0 0 14px 14px', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: '1rem', color: 'var(--color-charcoal)', lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
          {poll.title}
        </p>

        {!myVote ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {poll.options.map(opt => (
              <button
                key={opt}
                onClick={() => onVote(poll.id, opt, false)}
                style={{
                  padding: '18px 20px', borderRadius: 10, border: '2px solid var(--color-sand-dark)',
                  background: 'white', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  fontWeight: 600, fontSize: '1rem', color: 'var(--color-charcoal)',
                  transition: 'all 0.15s', textAlign: 'left', width: '100%',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-terracotta)'; e.currentTarget.style.background = 'rgba(196,98,45,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-sand-dark)'; e.currentTarget.style.background = 'white' }}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div style={{
            padding: '16px 20px', borderRadius: 10,
            background: 'rgba(45,122,74,0.08)', border: '2px solid rgba(45,122,74,0.3)',
          }}>
            <span style={{ fontWeight: 600, color: 'var(--color-green)', fontSize: '0.95rem' }}>
              {t('attend.vote_cast')} <strong>{myVote}</strong>
            </span>
          </div>
        )}

        {/* Mandate vote — only after own vote is cast */}
        {myVote && myMandate && !myMandateVote && (
          <div style={{ padding: '16px 18px', background: 'rgba(45,98,196,0.05)', borderRadius: 10, border: '1.5px solid rgba(45,98,196,0.2)' }}>
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 600, color: '#2D62C4' }}>
              {t('attend.vote_on_behalf', { name: myMandate.from })}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {poll.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => onVote(poll.id, opt, true)}
                  style={{
                    padding: '14px 18px', borderRadius: 10, border: '1.5px solid rgba(45,98,196,0.3)',
                    background: 'white', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    fontWeight: 500, fontSize: '0.95rem', color: '#2D62C4', transition: 'all 0.15s', textAlign: 'left', width: '100%',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(45,98,196,0.06)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'white' }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {myVote && myMandate && myMandateVote && (
          <div style={{ padding: '12px 16px', background: 'rgba(45,98,196,0.05)', borderRadius: 10, border: '1px solid rgba(45,98,196,0.2)' }}>
            <span style={{ fontSize: '0.85rem', color: '#2D62C4', fontWeight: 500 }}>
              {t('attend.vote_on_behalf_done', { name: myMandate.from })} {typeof myMandateVote === 'string' && <strong>{myMandateVote}</strong>}
            </span>
          </div>
        )}

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 5, background: 'var(--color-sand)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--color-terracotta)', borderRadius: 3,
              width: attendeeCount > 0 ? `${(totalVotes / attendeeCount) * 100}%` : '0%',
              transition: 'width 0.5s',
            }} />
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', whiteSpace: 'nowrap' }}>
            {t('attend.votes_progress', { cast: totalVotes, total: attendeeCount })}
          </span>
        </div>
      </div>
    </div>
  )
}

function ClosedPollResult({ poll, votedPolls, t }) {
  if (!poll.result) return null
  const myVote = votedPolls[poll.id]?.own

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ background: 'var(--color-charcoal)', borderRadius: '14px 14px 0 0', padding: '8px 18px' }}>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>{t('attend.result_header')}</span>
      </div>
      <div style={{ background: 'white', borderRadius: '0 0 14px 14px', padding: '20px' }}>
        <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: 'var(--color-charcoal)', lineHeight: 1.5 }}>
          {poll.title}
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.8rem' }}>
          {Object.entries(poll.result.tally).map(([option, count]) => (
            <span key={option} style={{ color: 'var(--color-charcoal-light)' }}>
              {option}: <strong style={{ color: 'var(--color-charcoal)' }}>{count}</strong>
            </span>
          ))}
          {myVote && <span style={{ color: 'var(--color-charcoal-light)', marginLeft: 'auto' }}>{t('attend.your_vote_history')} <strong>{myVote}</strong></span>}
        </div>
      </div>
    </div>
  )
}

function ClosedMeetingScreen({ meeting, votedPolls, onArchive, t }) {
  const closedPolls = meeting.polls.filter(p => p.status === 'closed')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: 'white', borderRadius: 14, padding: '28px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🎉</div>
        <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
          {t('attend.meeting_closed_title')}
        </h2>
        {closedPolls.length > 0 && (
          <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.88rem', margin: 0 }}>
            {t('attend.meeting_closed_hint')}
          </p>
        )}
      </div>
      {closedPolls.map(poll => (
        <ClosedPollResult key={poll.id} poll={poll} votedPolls={votedPolls} t={t} />
      ))}
      <button
        className="btn-secondary"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={onArchive}
      >
        {t('attend.view_archive')}
      </button>
    </div>
  )
}
