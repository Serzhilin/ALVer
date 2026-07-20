import { useState, useEffect, useRef } from 'react'
import { useMeeting } from '../context/MeetingContext'
import { useUser } from '../context/UserContext'
import { useCommunity } from '../context/CommunityContext'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LoginScreen from '../components/LoginScreen'
import AppHeader from '../components/AppHeader'
import AgendaHtml from '../components/AgendaHtml'
import { Button, Card, Loading, Heading } from '@ecommons/ui'
import styles from './Attend.module.css'

export default function Attend() {
  const { id } = useParams()
  const { meeting, activePoll, attendeeCount, sseConnected, checkIn, castVote, setMeetingId } = useMeeting()
  const navigate = useNavigate()
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const { user, login, logout } = useUser()
  const { community } = useCommunity() || {}

  useEffect(() => { setMeetingId(id) }, [id])

  const [votedPolls, setVotedPolls] = useState({})
  const checkInFired = useRef(false)

  // Auto-check-in for open phase (QR scan flow).
  // in_session: locked screen shown — facilitator must add manually.
  useEffect(() => {
    if (!user || !meeting) return
    const alreadyIn = meeting.checkedIn.find(c =>
      (user.ename && c.ename && c.ename === user.ename) ||
      (c.member_id && user.member?.id && c.member_id === user.member.id)
    )
    // Reset guard when confirmed present — allows re-checkin if facilitator removes member
    if (alreadyIn) { checkInFired.current = false; return }
    if (meeting.phase !== 'open') return
    if (checkInFired.current) return
    checkInFired.current = true
    checkIn().catch(err => console.warn('Auto check-in failed:', err))
  }, [user?.ename, meeting?.id, meeting?.checkedIn?.length])

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
      <div className={styles.loadingScreen}>
        <Loading>{t('common.loading')}</Loading>
      </div>
    )
  }

  // Derive identity from DB (meeting.checkedIn is source of truth)
  const myAttendee = user ? meeting.checkedIn.find(c =>
    (user.ename && c.ename && c.ename === user.ename) ||
    (c.member_id && user.member?.id && c.member_id === user.member.id)
  ) : null
  const checkedIn = !!myAttendee
  const myName = myAttendee?.name ||
    [user?.member?.app_first_name, user?.member?.app_last_name].filter(s => s?.trim()).join(' ') ||
    user?.displayName || user?.ename || ''
  const amAspirant = myAttendee?.isAspirant || false

  const myMandate = user ? meeting.confirmedMandates.find(m =>
    (user.ename && m.toEname && m.toEname === user.ename) ||
    (myName && m.to.toLowerCase() === myName.toLowerCase())
  ) : null

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
        <div className={styles.lockedScreen}>
          <div className={styles.lockedIcon}>🔒</div>
          <Heading as="h2" fontSize="1.1rem" fontWeight={600} style={{ margin: '0 0 10px' }}>
            {meeting.name}
          </Heading>
          <p className={styles.lockedHint}>{t('attend.session_locked_hint')}</p>
          <p className={styles.lockedSub}>{t('attend.session_locked_sub')}</p>
        </div>
      )
    }
    // archived: show results; open: show meeting info — in both cases without voting access
    return (
      <div className={styles.pageRoot}>
        <AppHeader
          logo={community?.logo_url}
          title={meeting.name}
          liveIndicator={false}
          user={user ?? (myName ? { displayName: myName } : null)}
          onLogout={logout}
        />
        <div className={styles.content}>
          {meeting.phase === 'archived'
            ? <ClosedMeetingScreen meeting={meeting} votedPolls={{}} onArchive={() => navigate(`/${community?.slug}/meeting/${meeting.id}/archive`)} t={t} />
            : <WaitingScreen meeting={meeting} dateStr={dateStr} amAspirant={amAspirant} t={t} />
          }
        </div>
      </div>
    )
  }

  // ── Not logged in: show eID login full-screen ─────────────────────────────
  if (!user) {
    return (
      <div className={styles.pageRoot}>
        <div className={styles.loginHero}>
          {community?.logo_url
            ? <img src={community.logo_url} alt="logo" className={styles.loginLogo} />
            : <div className={styles.loginBrand}>ALVer</div>
          }
          <Heading as="h1" fontSize="1.6rem" color="white" style={{ margin: 0, lineHeight: 1.2 }}>
            {meeting.name}
          </Heading>
          <div className={styles.loginMetaList}>
            {dateStr && (
              <div className={styles.loginMetaRow}>
                <span>📅</span><span>{dateStr}</span>
              </div>
            )}
            <div className={styles.loginMetaRow}>
              <span>🕐</span><span>{meeting.time}{meeting.end_time ? ` – ${meeting.end_time}` : ''}</span>
            </div>
            <div className={styles.loginMetaRow}>
              <span>📍</span><span>{meeting.location}</span>
            </div>
          </div>
        </div>

        <div className={styles.loginBody}>
          <LoginScreen onSuccess={(token, u) => login(token, u)} nameOption={false} returnTo={location.pathname} />
        </div>
      </div>
    )
  }

  // ── Checked in ────────────────────────────────────────────────────────────
  return (
    <div className={styles.pageRoot}>
      {!sseConnected && (
        <div className={styles.reconnBanner}>
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
      <div className={styles.content}>

        {/* Aspirant notice */}
        {amAspirant && (
          <div className={styles.aspirantNotice}>
            <span className={styles.aspirantText}>
              {t('attend.aspirant_notice')}
            </span>
          </div>
        )}

        {/* Mandate notice */}
        {myMandate && (
          <div className={styles.mandateNotice}>
            <span className={styles.mandateText}>
              {t('attend.has_mandate_prefix')} <strong>{myMandate.from}</strong>
              {myMandate.note && <span className={styles.mandateNote}> — {myMandate.note}</span>}
            </span>
          </div>
        )}

        {/* Meeting not started */}
        {!isInSession && !isClosed && (
          <WaitingScreen meeting={meeting} dateStr={dateStr} amAspirant={amAspirant} t={t} />
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
          <Card className={styles.aspirantPollCard}>
            <div className={styles.aspirantPollIcon}>🗳️</div>
            <p className={styles.aspirantPollTitle}>{activePoll.title}</p>
            <p className={styles.aspirantPollHint}>{t('attend.aspirant_no_vote')}</p>
          </Card>
        )}

        {/* In session: waiting for poll (only if more polls are prepared) */}
        {isInSession && !activePoll && meeting.polls.some(p => p.status === 'prepared') && (
          <Card className={styles.waitingForPollCard}>
            <div className={styles.waitingForPollIcon}>💬</div>
            <p className={styles.waitingForPollTitle}>
              {t('attend.waiting').split('.')[0]}
            </p>
            <p className={styles.waitingForPollHint}>
              {t('attend.waiting').split('.').slice(1).join('.').trim()}
            </p>
          </Card>
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
          <Card className={styles.agendaCard}>
            <div className={styles.agendaLabel}>📋 {t('common.agenda')}</div>
            <AgendaHtml html={meeting.agenda} />
          </Card>
        )}

        {/* Upcoming prepared polls (in session, no active poll) */}
        {isInSession && !activePoll && !amAspirant && <UpcomingPolls polls={meeting.polls} t={t} />}
      </div>
    </div>
  )
}

// ── Sub-screens ───────────────────────────────────────────────────────────────

function WaitingScreen({ meeting, dateStr, amAspirant, t }) {
  return (
    <div className={styles.waitingRoot}>
      <Card className={styles.waitingInfoCard}>
        <div className={styles.waitingIcon}>⏳</div>
        <Heading as="h2" fontSize="1.1rem" fontWeight={600} style={{ margin: '0 0 8px' }}>
          {t('attend.not_started_title')}
        </Heading>
        <p className={styles.waitingSubtitle}>{t('attend.not_started_hint')}</p>
        <div className={styles.waitingMetaList}>
          {dateStr && (
            <div className={styles.waitingMetaRow}>
              <span>📅</span><span>{dateStr}</span>
            </div>
          )}
          <div className={styles.waitingMetaRow}>
            <span>🕐</span><span>{meeting.time}{meeting.end_time ? ` – ${meeting.end_time}` : ''}</span>
          </div>
          <div className={styles.waitingMetaRow}>
            <span>📍</span><span>{meeting.location}</span>
          </div>
        </div>
      </Card>
      <Card className={styles.waitingAgendaCard}>
        <div className={styles.agendaLabel}>📋 {t('common.agenda')}</div>
        {meeting.agenda
          ? <AgendaHtml html={meeting.agenda} />
          : <p className={styles.agendaEmpty}>{t('attend.agenda_tba')}</p>
        }
      </Card>
      {!amAspirant && <UpcomingPolls polls={meeting.polls} t={t} />}
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
    <div className={`animate-slide-in ${styles.voteWrapper}`}>
      {/* Banner */}
      <div className={styles.voteBanner}>
        <span className={styles.voteBannerText}>{t('attend.voting_open')}</span>
        <span className={`animate-pulse-soft ${styles.votePulseDot}`} />
      </div>

      <Card className={styles.voteBody}>
        <p className={styles.voteTitle}>{poll.title}</p>

        {!myVote ? (
          <div className={styles.voteOptions}>
            {poll.options.map(opt => (
              <Button
                key={opt}
                variant="secondary"
                className={styles.voteOption}
                onClick={() => onVote(poll.id, opt, false)}
              >
                {opt}
              </Button>
            ))}
          </div>
        ) : (
          <div className={styles.voteCast}>
            <span className={styles.voteCastText}>
              {t('attend.vote_cast')} <strong>{myVote}</strong>
            </span>
          </div>
        )}

        {/* Mandate vote — only after own vote is cast */}
        {myVote && myMandate && !myMandateVote && (
          <div className={styles.mandateVoteBox}>
            <p className={styles.mandateVoteTitle}>
              {t('attend.vote_on_behalf', { name: myMandate.from })}
            </p>
            <div className={styles.mandateVoteOptions}>
              {poll.options.map(opt => (
                <Button
                  key={opt}
                  variant="secondary"
                  className={styles.mandateOptBtn}
                  onClick={() => onVote(poll.id, opt, true)}
                >
                  {opt}
                </Button>
              ))}
            </div>
          </div>
        )}

        {myVote && myMandate && myMandateVote && (
          <div className={styles.mandateVoteDone}>
            <span className={styles.mandateVoteDoneText}>
              {t('attend.vote_on_behalf_done', { name: myMandate.from })}{' '}
              {typeof myMandateVote === 'string' && <strong>{myMandateVote}</strong>}
            </span>
          </div>
        )}

        {/* Progress bar */}
        <div className={styles.progressRow}>
          <div className={styles.progressTrack}>
            <div
              className={styles.progressFill}
              style={{ width: attendeeCount > 0 ? `${(totalVotes / attendeeCount) * 100}%` : '0%' }}
            />
          </div>
          <span className={styles.progressLabel}>
            {t('attend.votes_progress', { cast: totalVotes, total: attendeeCount })}
          </span>
        </div>
      </Card>
    </div>
  )
}

function ClosedPollResult({ poll, votedPolls, t }) {
  if (!poll.result) return null
  const myVote = votedPolls[poll.id]?.own

  return (
    <div className={`animate-fade-in ${styles.closedPollWrapper}`}>
      <div className={styles.closedPollHeader}>
        <span className={styles.closedPollHeaderText}>{t('attend.result_header')}</span>
      </div>
      <div className={styles.closedPollBody}>
        <p className={styles.closedPollTitle}>{poll.title}</p>
        <div className={styles.closedTally}>
          {Object.entries(poll.result.tally).map(([option, count]) => (
            <span key={option} className={styles.tallyOption}>
              {option}: <strong style={{ color: 'var(--color-charcoal)' }}>{count}</strong>
            </span>
          ))}
          {myVote && (
            <span className={styles.yourVoteHistory}>
              {t('attend.your_vote_history')} <strong>{myVote}</strong>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function UpcomingPolls({ polls, t }) {
  const [open, setOpen] = useState(true)
  const prepared = (polls || []).filter(p => p.status === 'prepared')
  if (prepared.length === 0) return null

  return (
    <Card className={styles.upcomingCard}>
      <Button
        variant="secondary"
        className={styles.upcomingToggle}
        onClick={() => setOpen(o => !o)}
      >
        <span className={styles.upcomingToggleLeft}>
          <span className={styles.upcomingLabel}>🗳️ {t('attend.upcoming_polls')}</span>
          <span className={styles.upcomingCount}>{prepared.length}</span>
        </span>
        <span className={styles.upcomingChevron}>{open ? '▼' : '▶'}</span>
      </Button>
      {open && (
        <div className={styles.upcomingList}>
          <div className={styles.upcomingItems}>
            {prepared.map((poll, i) => (
              <div key={poll.id} className={styles.upcomingItem}>
                <span className={styles.upcomingNum}>{i + 1}.</span>
                <span className={styles.upcomingTitle}>{poll.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function ClosedMeetingScreen({ meeting, votedPolls, onArchive, t }) {
  const closedPolls = meeting.polls.filter(p => p.status === 'closed')
  return (
    <div className={styles.closedMeetingRoot}>
      <Card className={styles.closedMeetingCard}>
        <div className={styles.closedMeetingIcon}>🎉</div>
        <Heading as="h2" fontSize="1.1rem" fontWeight={600} style={{ margin: '0 0 6px' }}>
          {t('attend.meeting_closed_title')}
        </Heading>
        {closedPolls.length > 0 && (
          <p className={styles.closedMeetingHint}>{t('attend.meeting_closed_hint')}</p>
        )}
      </Card>
      {closedPolls.map(poll => (
        <ClosedPollResult key={poll.id} poll={poll} votedPolls={votedPolls} t={t} />
      ))}
      <Button variant="secondary" className={styles.archiveBtn} onClick={onArchive}>
        {t('attend.view_archive')}
      </Button>
    </div>
  )
}
