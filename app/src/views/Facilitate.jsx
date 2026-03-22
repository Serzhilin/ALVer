import { useState, useEffect } from 'react'
import { useMeeting } from '../context/MeetingContext'
import { useUser } from '../context/UserContext'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import LoginScreen from '../components/LoginScreen'

export default function Facilitate() {
  const { id } = useParams()
  const { setMeetingId,
    meeting, activePoll, attendeeCount,
    updatePhase, addPoll, updatePoll, deletePoll,
    startPoll, closePoll, addManualVote, checkIn,
    addMandate,
  } = useMeeting()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { user, loading: authLoading, login } = useUser()

  const [showCheckInModal, setShowCheckInModal] = useState(false)
  const [showManualVoteModal, setShowManualVoteModal] = useState(false)
  const [showAddPollModal, setShowAddPollModal] = useState(false)
  const [showMandateModal, setShowMandateModal] = useState(false)
  const [editingPoll, setEditingPoll] = useState(null)
  const [agendaOpen, setAgendaOpen] = useState(false)

  const [quickName, setQuickName] = useState('')
  const [manualVoteName, setManualVoteName] = useState('')
  const [manualVoteOption, setManualVoteOption] = useState('')
  const [mandateFrom, setMandateFrom] = useState('')
  const [mandateTo, setMandateTo] = useState('')
  const [mandateNote, setMandateNote] = useState('')

  const [newPoll, setNewPoll] = useState({ title: '', options: ['Voor', 'Tegen', 'Onthouding'] })
  const [customOption, setCustomOption] = useState('')

  useEffect(() => { setMeetingId(id) }, [id])

  // Auth gate — facilitator must be logged in with eID
  if (authLoading) return <LoadingScreen />
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎙️</div>
            <h1 style={{ fontSize: '1.3rem', margin: '0 0 6px' }}>Facilitator</h1>
            <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: 0 }}>
              {t('auth.facilitator_hint', 'Log in met je eID om de vergadering te faciliteren')}
            </p>
          </div>
          <div className="card" style={{ padding: 28 }}>
            <LoginScreen onSuccess={login} nameOption={false} />
          </div>
          <button
            onClick={() => navigate('/')}
            style={{ display: 'block', margin: '16px auto 0', background: 'none', border: 'none', color: 'var(--color-charcoal-light)', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    )
  }

  if (!meeting) return <LoadingScreen />

  const mid = meeting.id

  function getVoteCount(poll) {
    return Object.keys(poll.votes).length + poll.manualVotes.length
  }

  function totalEligible() {
    return attendeeCount
  }

  function handleQuickCheckIn() {
    if (quickName.trim()) {
      checkIn(quickName.trim(), true)
      setQuickName('')
      setShowCheckInModal(false)
    }
  }

  function handleManualVote() {
    if (activePoll && manualVoteOption) {
      addManualVote(activePoll.id, manualVoteOption, manualVoteName || 'Onbekend')
      setManualVoteName('')
      setManualVoteOption('')
      setShowManualVoteModal(false)
    }
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
    if (!newPoll.title.trim() || newPoll.options.length < 2) return
    if (editingPoll) {
      updatePoll(editingPoll.id, { title: newPoll.title, options: newPoll.options })
    } else {
      addPoll({ title: newPoll.title, options: newPoll.options })
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

  const canStart = (poll) => meeting.phase === 'in_session' && !activePoll && poll.status === 'pending'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)' }}>
      {/* Top bar */}
      <header style={{ background: 'var(--color-charcoal)', color: 'white', padding: '0 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.85rem' }}>
              {t('common.back')}
            </button>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
            <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 600, fontSize: '0.95rem' }}>
              🎙️ {user?.displayName || 'Facilitator'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
              {t('facilitate.phase_label')}: <strong style={{ color: 'white' }}>{t(`phases.${meeting.phase}`)}</strong>
            </span>
            <a
              href={`/meeting/${mid}/display`}
              target="_blank"
              rel="noreferrer"
              style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: 'white', borderRadius: 6, padding: '5px 12px', fontSize: '0.8rem', textDecoration: 'none', cursor: 'pointer' }}
            >
              {t('facilitate.open_display')}
            </a>
            <LanguageSwitcher light />
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px' }}>
        {/* Zone 1 — Attendance bar */}
        <div className="card" style={{ padding: '16px 24px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-charcoal)', lineHeight: 1 }}>{meeting.checkedIn.length}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>{t('facilitate.present')}</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--color-sand)' }} />
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#2D62C4', lineHeight: 1 }}>{meeting.confirmedMandates.length}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>{t('facilitate.mandates')}</div>
            </div>
            <div style={{ width: 1, height: 40, background: 'var(--color-sand)' }} />
            <div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-terracotta)', lineHeight: 1 }}>{attendeeCount}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>{t('facilitate.eligible')}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '7px 14px' }} onClick={() => setShowCheckInModal(true)}>
              {t('facilitate.add_without_app')}
            </button>
            <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '7px 14px' }} onClick={() => setShowMandateModal(true)}>
              {t('facilitate.add_mandate')}
            </button>
            {meeting.phase === 'open' && (
              <button className="btn-green" onClick={() => updatePhase('in_session')}>
                {t('facilitate.open_meeting')}
              </button>
            )}
            {meeting.phase === 'in_session' && (
              <button className="btn-danger" onClick={() => updatePhase('closed')}>
                {t('facilitate.close_meeting')}
              </button>
            )}
            {meeting.phase === 'closed' && (
              <button className="btn-secondary" onClick={() => updatePhase('archived')}>
                {t('facilitate.archive')}
              </button>
            )}
            {meeting.phase === 'draft' && (
              <button className="btn-primary" onClick={() => updatePhase('published')}>
                {t('facilitate.publish')}
              </button>
            )}
            {meeting.phase === 'published' && (
              <button className="btn-primary" onClick={() => updatePhase('open')}>
                {t('facilitate.open_registration')}
              </button>
            )}
          </div>
        </div>

        {/* Main grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16, alignItems: 'start' }}>
          {/* Zone 2 — Check-in list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                  {t('facilitate.attendees')}
                </h3>
                <span className="badge badge-green">{meeting.checkedIn.length}</span>
              </div>

              {/* Expected but not yet checked in */}
              {meeting.preRegistrations
                .filter(pr => pr.type === 'attending' && !meeting.checkedIn.some(c => c.name.toLowerCase() === pr.name.toLowerCase()))
                .length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-charcoal-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    {t('facilitate.expected')}
                  </div>
                  {meeting.preRegistrations
                    .filter(pr => pr.type === 'attending' && !meeting.checkedIn.some(c => c.name.toLowerCase() === pr.name.toLowerCase()))
                    .map(pr => (
                      <div key={pr.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-sand)' }}>
                        <span style={{ fontSize: '0.88rem', color: 'var(--color-charcoal-light)' }}>
                          {pr.name}
                        </span>
                        <span className="badge badge-gray">{t('facilitate.expected_badge')}</span>
                      </div>
                    ))}
                  <hr className="divider" />
                </div>
              )}

              {/* Checked in */}
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-charcoal-light)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {t('facilitate.checked_in_label')}
              </div>
              {meeting.checkedIn.length === 0 && (
                <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: '8px 0' }}>{t('facilitate.no_checkins')}</p>
              )}
              {[...meeting.checkedIn].reverse().map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--color-sand)' }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>
                    {c.name} {c.manual && <span title={t('facilitate.manually_added')}>📝</span>}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)' }}>{c.checkedInAt}</span>
                </div>
              ))}
            </div>

            {/* Mandates */}
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                  {t('facilitate.mandates')}
                </h3>
                <span className="badge badge-blue">{meeting.confirmedMandates.length}</span>
              </div>
              {meeting.confirmedMandates.length === 0 && (
                <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: '8px 0' }}>{t('facilitate.no_mandates')}</p>
              )}
              {meeting.confirmedMandates.map(m => (
                <div key={m.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--color-sand)' }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>
                    <strong>{m.from}</strong> → <strong>{m.to}</strong>
                  </div>
                  {m.note && <div style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>{m.note}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Zone 3 — Polls */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
                {t('facilitate.polls')}
              </h3>
              {meeting.phase !== 'closed' && meeting.phase !== 'archived' && (
                <button
                  className="btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                  onClick={() => { setNewPoll({ title: '', options: ['Voor', 'Tegen', 'Onthouding'] }); setEditingPoll(null); setShowAddPollModal(true) }}
                >
                  {t('facilitate.add_poll')}
                </button>
              )}
            </div>

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
              {agendaOpen ? t('facilitate.collapse') : t('facilitate.expand')}
            </span>
          </button>
          {agendaOpen && (
            <div style={{ padding: '0 24px 20px', borderTop: '1px solid var(--color-sand)' }}>
              <pre style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.88rem', color: 'var(--color-charcoal)', margin: '16px 0 0', whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
                {meeting.agenda}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Quick check-in modal */}
      {showCheckInModal && (
        <div className="modal-overlay" onClick={() => setShowCheckInModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px', fontFamily: 'Playfair Display, serif', fontSize: '1.1rem' }}>
              {t('facilitate.modal_add_without_app_title')}
            </h3>
            <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: '0 0 16px' }}>
              {t('facilitate.modal_add_without_app_hint')}
            </p>
            <div style={{ marginBottom: 16 }}>
              <label>{t('common.name')}</label>
              <input
                className="input"
                autoFocus
                value={quickName}
                onChange={e => setQuickName(e.target.value)}
                placeholder={t('facilitate.name_placeholder')}
                onKeyDown={e => e.key === 'Enter' && handleQuickCheckIn()}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={handleQuickCheckIn} disabled={!quickName.trim()}>
                {t('common.add')}
              </button>
              <button className="btn-secondary" onClick={() => setShowCheckInModal(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual vote modal */}
      {showManualVoteModal && activePoll && (
        <div className="modal-overlay" onClick={() => setShowManualVoteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 6px', fontFamily: 'Playfair Display, serif', fontSize: '1.1rem' }}>
              {t('facilitate.modal_manual_vote_title')}
            </h3>
            <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.82rem', margin: '0 0 16px' }}>
              {t('facilitate.modal_manual_vote_hint')}
            </p>
            <div style={{ marginBottom: 12 }}>
              <label>{t('facilitate.member_name_optional')}</label>
              <input className="input" value={manualVoteName} onChange={e => setManualVoteName(e.target.value)} placeholder={t('facilitate.member_name_placeholder')} />
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
              <button className="btn-primary" onClick={handleManualVote} disabled={!manualVoteOption}>
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
            <h3 style={{ margin: '0 0 16px', fontFamily: 'Playfair Display, serif', fontSize: '1.1rem' }}>
              {t('facilitate.add_mandate')}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div>
                <label>{t('facilitate.granter')}</label>
                <input className="input" autoFocus value={mandateFrom} onChange={e => setMandateFrom(e.target.value)} placeholder={t('facilitate.granter_placeholder')} />
              </div>
              <div>
                <label>{t('facilitate.proxy')}</label>
                <input className="input" value={mandateTo} onChange={e => setMandateTo(e.target.value)} placeholder={t('facilitate.proxy_placeholder')} />
              </div>
              <div>
                <label>{t('common.note_optional')}</label>
                <input className="input" value={mandateNote} onChange={e => setMandateNote(e.target.value)} placeholder={t('facilitate.note_placeholder')} />
              </div>
            </div>
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
            <h3 style={{ margin: '0 0 20px', fontFamily: 'Playfair Display, serif', fontSize: '1.1rem' }}>
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
              <button className="btn-primary" onClick={handleSaveNewPoll} disabled={!newPoll.title.trim()}>
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

function PollCard({ poll, idx, activePoll, attendeeCount, canStart, onStart, onClose, onEdit, onDelete, onManualVote, getVoteCount, isActive, phase }) {
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
            {poll.status === 'pending' && <span className="badge badge-gray">{t('facilitate.poll_queue')}</span>}
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
        {poll.status === 'pending' && phase !== 'closed' && phase !== 'archived' && (
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
              style={{
                display: 'inline-block',
                padding: '4px 14px',
                borderRadius: 6,
                fontWeight: 700,
                fontSize: '0.9rem',
                background: poll.result.aangenomen ? 'rgba(45,122,74,0.12)' : 'rgba(196,45,45,0.12)',
                color: poll.result.aangenomen ? 'var(--color-green)' : 'var(--color-red)',
              }}
            >
              {poll.result.aangenomen ? t('results.adopted') : t('results.rejected')}
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
            <button className="btn-danger" style={{ fontSize: '0.82rem', padding: '7px 14px' }} onClick={onClose}>
              {t('facilitate.close_poll')}
            </button>
            <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '7px 14px' }} onClick={onManualVote}>
              {t('facilitate.add_vote')}
            </button>
          </>
        )}
        {!canStart && poll.status === 'pending' && !activePoll && phase === 'in_session' && (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-charcoal-light)', padding: '7px 0' }}>
            {t('facilitate.wait_for_poll')}
          </span>
        )}
        {poll.status === 'pending' && phase !== 'in_session' && (
          <span style={{ fontSize: '0.8rem', color: 'var(--color-charcoal-light)', fontStyle: 'italic' }}>
            {t('facilitate.available_during_session')}
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
