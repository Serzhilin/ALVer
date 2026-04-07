import { useState, useEffect } from 'react'
import { useMeeting } from '../context/MeetingContext'
import { useUser } from '../context/UserContext'
import { useCommunity } from '../context/CommunityContext'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import FacilitatorHeader from '../components/FacilitatorHeader'
import AgendaHtml from '../components/AgendaHtml'
import { reopenMeeting } from '../api/client'

export default function Facilitate() {
  const { id } = useParams()
  const { setMeetingId,
    meeting, activePoll, attendeeCount,
    updatePhase, addPoll, updatePoll, deletePoll,
    startPoll, closePoll, addManualVote, checkIn,
    addMandate, revokeMandate, removeAttendee,
  } = useMeeting()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { isFacilitator, loading: authLoading } = useUser()
  const { members, community } = useCommunity()

  const [showCheckInModal, setShowCheckInModal] = useState(false)
  const [showManualVoteModal, setShowManualVoteModal] = useState(false)
  const [showAddPollModal, setShowAddPollModal] = useState(false)
  const [showMandateModal, setShowMandateModal] = useState(false)
  const [editingPoll, setEditingPoll] = useState(null)
  const [agendaOpen, setAgendaOpen] = useState(false)

  const [selectedMember, setSelectedMember] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [manualVoteName, setManualVoteName] = useState('')
  const [manualVoteOption, setManualVoteOption] = useState('')
  const [mandateFrom, setMandateFrom] = useState('')
  const [mandateTo, setMandateTo] = useState('')
  const [mandateNote, setMandateNote] = useState('')

  const [newPoll, setNewPoll] = useState({ title: '', options: ['Voor', 'Tegen', 'Onthouding'] })
  const [customOption, setCustomOption] = useState('')

  // Confirmation state for irreversible actions
  const [confirmCloseAttendeeId, setConfirmCloseAttendeeId] = useState(null)
  const [confirmCloseMeeting, setConfirmCloseMeeting] = useState(false)
  const [confirmClosePollId, setConfirmClosePollId] = useState(null)
  const [confirmRevokeMandateId, setConfirmRevokeMandateId] = useState(null)

  useEffect(() => { setMeetingId(id) }, [id])

  // Auth gate — must be logged in as facilitator via /facilitator
  if (authLoading) return <LoadingScreen />
  if (!isFacilitator) return <Navigate to="/facilitator" replace />

  if (!meeting) return <LoadingScreen />

  const mid = meeting.id

  function getVoteCount(poll) {
    return Object.keys(poll.votes).length + (poll.onBehalfVoters?.size ?? 0)
  }

  function totalEligible() {
    return attendeeCount
  }

  function handleQuickCheckIn() {
    const name = selectedMember.trim()
    if (name) {
      checkIn(name, true)
      setSelectedMember('')
      setMemberSearch('')
      setShowCheckInModal(false)
    }
  }

  function handleManualVote() {
    if (!activePoll || !manualVoteOption || !manualVoteName) return
    const isMandate = manualVoteName.startsWith('mandate:')
    if (isMandate) {
      const [, granterName, proxyName] = manualVoteName.split(':')
      if (activePoll.onBehalfVoters?.has(granterName)) return
      addManualVote(activePoll.id, manualVoteOption, proxyName, granterName)
    } else {
      const alreadyVoted = manualVoteName in activePoll.votes || activePoll.manualVotes.some(v => v.name.toLowerCase() === manualVoteName.toLowerCase())
      if (alreadyVoted) return
      addManualVote(activePoll.id, manualVoteOption, manualVoteName)
    }
    setManualVoteName('')
    setManualVoteOption('')
    setShowManualVoteModal(false)
  }

  function handleAddMandate() {
    if (mandateFrom.trim() && mandateTo.trim()) {
      addMandate(mandateFrom.trim(), mandateTo.trim(), mandateNote.trim())
      setMandateFrom('')
      setMandateTo('')
      setMandateNote('')
      setShowMandateModal(false)
    }
  }

  function handleSaveNewPoll() {
    const title = newPoll.title.trim()
    const cleanOptions = newPoll.options.map(o => o.trim()).filter(o => o.length > 0)
    if (!title || cleanOptions.length < 2) return
    if (editingPoll) {
      updatePoll(editingPoll.id, { title, options: cleanOptions })
    } else {
      addPoll({ title, options: cleanOptions })
    }
    setNewPoll({ title: '', options: ['Voor', 'Tegen', 'Onthouding'] })
    setEditingPoll(null)
    setShowAddPollModal(false)
  }

  function openEditPoll(poll) {
    setEditingPoll(poll)
    setNewPoll({ title: poll.title, options: [...poll.options] })
    setShowAddPollModal(true)
  }

  const canStart = (poll) => meeting.phase === 'in_session' && !activePoll && poll.status === 'prepared'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)' }}>
      <FacilitatorHeader
        title={meeting.name}
        liveIndicator={meeting.phase === 'in_session'}
        right={
          <>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-charcoal-light)' }}>
              {t('facilitate.phase_label')}: <strong style={{ color: 'var(--color-charcoal)' }}>{t(`phases.${meeting.phase}`)}</strong>
            </span>
          </>
        }
      />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px' }}>
        {/* Zone 1 — Attendance bar */}
        <div className="card" style={{ padding: '16px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-charcoal)', lineHeight: 1 }}>{attendeeCount}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>{t('facilitate.eligible')}</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--color-sand)' }} />
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#2D62C4', lineHeight: 1 }}>{meeting.confirmedMandates.length}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>{t('facilitate.mandates')}</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--color-sand)' }} />
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-terracotta)', lineHeight: 1 }}>
                {attendeeCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>{t('facilitate.total_votes')}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {meeting.phase === 'open' && (
              <button className="btn-green" onClick={() => updatePhase('in_session')}>
                {t('facilitate.open_meeting')}
              </button>
            )}
            <a
              href={`/${community?.slug}/meeting/${mid}/display`}
              target="_blank"
              rel="noreferrer"
              style={{ background: 'transparent', border: '1px solid var(--color-green)', color: 'var(--color-green)', borderRadius: 8, padding: '9px 20px', fontSize: '0.9rem', fontWeight: 500, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              {t('facilitate.open_display')}
            </a>
            {meeting.phase === 'in_session' && !confirmCloseMeeting && (
              <button className="btn-danger" onClick={() => setConfirmCloseMeeting(true)}>
                {t('facilitate.close_meeting')}
              </button>
            )}
            {meeting.phase === 'in_session' && confirmCloseMeeting && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-charcoal)' }}>{t('common.confirm_question')}</span>
                <button className="btn-danger" style={{ fontSize: '0.82rem', padding: '5px 12px' }} onClick={() => { setConfirmCloseMeeting(false); updatePhase('archived') }}>
                  {t('common.yes')}
                </button>
                <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '5px 12px' }} onClick={() => setConfirmCloseMeeting(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            )}
            {meeting.phase === 'archived' && meeting.date === new Date().toISOString().slice(0, 10) && (
              <button className="btn-secondary" onClick={async () => {
                await reopenMeeting(meeting.id)
                window.location.reload()
              }}>
                {t('facilitate.reopen_meeting')}
              </button>
            )}
          </div>
        </div>

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
          {/* Zone 2 — Check-in list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                  {t('facilitate.attendees')}
                </h3>
              </div>

              {/* Pre-registered but not yet checked in */}
              {(() => {
                const pending = meeting.preRegistrations.filter(pr => !meeting.checkedIn.some(c => c.name.toLowerCase() === pr.name.toLowerCase()))
                if (pending.length === 0) return null
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-charcoal-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{t('facilitate.expected')}</span>
                      <span className="badge badge-gray">{pending.length}</span>
                    </div>
                    {pending.map(pr => (
                      <div key={pr.id} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-sand)' }}>
                        <span style={{ fontSize: '0.88rem', color: 'var(--color-charcoal-light)' }}>{pr.name}</span>
                      </div>
                    ))}
                    <div style={{ height: 12 }} />
                  </div>
                )
              })()}

              {/* Checked in */}
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-charcoal-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{t('facilitate.checked_in_label')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="badge badge-green">{meeting.checkedIn.length}</span>
                  <button
                    onClick={() => setShowCheckInModal(true)}
                    style={{ background: 'none', border: '1px solid var(--color-sand-dark)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-charcoal-light)', fontSize: '0.75rem', padding: '1px 7px', lineHeight: '18px' }}
                  >+</button>
                </div>
              </div>
              {meeting.checkedIn.length === 0 && (
                <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: '8px 0' }}>{t('facilitate.no_checkins')}</p>
              )}
              {[...meeting.checkedIn].reverse().map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--color-sand)', gap: 8 }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--color-charcoal)', display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                    {c.name}
                    {c.manual && <span title={t('facilitate.manually_added')}>📝</span>}
                    {c.isAspirant && (
                      <span style={{ fontSize: '0.68rem', background: 'rgba(196,98,45,0.12)', color: 'var(--color-terracotta)', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                        {t('facilitate.aspirant_badge')}
                      </span>
                    )}
                  </span>
                  {confirmCloseAttendeeId === c.id ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button
                        onClick={() => { setConfirmCloseAttendeeId(null); removeAttendee(c.id) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-red)', fontSize: '0.78rem', padding: '2px 6px', fontWeight: 600 }}
                      >{t('common.yes')}</button>
                      <button
                        onClick={() => setConfirmCloseAttendeeId(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-charcoal-light)', fontSize: '0.78rem', padding: '2px 6px' }}
                      >{t('common.cancel')}</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)' }}>{c.checkedInAt}</span>
                      <button
                        onClick={() => setConfirmCloseAttendeeId(c.id)}
                        title={t('facilitate.remove_attendee')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-charcoal-light)', fontSize: '0.8rem', padding: '2px 4px', lineHeight: 1 }}
                      >✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Mandates */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                  {t('facilitate.mandates')}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="badge badge-blue">{meeting.confirmedMandates.length}</span>
                  <button
                    onClick={() => setShowMandateModal(true)}
                    style={{ background: 'none', border: '1px solid var(--color-sand-dark)', borderRadius: 4, cursor: 'pointer', color: 'var(--color-charcoal-light)', fontSize: '0.75rem', padding: '1px 7px', lineHeight: '18px' }}
                  >+</button>
                </div>
              </div>
              {meeting.confirmedMandates.length === 0 && (
                <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: '8px 0' }}>{t('facilitate.no_mandates')}</p>
              )}
              {meeting.confirmedMandates.map(m => (
                <div key={m.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--color-sand)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>
                      <strong>{m.from}</strong> → <strong>{m.to}</strong>
                    </div>
                    {m.note && <div style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>{m.note}</div>}
                  </div>
                  {confirmRevokeMandateId === m.id ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button
                        onClick={() => { setConfirmRevokeMandateId(null); revokeMandate(m.from) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-red)', fontSize: '0.78rem', padding: '2px 6px', fontWeight: 600 }}
                      >{t('common.yes')}</button>
                      <button
                        onClick={() => setConfirmRevokeMandateId(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-charcoal-light)', fontSize: '0.78rem', padding: '2px 6px' }}
                      >{t('common.cancel')}</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRevokeMandateId(m.id)}
                      title={t('facilitate.revoke_mandate')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-charcoal-light)', fontSize: '0.8rem', padding: '2px 4px', lineHeight: 1 }}
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Zone 3 — Polls */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: meeting.phase !== 'in_session' && meeting.phase !== 'archived' ? 4 : 20 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                {t('facilitate.polls')}
              </h3>
              {meeting.phase !== 'archived' && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                  onClick={() => { setNewPoll({ title: '', options: ['Voor', 'Tegen', 'Onthouding'] }); setEditingPoll(null); setShowAddPollModal(true) }}
                >
                  {t('facilitate.add_poll')}
                </button>
              )}
            </div>
            {meeting.phase !== 'in_session' && meeting.phase !== 'archived' && (
              <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: 'var(--color-charcoal-light)', fontStyle: 'italic' }}>
                {t('facilitate.available_during_session')}
              </p>
            )}

            {meeting.polls.length === 0 && (
              <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.9rem' }}>{t('facilitate.no_polls')}</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {meeting.polls.map((poll, idx) => (
                <PollCard
                  key={poll.id}
                  poll={poll}
                  idx={idx}
                  activePoll={activePoll}
                  attendeeCount={attendeeCount}
                  canStart={canStart(poll)}
                  onStart={() => startPoll(poll.id)}
                  onClose={() => closePoll(poll.id)}
                  onEdit={() => openEditPoll(poll)}
                  onDelete={() => deletePoll(poll.id)}
                  onManualVote={() => setShowManualVoteModal(true)}
                  getVoteCount={getVoteCount}
                  isActive={activePoll?.id === poll.id}
                  phase={meeting.phase}
                  confirmClosePollId={confirmClosePollId}
                  setConfirmClosePollId={setConfirmClosePollId}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Zone 4 — Agenda (collapsible) */}
        <div className="card" style={{ padding: 0, marginTop: 16, overflow: 'hidden' }}>
          <button
            onClick={() => setAgendaOpen(o => !o)}
            style={{ width: '100%', background: 'none', border: 'none', padding: '16px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-charcoal)' }}
          >
            <span>📋 {t('common.agenda')}</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-charcoal-light)' }}>
              {agendaOpen ? '▼' : '▶'}
            </span>
          </button>
          {agendaOpen && (
            <div style={{ padding: '0 24px 20px', borderTop: '1px solid var(--color-sand)' }}>
              <AgendaHtml html={meeting.agenda} style={{ marginTop: 16 }} />
            </div>
          )}
        </div>
      </div>

      {/* Quick check-in modal — member picker */}
      {showCheckInModal && (
        <div className="modal-overlay" onClick={() => { setShowCheckInModal(false); setSelectedMember(''); setMemberSearch('') }}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-title)', fontSize: '1.1rem' }}>
              {t('facilitate.modal_add_without_app_title')}
            </h3>
            <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: '0 0 16px' }}>
              {t('facilitate.modal_add_without_app_hint')}
            </p>
            {members.length > 0 ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <input
                    className="input"
                    autoFocus
                    value={memberSearch}
                    onChange={e => { setMemberSearch(e.target.value); setSelectedMember('') }}
                    placeholder={t('facilitate.member_search_placeholder')}
                  />
                </div>
                <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--color-sand)', borderRadius: 8, marginBottom: 16 }}>
                  {members
                    .filter(m => !meeting.checkedIn.some(c => c.name.toLowerCase() === m.name.toLowerCase()))
                    .filter(m => !memberSearch || m.name.toLowerCase().includes(memberSearch.toLowerCase()))
                    .map(m => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedMember(m.name)}
                        style={{
                          width: '100%', padding: '10px 14px', background: selectedMember === m.name ? 'rgba(196,98,45,0.08)' : 'white',
                          border: 'none', borderBottom: '1px solid var(--color-sand)', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          fontFamily: 'Inter, sans-serif', fontSize: '0.9rem', color: 'var(--color-charcoal)',
                          textAlign: 'left',
                        }}
                      >
                        <span>{m.name}</span>
                        {m.is_aspirant && (
                          <span style={{ fontSize: '0.68rem', background: 'rgba(196,98,45,0.12)', color: 'var(--color-terracotta)', borderRadius: 4, padding: '1px 6px', fontWeight: 600 }}>
                            {t('facilitate.aspirant_badge')}
                          </span>
                        )}
                      </button>
                    ))
                  }
                </div>
              </>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <input
                  className="input"
                  autoFocus
                  value={selectedMember}
                  onChange={e => setSelectedMember(e.target.value)}
                  placeholder={t('facilitate.name_placeholder')}
                  onKeyDown={e => e.key === 'Enter' && handleQuickCheckIn()}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={handleQuickCheckIn} disabled={!selectedMember.trim()}>
                {t('common.add')}
              </button>
              <button className="btn-secondary" onClick={() => { setShowCheckInModal(false); setSelectedMember(''); setMemberSearch('') }}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual vote modal */}
      {showManualVoteModal && activePoll && (
        <div className="modal-overlay" onClick={() => setShowManualVoteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--font-title)', fontSize: '1.1rem' }}>
              {t('facilitate.modal_manual_vote_title')}
            </h3>
            <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.82rem', margin: '0 0 16px' }}>
              {t('facilitate.modal_manual_vote_hint')}
            </p>
            <div style={{ marginBottom: 12 }}>
              <label>{t('facilitate.member_name_optional')}</label>
              <select className="input" value={manualVoteName} onChange={e => setManualVoteName(e.target.value)}>
                <option value="">— {t('facilitate.member_search_placeholder')}</option>
                {meeting.checkedIn.filter(c => !c.isAspirant).map(c => {
                  const voted = c.name in (activePoll?.votes ?? {}) || (activePoll?.manualVotes ?? []).some(v => v.name.toLowerCase() === c.name.toLowerCase())
                  return (
                    <option key={c.name} value={c.name} disabled={voted}>
                      {c.name}{voted ? ' ✓' : ''}
                    </option>
                  )
                })}
                {meeting.confirmedMandates.map(m => {
                  const voted = activePoll?.onBehalfVoters?.has(m.from)
                  return (
                    <option key={`mandate-${m.from}`} value={`mandate:${m.from}:${m.to}`} disabled={voted}>
                      📜 {m.from} → {m.to}{voted ? ' ✓' : ''}
                    </option>
                  )
                })}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label>{t('facilitate.vote_label')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {activePoll.options.map(opt => (
                  <button
                    key={opt}
                    onClick={() => setManualVoteOption(opt)}
                    style={{
                      flex: 1, padding: '12px 8px', borderRadius: 8, border: `2px solid ${manualVoteOption === opt ? 'var(--color-terracotta)' : 'var(--color-sand-dark)'}`,
                      background: manualVoteOption === opt ? 'rgba(196,98,45,0.08)' : 'white',
                      cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.9rem',
                      color: manualVoteOption === opt ? 'var(--color-terracotta)' : 'var(--color-charcoal)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={handleManualVote} disabled={!manualVoteOption || !manualVoteName}>
                {t('facilitate.register_vote')}
              </button>
              <button className="btn-secondary" onClick={() => setShowManualVoteModal(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add mandate modal */}
      {showMandateModal && (
        <div className="modal-overlay" onClick={() => setShowMandateModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-title)', fontSize: '1.1rem' }}>
              {t('facilitate.add_mandate')}
            </h3>
            {(() => {
              const checkedInNames = new Set(meeting.checkedIn.map(c => c.name.toLowerCase()))
              const alreadyGranted = new Set(meeting.confirmedMandates.map(m => m.from.toLowerCase()))
              // Granter = community members who are absent and haven't already granted
              const granterOptions = (members || []).filter(m =>
                !checkedInNames.has(m.name.toLowerCase()) &&
                !alreadyGranted.has(m.name.toLowerCase())
              )
              // Proxy = checked-in non-aspirants
              const proxyOptions = meeting.checkedIn.filter(c => !c.isAspirant)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                  <div>
                    <label>{t('facilitate.granter')}</label>
                    <select className="input" autoFocus value={mandateFrom} onChange={e => setMandateFrom(e.target.value)}>
                      <option value="">— {t('facilitate.granter_placeholder')} —</option>
                      {granterOptions.map(m => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>{t('facilitate.proxy')}</label>
                    <select className="input" value={mandateTo} onChange={e => setMandateTo(e.target.value)}>
                      <option value="">— {t('facilitate.proxy_placeholder')} —</option>
                      {proxyOptions.map(c => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>{t('common.note_optional')}</label>
                    <input className="input" value={mandateNote} onChange={e => setMandateNote(e.target.value)} placeholder={t('facilitate.note_placeholder')} />
                  </div>
                </div>
              )
            })()}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={handleAddMandate} disabled={!mandateFrom.trim() || !mandateTo.trim()}>
                {t('common.add')}
              </button>
              <button className="btn-secondary" onClick={() => setShowMandateModal(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit poll modal */}
      {showAddPollModal && (
        <div className="modal-overlay" onClick={() => setShowAddPollModal(false)}>
          <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 20px', fontFamily: 'var(--font-title)', fontSize: '1.1rem' }}>
              {editingPoll ? t('facilitate.poll_edit_title') : t('facilitate.poll_add_title')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
              <div>
                <label>{t('facilitate.motion_text_label')}</label>
                <textarea
                  className="input"
                  rows={3}
                  value={newPoll.title}
                  onChange={e => setNewPoll(p => ({ ...p, title: e.target.value }))}
                  placeholder={t('facilitate.motion_text_placeholder')}
                />
              </div>
              <div>
                <label>{t('facilitate.vote_options_label')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {newPoll.options.map((opt, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        className="input"
                        value={opt}
                        onChange={e => setNewPoll(p => ({ ...p, options: p.options.map((o, j) => j === i ? e.target.value : o) }))}
                        placeholder={t('facilitate.option_placeholder', { number: i + 1 })}
                      />
                      {newPoll.options.length > 2 && (
                        <button
                          onClick={() => setNewPoll(p => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-red)', fontSize: '1rem', padding: '4px' }}
                        >✕</button>
                      )}
                    </div>
                  ))}
                  {newPoll.options.length < 4 && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        className="input"
                        value={customOption}
                        onChange={e => setCustomOption(e.target.value)}
                        placeholder={t('facilitate.new_option_placeholder')}
                        onKeyDown={e => { if (e.key === 'Enter' && customOption.trim()) { setNewPoll(p => ({ ...p, options: [...p.options, customOption.trim()] })); setCustomOption('') }}}
                      />
                      <button
                        className="btn-secondary"
                        style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}
                        onClick={() => { if (customOption.trim()) { setNewPoll(p => ({ ...p, options: [...p.options, customOption.trim()] })); setCustomOption('') }}}
                      >+ {t('common.add')}</button>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[['Voor', 'Tegen', 'Onthouding'], ['Ja', 'Nee']].map((preset, i) => (
                      <button
                        key={i}
                        className="btn-secondary"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => setNewPoll(p => ({ ...p, options: preset }))}
                      >
                        {preset.join(' / ')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={handleSaveNewPoll} disabled={!newPoll.title.trim() || newPoll.options.filter(o => o.trim()).length < 2}>
                {editingPoll ? t('common.save') : t('facilitate.create_poll')}
              </button>
              <button className="btn-secondary" onClick={() => { setShowAddPollModal(false); setEditingPoll(null) }}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PollCard({ poll, idx, activePoll, attendeeCount, canStart, onStart, onClose, onEdit, onDelete, onManualVote, getVoteCount, isActive, phase, confirmClosePollId, setConfirmClosePollId }) {
  const { t } = useTranslation()
  const voteCount = getVoteCount(poll)
  const pct = attendeeCount > 0 ? Math.round((voteCount / attendeeCount) * 100) : 0

  return (
    <div
      style={{
        border: `2px solid ${isActive ? 'var(--color-terracotta)' : 'var(--color-sand)'}`,
        borderRadius: 10,
        padding: 18,
        background: isActive ? 'rgba(196,98,45,0.03)' : 'white',
        transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-charcoal-light)' }}>
              {t('facilitate.poll_number', { number: idx + 1 })}
            </span>
            {poll.status === 'active' && <span className="badge badge-orange animate-pulse-soft">{t('facilitate.poll_live')}</span>}
            {poll.status === 'closed' && <span className="badge badge-gray">{t('facilitate.poll_closed_badge')}</span>}
            {poll.status === 'prepared' && <span className="badge badge-gray">{t('facilitate.poll_queue')}</span>}
          </div>
          <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--color-charcoal)', lineHeight: 1.5 }}>
            {poll.title}
          </p>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {poll.options.map(o => (
              <span key={o} style={{ padding: '2px 8px', background: 'var(--color-sand)', borderRadius: 4, fontSize: '0.75rem', color: 'var(--color-charcoal-light)' }}>{o}</span>
            ))}
          </div>
        </div>
        {poll.status === 'prepared' && phase !== 'archived' && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-charcoal-light)', padding: '4px 6px' }}>✏️</button>
            <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-red)', padding: '4px 6px' }}>🗑️</button>
          </div>
        )}
      </div>

      {/* Active poll live counter */}
      {poll.status === 'active' && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>
              {t('facilitate.votes_of', { count: voteCount, total: attendeeCount })}
            </span>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-terracotta)' }}>{pct}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* Closed result */}
      {poll.status === 'closed' && poll.result && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <span
              style={{ display: 'none' }}
            >
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(poll.result.tally).map(([option, count]) => (
              <span key={option} style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>
                {option}: <strong style={{ color: 'var(--color-charcoal)' }}>{count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {canStart && (
          <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '7px 14px' }} onClick={onStart}>
            {t('facilitate.start_poll')}
          </button>
        )}
        {isActive && (
          <>
            {confirmClosePollId === poll.id ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-charcoal)' }}>{t('common.confirm_question')}</span>
                <button className="btn-danger" style={{ fontSize: '0.82rem', padding: '5px 12px' }} onClick={() => { setConfirmClosePollId(null); onClose() }}>
                  {t('common.yes')}
                </button>
                <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '5px 12px' }} onClick={() => setConfirmClosePollId(null)}>
                  {t('common.cancel')}
                </button>
              </div>
            ) : (
              <button className="btn-danger" style={{ fontSize: '0.82rem', padding: '7px 14px' }} onClick={() => setConfirmClosePollId(poll.id)}>
                {t('facilitate.close_poll')}
              </button>
            )}
            <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '7px 14px' }} onClick={onManualVote}>
              {t('facilitate.add_vote')}
            </button>
          </>
        )}
        {!canStart && poll.status === 'prepared' && !activePoll && phase === 'in_session' && (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-charcoal-light)', padding: '7px 0' }}>
            {t('facilitate.wait_for_poll')}
          </span>
        )}
      </div>
    </div>
  )
}

function LoadingScreen() {
  const { t } = useTranslation()
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-cream)', color: 'var(--color-charcoal-light)' }}>
      {t('common.loading')}
    </div>
  )
}
