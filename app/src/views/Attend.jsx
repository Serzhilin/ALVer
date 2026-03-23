import { useState, useEffect } from 'react'
import { useMeeting, getGreeting } from '../context/MeetingContext'
import { useUser } from '../context/UserContext'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import LoginScreen from '../components/LoginScreen'

export default function Attend() {
  const { id } = useParams()
  const { meeting, activePoll, attendeeCount, checkIn, castVote, setMeetingId } = useMeeting()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, login } = useUser()

  useEffect(() => { setMeetingId(id) }, [id])

  const [myName, setMyName] = useState(() => localStorage.getItem('alver_my_name') || '')
  const [nameInput, setNameInput] = useState('')
  const [checkedIn, setCheckedIn] = useState(false)
  const [greeting, setGreeting] = useState('')
  const [showGreeting, setShowGreeting] = useState(false)
  const [votedPolls, setVotedPolls] = useState({}) // pollId -> { own: option, mandate: option }
  const [voteAnimation, setVoteAnimation] = useState(null)

  // When eID user logs in, auto-check-in with their display name
  useEffect(() => {
    if (!user || !meeting || checkedIn) return
    const name = user.displayName
    const found = meeting.checkedIn.find(c => c.name.toLowerCase() === name.toLowerCase())
    if (found) {
      setMyName(name)
      setCheckedIn(true)
    } else {
      const g = getGreeting(name)
      checkIn(name)
      setMyName(name)
      localStorage.setItem('alver_my_name', name)
      setCheckedIn(true)
      setGreeting(g)
      setShowGreeting(true)
      setTimeout(() => setShowGreeting(false), 3000)
    }
  }, [user, meeting])

  // Check if already in the list (name-based)
  useEffect(() => {
    if (!meeting || !myName || user) return
    const found = meeting.checkedIn.find(c => c.name.toLowerCase() === myName.toLowerCase())
    if (found) setCheckedIn(true)
  }, [myName, meeting?.checkedIn])

  function handleCheckInWithName(name) {
    if (!name) return
    const g = getGreeting(name)
    setMyName(name)
    localStorage.setItem('alver_my_name', name)
    checkIn(name)
    setCheckedIn(true)
    setGreeting(g)
    setShowGreeting(true)
    setTimeout(() => setShowGreeting(false), 3000)
  }

  // My mandate (am I a proxy for someone?)
  const myMandate = myName ? meeting.confirmedMandates.find(m => m.to.toLowerCase() === myName.toLowerCase()) : null
  const myAttendee = myName ? meeting.checkedIn.find(c => c.name.toLowerCase() === myName.toLowerCase()) : null
  const amAspirant = myAttendee?.isAspirant || false

  function handleVote(pollId, option, isMandate = false) {
    castVote(pollId, myName + (isMandate ? '_proxy' : ''), option, isMandate, myMandate?.from)
    setVotedPolls(prev => ({
      ...prev,
      [pollId]: isMandate ? { ...prev[pollId], mandate: option } : { ...prev[pollId], own: option }
    }))
    setVoteAnimation(pollId + (isMandate ? '_m' : ''))
    setTimeout(() => setVoteAnimation(null), 600)
  }

  const isInSession = meeting.phase === 'in_session'
  if (!meeting) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</div>

  const isClosed = meeting.phase === 'closed' || meeting.phase === 'archived'

  if (!checkedIn) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 400, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🏛️</div>
            <h1 style={{ fontSize: '1.4rem', margin: '0 0 8px' }}>ALVer</h1>
            <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.9rem' }}>
              {meeting.name}
            </p>
          </div>

          <div className="card" style={{ padding: 28 }}>
            <LoginScreen
              onSuccess={(token, u) => { login(token, u) }}
              nameOption={true}
              onNameContinue={(name) => {
                setNameInput(name)
                handleCheckInWithName(name)
              }}
            />
          </div>

          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              className="btn-secondary"
              style={{ fontSize: '0.82rem' }}
              onClick={() => navigate(`/meeting/${meeting.id}/register`)}
            >
              {t('attend.register_or_mandate')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)', position: 'relative' }}>
      {/* Greeting flash */}
      {showGreeting && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(196,98,45,0.92)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 100, flexDirection: 'column',
        }} className="greeting-flash">
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>👋</div>
          <div style={{ color: 'white', fontSize: '2rem', fontFamily: 'Playfair Display, serif', fontWeight: 600, textAlign: 'center', padding: '0 32px' }}>
            {greeting}
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{ background: 'white', borderBottom: '1px solid var(--color-sand)', padding: '12px 20px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}>🏛️</span>
            <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 600, fontSize: '0.95rem' }}>ALVer</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="badge badge-green">{t('attend.checked_in_badge')}</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>{myName}</span>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
        {/* Status card */}
        <div className="card-warm" style={{ padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
              {meeting.name}
            </h2>
            <PhaseBadge phase={meeting.phase} />
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)', marginBottom: 10 }}>
            📍 {meeting.location} · {meeting.time}
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: '0.82rem' }}>
            <span style={{ color: 'var(--color-charcoal-light)' }}>
              👥 {t('attend.eligible_count', { count: attendeeCount })}
            </span>
          </div>

          {amAspirant && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(196,98,45,0.08)', borderRadius: 8, border: '1px solid rgba(196,98,45,0.2)' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--color-terracotta)', fontWeight: 500 }}>
                {t('attend.aspirant_notice')}
              </span>
            </div>
          )}

          {myMandate && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(45,98,196,0.08)', borderRadius: 8, border: '1px solid rgba(45,98,196,0.2)' }}>
              <span style={{ fontSize: '0.82rem', color: '#2D62C4', fontWeight: 500 }}>
                {t('attend.has_mandate_prefix')} <strong>{myMandate.from}</strong>
                {myMandate.note && ` — ${myMandate.note}`}
              </span>
            </div>
          )}
        </div>

        {/* Meeting not started yet */}
        {!isInSession && !isClosed && (
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
            <h3 style={{ margin: '0 0 8px', fontFamily: 'Inter, sans-serif', fontSize: '1rem' }}>
              {t('attend.not_started_title')}
            </h3>
            <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.88rem', margin: 0 }}>
              {t('attend.not_started_hint')}
            </p>
          </div>
        )}

        {/* Active vote */}
        {isInSession && activePoll && !amAspirant && (
          <ActiveVoteCard
            poll={activePoll}
            votedPolls={votedPolls}
            myMandate={myMandate}
            onVote={handleVote}
            voteAnimation={voteAnimation}
            attendeeCount={attendeeCount}
          />
        )}
        {isInSession && activePoll && amAspirant && (
          <div className="card" style={{ padding: 24, textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🗳️</div>
            <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.88rem', margin: 0 }}>
              {activePoll.title}
            </p>
            <p style={{ color: 'var(--color-terracotta)', fontSize: '0.82rem', margin: '8px 0 0', fontWeight: 500 }}>
              {t('attend.aspirant_no_vote')}
            </p>
          </div>
        )}

        {/* Waiting in session */}
        {isInSession && !activePoll && (
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', marginBottom: 10 }}>💬</div>
            <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.9rem', margin: 0 }}>
              {t('attend.waiting')}
            </p>
          </div>
        )}

        {/* Closed polls results */}
        {isInSession && meeting.polls.filter(p => p.status === 'closed').map(poll => (
          <ClosedPollResult key={poll.id} poll={poll} votedPolls={votedPolls} />
        ))}

        {/* Meeting closed - decisions */}
        {isClosed && (
          <div>
            <div className="card" style={{ padding: 20, marginBottom: 12 }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 10 }}>🎉</div>
              <h3 style={{ margin: '0 0 6px', fontFamily: 'Inter, sans-serif', fontSize: '1rem' }}>{t('attend.meeting_closed_title')}</h3>
              <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: '0 0 16px' }}>{t('attend.meeting_closed_hint')}</p>
              {meeting.polls.filter(p => p.status === 'closed').map(poll => (
                <ClosedPollResult key={poll.id} poll={poll} votedPolls={votedPolls} compact />
              ))}
              <hr className="divider" />
              <button
                className="btn-secondary"
                style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
                onClick={() => navigate(`/meeting/${meeting.id}/archive`)}
              >
                {t('attend.view_archive')}
              </button>
              <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 8, opacity: 0.6 }}>
                {t('attend.save_placeholder')}
              </button>
            </div>
          </div>
        )}

        {/* Agenda */}
        {isInSession && (
          <div className="card" style={{ padding: 20, marginTop: 16 }}>
            <h3 style={{ margin: '0 0 12px', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.9rem' }}>
              📋 {t('common.agenda')}
            </h3>
            <pre style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', color: 'var(--color-charcoal)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
              {meeting.agenda}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

function PhaseBadge({ phase }) {
  const { t } = useTranslation()
  const colors = {
    draft: 'badge-gray',
    open: 'badge-orange',
    in_session: 'badge-green',
    closed: 'badge-gray',
    archived: 'badge-gray',
  }
  return <span className={`badge ${colors[phase] || 'badge-gray'}`}>{t(`phases.${phase}`, { defaultValue: t('phases.unknown') })}</span>
}

function ActiveVoteCard({ poll, votedPolls, myMandate, onVote, voteAnimation, attendeeCount }) {
  const { t } = useTranslation()
  const myVote = votedPolls[poll.id]?.own
  const myMandateVote = votedPolls[poll.id]?.mandate
  const totalVotes = Object.keys(poll.votes).length + poll.manualVotes.length

  return (
    <div className="animate-slide-in" style={{ marginBottom: 16 }}>
      {/* Alert banner */}
      <div style={{ background: 'var(--color-terracotta)', borderRadius: '10px 10px 0 0', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 600 }}>{t('attend.voting_open')}</span>
        <span className="animate-pulse-soft" style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.8)', display: 'inline-block', marginLeft: 'auto' }} />
      </div>

      <div className="card" style={{ borderRadius: '0 0 10px 10px', padding: 24 }}>
        <p style={{ fontSize: '1rem', color: 'var(--color-charcoal)', lineHeight: 1.6, margin: '0 0 20px', fontWeight: 500 }}>
          {poll.title}
        </p>

        {!myVote ? (
          <div>
            <label style={{ marginBottom: 10 }}>{t('attend.your_vote_label')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {poll.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => onVote(poll.id, opt, false)}
                  style={{
                    padding: '14px 20px', borderRadius: 8, border: '2px solid var(--color-sand-dark)',
                    background: 'white', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    fontWeight: 600, fontSize: '1rem', color: 'var(--color-charcoal)',
                    transition: 'all 0.15s', textAlign: 'left',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-terracotta)'; e.currentTarget.style.background = 'rgba(196,98,45,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-sand-dark)'; e.currentTarget.style.background = 'white' }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div style={{
              padding: '14px 20px', borderRadius: 8,
              background: 'rgba(45,122,74,0.08)', border: '2px solid rgba(45,122,74,0.3)',
              marginBottom: myMandate && !myMandateVote ? 16 : 0,
            }}>
              <span style={{ fontWeight: 600, color: 'var(--color-green)', fontSize: '0.9rem' }}>
                {t('attend.vote_cast')} <strong>{myVote}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Mandate vote */}
        {myVote && myMandate && !myMandateVote && (
          <div style={{ marginTop: 16, padding: '14px 18px', background: 'rgba(45,98,196,0.06)', borderRadius: 10, border: '1.5px solid rgba(45,98,196,0.2)' }}>
            <p style={{ margin: '0 0 12px', fontSize: '0.88rem', fontWeight: 600, color: '#2D62C4' }}>
              {t('attend.vote_on_behalf', { name: myMandate.from })}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {poll.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => onVote(poll.id, opt, true)}
                  style={{
                    padding: '10px 16px', borderRadius: 8, border: '1.5px solid rgba(45,98,196,0.3)',
                    background: 'white', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    fontWeight: 500, fontSize: '0.9rem', color: '#2D62C4', transition: 'all 0.15s',
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
          <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(45,98,196,0.06)', borderRadius: 8, border: '1px solid rgba(45,98,196,0.2)' }}>
            <span style={{ fontSize: '0.82rem', color: '#2D62C4', fontWeight: 500 }}>
              {t('attend.vote_on_behalf_done', { name: myMandate.from })} <strong>{myMandateVote}</strong>
            </span>
          </div>
        )}

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-charcoal-light)', fontSize: '0.78rem' }}>
          <div style={{ flex: 1, height: 4, background: 'var(--color-sand)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--color-terracotta)', borderRadius: 2, width: attendeeCount > 0 ? `${(totalVotes / attendeeCount) * 100}%` : '0%', transition: 'width 0.5s' }} />
          </div>
          <span>{t('attend.votes_progress', { cast: totalVotes, total: attendeeCount })}</span>
        </div>
      </div>
    </div>
  )
}

function ClosedPollResult({ poll, votedPolls, compact = false }) {
  const { t } = useTranslation()
  if (!poll.result) return null
  const myVote = votedPolls[poll.id]?.own

  return (
    <div style={{ marginBottom: compact ? 12 : 16 }} className={compact ? '' : 'animate-fade-in'}>
      {!compact && (
        <div style={{ background: 'var(--color-charcoal)', borderRadius: '10px 10px 0 0', padding: '8px 18px' }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>{t('attend.result_header')}</span>
        </div>
      )}
      <div
        className="card"
        style={{
          padding: compact ? '12px 16px' : 22,
          borderRadius: compact ? 10 : '0 0 10px 10px',
          borderTop: compact ? undefined : 'none',
        }}
      >
        {!compact && (
          <p style={{ margin: '0 0 14px', fontSize: '0.9rem', color: 'var(--color-charcoal)', lineHeight: 1.5 }}>
            {poll.title}
          </p>
        )}
        {compact && <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: 'var(--color-charcoal-light)', lineHeight: 1.4 }}>{poll.title}</p>}

        <div style={{ marginBottom: 8 }}>
          <span
            className="reveal-result"
            style={{
              display: 'inline-block',
              padding: compact ? '3px 12px' : '6px 18px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: compact ? '0.85rem' : '1rem',
              background: poll.result.aangenomen ? 'rgba(45,122,74,0.12)' : 'rgba(196,45,45,0.12)',
              color: poll.result.aangenomen ? 'var(--color-green)' : 'var(--color-red)',
            }}
          >
            {poll.result.aangenomen ? t('results.adopted') : t('results.rejected')}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.8rem' }}>
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
