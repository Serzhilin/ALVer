import { useState, useEffect } from 'react'
import { useMeeting } from '../context/MeetingContext'
import { useUser } from '../context/UserContext'
import { useCommunity } from '../context/CommunityContext'
import { useNavigate, useParams, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import FacilitatorHeader from '../components/FacilitatorHeader'
import AgendaHtml from '../components/AgendaHtml'
import { reopenMeeting, setDisplayMode as apiSetDisplayMode, setScreenTheme as apiSetScreenTheme, setScreenLanguage as apiSetScreenLanguage, assignNotulist as apiAssignNotulist } from '../api/client'
import { Button, Card, Badge, Heading, Loading, Modal, Input, Select, Textarea, Label, ProgressBar } from '@ecommons/ui'
import styles from './Facilitate.module.css'

export default function Facilitate() {
  const { id } = useParams()
  const { setMeetingId,
    meeting, activePoll, attendeeCount,
    displayMode, screenTheme,
    updatePhase, addPoll, updatePoll, deletePoll, reorderPolls,
    startPoll, closePoll, addManualVote, deleteVote, checkIn, manualCheckIn,
    addMandate, revokeMandate, removeAttendee,
  } = useMeeting()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { isFacilitator, loading: authLoading } = useUser()
  const { members, community } = useCommunity()

  const [showCheckInModal, setShowCheckInModal] = useState(false)
  const [showManualVoteModal, setShowManualVoteModal] = useState(false)
  const [showAddPollModal, setShowAddPollModal] = useState(false)
  const [showMandateModal, setShowMandateModal] = useState(false)
  const [editingPoll, setEditingPoll] = useState(null)
  const [agendaOpen, setAgendaOpen] = useState(false)

  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [manualVoteName, setManualVoteName] = useState('')
  const [manualVoteOption, setManualVoteOption] = useState('')
  const [mandateFrom, setMandateFrom] = useState('')
  const [mandateTo, setMandateTo] = useState('')
  const [mandateNote, setMandateNote] = useState('')

  const [newPoll, setNewPoll] = useState({ title: '', options: [] })
  const [customOption, setCustomOption] = useState('')

  const [notulistOpen, setNotulistOpen] = useState(false)
  const [notulistEname, setNotulistEname] = useState(meeting?.notulist_ename ?? '')
  const [notulistDraft, setNotulistDraft] = useState(meeting?.notulist_ename ?? '')

  // Confirmation state for irreversible actions
  const [confirmCloseAttendeeId, setConfirmCloseAttendeeId] = useState(null)
  const [confirmCloseMeeting, setConfirmCloseMeeting] = useState(false)
  const [confirmClosePollId, setConfirmClosePollId] = useState(null)
  const [confirmRevokeMandateId, setConfirmRevokeMandateId] = useState(null)

  const [dragOverId, setDragOverId] = useState(null)

  useEffect(() => { setMeetingId(id) }, [id])

  useEffect(() => {
    if (meeting?.phase === 'in_session' && meeting?.id) {
      apiSetScreenLanguage(meeting.id, i18n.language).catch(console.error)
    }
  }, [i18n.language, meeting?.id, meeting?.phase])

  // Sync notulist state when meeting reloads via SSE
  useEffect(() => {
    if (meeting?.notulist_ename !== undefined) {
      setNotulistEname(meeting.notulist_ename ?? '')
      setNotulistDraft(meeting.notulist_ename ?? '')
    }
  }, [meeting?.notulist_ename])

  // Auth gate — must be logged in as facilitator via /facilitator
  if (authLoading) return <LoadingScreen />
  if (!isFacilitator) return <Navigate to="/facilitator" replace />

  if (!meeting) return <LoadingScreen />

  const mid = meeting.id

  const memberDisplayName = (m) => [m.app_first_name, m.app_last_name].filter(s => s?.trim()).join(' ') || m.ename || '?'

  function getVoteCount(poll) {
    return Object.keys(poll.votes).length + (poll.onBehalfVoters?.size ?? 0)
  }

  function totalEligible() {
    return attendeeCount
  }

  function handleQuickCheckIn() {
    if (selectedMemberId) {
      manualCheckIn(selectedMemberId)
      setSelectedMemberId('')
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

  async function handleAddMandate() {
    if (mandateTo.trim()) {
      try {
        await addMandate(mandateTo.trim(), mandateNote.trim(), mandateFrom.trim())
        setMandateFrom('')
        setMandateTo('')
        setMandateNote('')
        setShowMandateModal(false)
      } catch (e) {
        alert(e?.message ?? 'Failed to add mandate')
      }
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
    setNewPoll({ title: '', options: [] })
    setEditingPoll(null)
    setShowAddPollModal(false)
  }

  function openEditPoll(poll) {
    setEditingPoll(poll)
    setNewPoll({ title: poll.title, options: [...poll.options] })
    setShowAddPollModal(true)
  }

  const canStart = (poll) => meeting.phase === 'in_session' && !activePoll && poll.status === 'prepared'

  async function handleAssignNotulist(ename) {
    const value = ename || null
    try {
      await apiAssignNotulist(mid, value)
      setNotulistEname(value ?? '')
    } catch (err) {
      console.warn('Failed to assign notulist:', err)
    }
  }

  return (
    <div className={styles.root}>
      <FacilitatorHeader
        title={meeting.name}
        liveIndicator={meeting.phase === 'in_session'}
        right={
          <span className={styles.phaseLabel}>
            {t('facilitate.phase_label')}: <strong className={styles.phaseLabelStrong}>{t(`phases.${meeting.phase}`)}</strong>
          </span>
        }
      />

      <div className={styles.content}>
        {/* Zone 1 — Attendance bar */}
        <Card className={styles.attendBar}>
          <div className={styles.statGroup}>
            <div>
              <div className={styles.statValue}>{attendeeCount}</div>
              <div className={styles.statLabel}>{t('facilitate.eligible')}</div>
            </div>
            <div className={styles.statDivider} />
            <div>
              <div className={`${styles.statValue} ${styles.statValueBlue}`}>{meeting.confirmedMandates.length}</div>
              <div className={styles.statLabel}>{t('facilitate.mandates')}</div>
            </div>
            <div className={styles.statDivider} />
            <div>
              <div className={`${styles.statValue} ${styles.statValueTerracotta}`}>{attendeeCount}</div>
              <div className={styles.statLabel}>{t('facilitate.total_votes')}</div>
            </div>
          </div>
          <div className={styles.attendActions}>
            {meeting.phase === 'open' && (
              <Button variant="green" onClick={() => updatePhase('in_session')}>
                {t('facilitate.open_meeting')}
              </Button>
            )}
            <a
              href={`/${community?.slug}/meeting/${mid}/display`}
              target="_blank"
              rel="noreferrer"
              className={styles.displayLink}
            >
              {t('facilitate.open_display')}
            </a>
            {meeting.phase === 'in_session' && (
              <Button
                variant="secondary"
                className={styles.themeToggle}
                onClick={() => apiSetScreenTheme(meeting.id, screenTheme === 'day' ? 'night' : 'day').catch(console.error)}
              >
                {screenTheme === 'day' ? t('facilitate.screen_theme_night') : t('facilitate.screen_theme_day')}
              </Button>
            )}
            {meeting.phase === 'in_session' && !confirmCloseMeeting && (
              <Button variant="danger" onClick={() => setConfirmCloseMeeting(true)}>
                {t('facilitate.close_meeting')}
              </Button>
            )}
            {meeting.phase === 'in_session' && confirmCloseMeeting && (
              <div className={styles.confirmRow}>
                <span className={styles.confirmText}>{t('common.confirm_question')}</span>
                <Button variant="danger" className={styles.btnSm} onClick={() => { setConfirmCloseMeeting(false); updatePhase('archived') }}>
                  {t('common.yes')}
                </Button>
                <Button variant="secondary" className={styles.btnSm} onClick={() => setConfirmCloseMeeting(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            )}
            {meeting.phase === 'archived' && meeting.date === new Date().toISOString().slice(0, 10) && (
              <Button variant="secondary" onClick={async () => {
                await reopenMeeting(meeting.id)
                window.location.reload()
              }}>
                {t('facilitate.reopen_meeting')}
              </Button>
            )}
          </div>
        </Card>

        {/* Main grid */}
        <div className={styles.mainGrid}>
          {/* Zone 2 — Check-in list */}
          <div className={styles.leftCol}>
            <Card className={styles.sideCard}>
              <div className={styles.sectionHeaderRow}>
                <h3 className={styles.sectionH3}>{t('facilitate.attendees')}</h3>
              </div>

              {/* Pre-registered but not yet checked in */}
              {(() => {
                const pending = meeting.preRegistrations.filter(pr => !meeting.checkedIn.some(c => c.name.toLowerCase() === pr.name.toLowerCase()))
                if (pending.length === 0) return null
                return (
                  <div className={styles.mb12}>
                    <div className={styles.listLabelRow}>
                      <span>{t('facilitate.expected')}</span>
                      <Badge variant="gray">{pending.length}</Badge>
                    </div>
                    {pending.map(pr => (
                      <div key={pr.id} className={styles.listEntry}>
                        <span className={styles.entryName}>{pr.name}</span>
                      </div>
                    ))}
                    <div className={styles.spacer} />
                  </div>
                )
              })()}

              {/* Declined */}
              {meeting.declines?.length > 0 && (
                <div className={styles.mb12}>
                  <div className={styles.listLabelRow}>
                    <span>{t('facilitate.declined') || 'Afgemeld'}</span>
                    <Badge variant="gray">{meeting.declines.length}</Badge>
                  </div>
                  {meeting.declines.map(d => (
                    <div key={d.id} className={styles.listEntry}>
                      <span className={styles.declinedName}>{d.name}</span>
                    </div>
                  ))}
                  <div className={styles.spacer} />
                </div>
              )}

              {/* Checked in */}
              <div className={styles.listLabelRow}>
                <span>{t('facilitate.checked_in_label')}</span>
                <div className={styles.listLabelActions}>
                  <Badge variant="green">{meeting.checkedIn.length}</Badge>
                  <Button variant="secondary" className={styles.addBtn} onClick={() => setShowCheckInModal(true)}>+</Button>
                </div>
              </div>
              {meeting.checkedIn.length === 0 && (
                <p className={styles.emptyText}>{t('facilitate.no_checkins')}</p>
              )}
              {[...meeting.checkedIn].reverse().map(c => (
                <div key={c.id} className={styles.checkedInEntry}>
                  <span className={styles.checkedInName}>
                    {c.name}
                    {c.manual && <span title={t('facilitate.manually_added')}>📝</span>}
                    {c.isAspirant && (
                      <Badge variant="orange">{t('facilitate.aspirant_badge')}</Badge>
                    )}
                  </span>
                  {confirmCloseAttendeeId === c.id ? (
                    <div className={styles.confirmInlineRow}>
                      <Button
                        variant="secondary"
                        className={styles.inlineYesBtn}
                        onClick={() => { setConfirmCloseAttendeeId(null); removeAttendee(c.id) }}
                      >{t('common.yes')}</Button>
                      <Button
                        variant="secondary"
                        className={styles.inlineCancelBtn}
                        onClick={() => setConfirmCloseAttendeeId(null)}
                      >{t('common.cancel')}</Button>
                    </div>
                  ) : (
                    <div className={styles.entryActions}>
                      <span className={styles.entryTime}>{c.checkedInAt}</span>
                      <Button
                        variant="secondary"
                        className={styles.removeBtn}
                        onClick={() => setConfirmCloseAttendeeId(c.id)}
                        title={t('facilitate.remove_attendee')}
                      >✕</Button>
                    </div>
                  )}
                </div>
              ))}
            </Card>

            {/* Mandates */}
            <Card className={styles.sideCard}>
              <div className={styles.sectionHeaderRow}>
                <h3 className={styles.sectionH3}>{t('facilitate.mandates')}</h3>
                <div className={styles.listLabelActions}>
                  <Badge variant="blue">{meeting.confirmedMandates.length}</Badge>
                  <Button variant="secondary" className={styles.addBtn} onClick={() => setShowMandateModal(true)}>+</Button>
                </div>
              </div>
              {meeting.confirmedMandates.length === 0 && (
                <p className={styles.emptyText}>{t('facilitate.no_mandates')}</p>
              )}
              {meeting.confirmedMandates.map(m => (
                <div key={m.id} className={styles.mandateEntry}>
                  <div className={styles.mandateContent}>
                    <div className={styles.mandateNames}>
                      <strong>{m.from}</strong> → <strong>{m.to}</strong>
                    </div>
                    {m.note && <div className={styles.mandateNote}>{m.note}</div>}
                  </div>
                  {confirmRevokeMandateId === m.id ? (
                    <div className={styles.confirmInlineRow}>
                      <Button
                        variant="secondary"
                        className={styles.inlineYesBtn}
                        onClick={() => { setConfirmRevokeMandateId(null); revokeMandate(m.from) }}
                      >{t('common.yes')}</Button>
                      <Button
                        variant="secondary"
                        className={styles.inlineCancelBtn}
                        onClick={() => setConfirmRevokeMandateId(null)}
                      >{t('common.cancel')}</Button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      className={styles.removeBtn}
                      onClick={() => setConfirmRevokeMandateId(m.id)}
                      title={t('facilitate.revoke_mandate')}
                    >✕</Button>
                  )}
                </div>
              ))}
            </Card>
          </div>

          {/* Zone 3 — Right column: Polls + Agenda + Notes */}
          <div className={styles.rightCol}>
            <Card className={styles.pollsCard}>
              {meeting.phase === 'in_session' && (
                <div className={styles.vizBar}>
                  <span className={styles.vizBarLabel}>{t('facilitate.viz_screen_label')}</span>
                  {[
                    { key: 'numbers', label: t('facilitate.viz_mode_numbers'), icon: '🔢' },
                    { key: 'bars',    label: t('facilitate.viz_mode_bars'),    icon: '📊' },
                    { key: 'pie',     label: t('facilitate.viz_mode_pie'),     icon: '🥧' },
                    { key: 'bubbles', label: t('facilitate.viz_mode_bubbles'), icon: '🫧' },
                  ].map(mode => (
                    <Button
                      key={mode.key}
                      variant="secondary"
                      className={styles.modeBtn}
                      onClick={() => apiSetDisplayMode(meeting.id, mode.key).catch(console.error)}
                      style={{
                        fontWeight: displayMode === mode.key ? 700 : 500,
                        color: displayMode === mode.key ? 'var(--color-terracotta)' : 'var(--color-charcoal-light)',
                        background: displayMode === mode.key ? 'white' : 'transparent',
                        borderBottom: displayMode === mode.key ? '2px solid var(--color-terracotta)' : '2px solid transparent',
                      }}
                    >
                      <span>{mode.icon}</span> {mode.label}
                    </Button>
                  ))}
                </div>
              )}
              <div
                className={styles.pollsHeaderRow}
                style={{ marginBottom: meeting.phase !== 'in_session' && meeting.phase !== 'archived' ? 4 : 20 }}
              >
                <h3 className={styles.pollsH3}>{t('facilitate.polls')}</h3>
                {meeting.phase !== 'archived' && (
                  <Button
                    variant="secondary"
                    className={styles.addPollBtn}
                    onClick={() => { setNewPoll({ title: '', options: [] }); setEditingPoll(null); setShowAddPollModal(true) }}
                  >
                    {t('facilitate.add_poll')}
                  </Button>
                )}
              </div>
              {meeting.phase !== 'in_session' && meeting.phase !== 'archived' && (
                <p className={styles.pollsHint}>
                  {t('facilitate.available_during_session')}
                </p>
              )}

              {meeting.polls.length === 0 && (
                <p className={styles.pollsEmpty}>{t('facilitate.no_polls')}</p>
              )}

              <div className={styles.pollsList}>
                {meeting.polls.map((poll, idx) => (
                  <div
                    key={poll.id}
                    className={styles.pollDragWrap}
                    draggable={poll.status === 'prepared' && meeting.phase !== 'archived'}
                    onDragStart={e => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', poll.id)
                    }}
                    onDragOver={e => {
                      if (poll.status !== 'prepared') return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOverId(poll.id)
                    }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={e => {
                      e.preventDefault()
                      setDragOverId(null)
                      const draggedId = e.dataTransfer.getData('text/plain')
                      if (draggedId === poll.id) return
                      const ids = meeting.polls.map(p => p.id)
                      const fromIdx = ids.indexOf(draggedId)
                      const toIdx = ids.indexOf(poll.id)
                      if (fromIdx === -1 || toIdx === -1) return
                      const reordered = [...ids]
                      reordered.splice(fromIdx, 1)
                      reordered.splice(toIdx, 0, draggedId)
                      reorderPolls(reordered)
                    }}
                    onDragEnd={() => setDragOverId(null)}
                    style={{
                      opacity: dragOverId === poll.id ? 0.6 : 1,
                      cursor: poll.status === 'prepared' && meeting.phase !== 'archived' ? 'grab' : 'default',
                    }}
                  >
                    <PollCard
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
                      isDraggable={poll.status === 'prepared' && meeting.phase !== 'archived'}
                    />
                  </div>
                ))}
              </div>
            </Card>

            {/* Agenda (collapsible) */}
            <Card className={styles.collapsibleCard}>
              <Button
                variant="secondary"
                className={styles.collapsibleToggle}
                onClick={() => setAgendaOpen(o => !o)}
              >
                <span>{t('common.agenda')}</span>
                <span className={styles.collapsibleChevron}>{agendaOpen ? '▼' : '▶'}</span>
              </Button>
              {agendaOpen && (
                <div className={styles.collapsibleBody}>
                  <div className={styles.agendaWrap}><AgendaHtml html={meeting.agenda} /></div>
                </div>
              )}
            </Card>

            {/* Notes (collapsible, in_session only) */}
            {meeting.phase === 'in_session' && (
              <Card className={styles.collapsibleCard}>
                <Button
                  variant="secondary"
                  className={styles.collapsibleToggle}
                  onClick={() => setNotulistOpen(o => !o)}
                >
                  <span>{t('minutes.section_title')}</span>
                  <span className={styles.collapsibleChevron}>{notulistOpen ? '▼' : '▶'}</span>
                </Button>
                {notulistOpen && (
                  <div className={styles.collapsibleBody}>
                    <div className={styles.notesForm}>
                      <Label size="sm">{t('minutes.assign_notulist')}</Label>
                      <div className={styles.notesSelectRow}>
                        <Select
                          className={styles.notulistSelect}
                          value={notulistDraft}
                          onChange={e => setNotulistDraft(e.target.value)}
                        >
                          <option value="">{t('minutes.notulist_none')}</option>
                          {(members || []).filter(m => m.ename).map(m => (
                            <option key={m.id} value={m.ename}>{memberDisplayName(m)}</option>
                          ))}
                        </Select>
                        <Button
                          variant="primary"
                          className={styles.notesAssignBtn}
                          onClick={() => handleAssignNotulist(notulistDraft)}
                          disabled={notulistDraft === notulistEname}
                        >
                          {t('minutes.assign_btn')}
                        </Button>
                      </div>
                      {notulistEname && (
                        <div className={styles.notesCurrentText}>
                          {t('minutes.notulist_assigned', { name: (() => { const mem = (members || []).find(m => m.ename === notulistEname); return mem ? memberDisplayName(mem) : notulistEname })() })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Quick check-in modal — member picker */}
      {showCheckInModal && (
        <Modal
          className={styles.modalCheckIn}
          onOverlayClick={() => { setShowCheckInModal(false); setSelectedMemberId(''); setMemberSearch('') }}
        >
          <div className={styles.modalTitle}>
            <Heading as="h3" fontSize="1.1rem">
              {t('facilitate.modal_add_without_app_title')}
            </Heading>
          </div>
          <p className={styles.modalHint}>
            {t('facilitate.modal_add_without_app_hint')}
          </p>
          {members.length > 0 ? (
            <>
              <div className={styles.memberSearchBox}>
                <Input
                  autoFocus
                  value={memberSearch}
                  onChange={e => { setMemberSearch(e.target.value); setSelectedMemberId('') }}
                  placeholder={t('facilitate.member_search_placeholder')}
                />
              </div>
              <div className={styles.memberListBox}>
                {members
                  .filter(m => !meeting.checkedIn.some(c =>
                    (m.ename && c.ename && c.ename === m.ename) ||
                    (c.member_id && c.member_id === m.id)
                  ))
                  .filter(m => !memberSearch || memberDisplayName(m).toLowerCase().includes(memberSearch.toLowerCase()))
                  .map(m => (
                    <Button
                      key={m.id}
                      variant="secondary"
                      className={styles.memberBtn}
                      onClick={() => setSelectedMemberId(m.id)}
                      style={{ background: selectedMemberId === m.id ? 'rgba(196,98,45,0.08)' : 'white' }}
                    >
                      <span>{memberDisplayName(m)}</span>
                      {m.is_aspirant && (
                        <Badge variant="orange">{t('facilitate.aspirant_badge')}</Badge>
                      )}
                    </Button>
                  ))
                }
              </div>
            </>
          ) : (
            <div className={styles.modalHint}>
              {t('settings.members_empty')}
            </div>
          )}
          <div className={styles.modalActions}>
            <Button variant="primary" onClick={handleQuickCheckIn} disabled={!selectedMemberId}>
              {t('common.add')}
            </Button>
            <Button variant="secondary" onClick={() => { setShowCheckInModal(false); setSelectedMemberId(''); setMemberSearch('') }}>
              {t('common.cancel')}
            </Button>
          </div>
        </Modal>
      )}

      {/* Manual vote modal */}
      {showManualVoteModal && activePoll && (
        <Modal onOverlayClick={() => setShowManualVoteModal(false)}>
          <div className={styles.modalTitleSm}>
            <Heading as="h3" fontSize="1.1rem">
              {t('facilitate.modal_manual_vote_title')}
            </Heading>
          </div>
          <p className={styles.modalHintSm}>
            {t('facilitate.modal_manual_vote_hint')}
          </p>

          {/* Cast votes list — all votes with delete button */}
          {activePoll.allVotes?.length > 0 && (
            <div className={styles.castVotesBox}>
              <div className={styles.castVotesHeader}>{t('facilitate.cast_votes')}</div>
              {activePoll.allVotes.map(v => {
                const optLabel = activePoll.options[activePoll._optionIds?.indexOf(v.option_id)] ?? v.option_id
                const label = v.on_behalf_of_name ? `📜 ${v.on_behalf_of_name} (→ ${v.voter_name})` : v.voter_name
                return (
                  <div key={v.id} className={styles.castVoteRow}>
                    <span className={styles.castVoteName}>{label}</span>
                    <span className={styles.castVoteOpt}>{optLabel}</span>
                    <Button
                      variant="secondary"
                      className={styles.deleteVoteBtn}
                      onClick={() => { deleteVote(activePoll.id, v.id) }}
                      title={t('common.delete')}
                    >✕</Button>
                  </div>
                )
              })}
            </div>
          )}
          <div className={styles.mb12}>
            <Label>{t('facilitate.member_name_optional')}</Label>
            <Select value={manualVoteName} onChange={e => setManualVoteName(e.target.value)}>
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
            </Select>
          </div>
          <div>
            <Label>{t('facilitate.vote_label')}</Label>
            <div className={styles.voteOptRow}>
              {activePoll.options.map(opt => (
                <Button
                  key={opt}
                  variant="secondary"
                  className={styles.voteOptBtn}
                  onClick={() => setManualVoteOption(opt)}
                  style={{
                    border: `2px solid ${manualVoteOption === opt ? 'var(--color-terracotta)' : 'var(--color-sand-dark)'}`,
                    background: manualVoteOption === opt ? 'rgba(196,98,45,0.08)' : 'white',
                    color: manualVoteOption === opt ? 'var(--color-terracotta)' : 'var(--color-charcoal)',
                  }}
                >
                  {opt}
                </Button>
              ))}
            </div>
          </div>
          <div className={styles.modalActions}>
            <Button variant="primary" onClick={handleManualVote} disabled={!manualVoteOption || !manualVoteName}>
              {t('facilitate.register_vote')}
            </Button>
            <Button variant="secondary" onClick={() => setShowManualVoteModal(false)}>{t('common.cancel')}</Button>
          </div>
        </Modal>
      )}

      {/* Add mandate modal */}
      {showMandateModal && (
        <Modal onOverlayClick={() => setShowMandateModal(false)}>
          <div className={styles.modalTitle}>
            <Heading as="h3" fontSize="1.1rem">
              {t('facilitate.add_mandate')}
            </Heading>
          </div>
          {(() => {
            const alreadyGrantedEnames = new Set(meeting.confirmedMandates.filter(m => m.fromEname).map(m => m.fromEname.toLowerCase()))
            // Granter = community members who are absent and haven't already granted
            const granterOptions = (members || []).filter(m => {
              const alreadyCheckedIn = meeting.checkedIn.some(c =>
                (m.ename && c.ename && c.ename === m.ename) ||
                (c.member_id && c.member_id === m.id)
              )
              const alreadyGranted = m.ename && alreadyGrantedEnames.has(m.ename.toLowerCase())
              return !alreadyCheckedIn && !alreadyGranted
            })
            // Proxy = checked-in non-aspirants
            const proxyOptions = meeting.checkedIn.filter(c => !c.isAspirant)
            return (
              <div className={styles.mandateModalFields}>
                <div className={styles.fieldBlock}>
                  <Label>{t('facilitate.granter')}</Label>
                  <Select autoFocus value={mandateFrom} onChange={e => setMandateFrom(e.target.value)}>
                    <option value="">— {t('facilitate.granter_placeholder')} —</option>
                    {granterOptions.map(m => (
                      <option key={m.id} value={m.id}>{memberDisplayName(m)}</option>
                    ))}
                  </Select>
                </div>
                <div className={styles.fieldBlock}>
                  <Label>{t('facilitate.proxy')}</Label>
                  <Select value={mandateTo} onChange={e => setMandateTo(e.target.value)}>
                    <option value="">— {t('facilitate.proxy_placeholder')} —</option>
                    {proxyOptions.map(c => (
                      <option key={c.id} value={c.member_id ?? c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>
                <div className={styles.fieldBlock}>
                  <Label>{t('common.note_optional')}</Label>
                  <Input value={mandateNote} onChange={e => setMandateNote(e.target.value)} placeholder={t('facilitate.note_placeholder')} />
                </div>
              </div>
            )
          })()}
          <div className={styles.modalActions}>
            <Button variant="primary" onClick={handleAddMandate} disabled={!mandateTo.trim()}>
              {t('common.add')}
            </Button>
            <Button variant="secondary" onClick={() => setShowMandateModal(false)}>{t('common.cancel')}</Button>
          </div>
        </Modal>
      )}

      {/* Add/Edit poll modal */}
      {showAddPollModal && (
        <Modal
          className={styles.modalPoll}
          onOverlayClick={() => setShowAddPollModal(false)}
        >
          <div className={styles.modalTitle}>
            <Heading as="h3" fontSize="1.1rem">
              {editingPoll ? t('facilitate.poll_edit_title') : t('facilitate.poll_add_title')}
            </Heading>
          </div>
          <div className={styles.pollModalFields}>
            <div className={styles.fieldBlock}>
              <Label>{t('facilitate.motion_text_label')}</Label>
              <Textarea
                rows={3}
                value={newPoll.title}
                onChange={e => setNewPoll(p => ({ ...p, title: e.target.value }))}
                placeholder={t('facilitate.motion_text_placeholder')}
              />
            </div>
            <div className={styles.fieldBlock}>
              <Label>{t('facilitate.vote_options_label')}</Label>
              <div className={styles.optionsList}>
                {newPoll.options.map((opt, i) => (
                  <div key={i} className={styles.optionInputRow}>
                    <Input
                      value={opt}
                      onChange={e => setNewPoll(p => ({ ...p, options: p.options.map((o, j) => j === i ? e.target.value : o) }))}
                      placeholder={t('facilitate.option_placeholder', { number: i + 1 })}
                    />
                    {newPoll.options.length > 2 && (
                      <Button
                        variant="secondary"
                        className={styles.removeOptBtn}
                        onClick={() => setNewPoll(p => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}
                      >✕</Button>
                    )}
                  </div>
                ))}
                {newPoll.options.length < 4 && (
                  <div className={styles.addOptRow}>
                    <Input
                      value={customOption}
                      onChange={e => setCustomOption(e.target.value)}
                      placeholder={t('facilitate.new_option_placeholder')}
                      onKeyDown={e => { if (e.key === 'Enter' && customOption.trim()) { setNewPoll(p => ({ ...p, options: [...p.options, customOption.trim()] })); setCustomOption('') }}}
                    />
                    <Button
                      variant="secondary"
                      className={styles.addOptBtn}
                      onClick={() => { if (customOption.trim()) { setNewPoll(p => ({ ...p, options: [...p.options, customOption.trim()] })); setCustomOption('') }}}
                    >+ {t('common.add')}</Button>
                  </div>
                )}
                <div className={styles.presetRow}>
                  {[
                    { label: t('facilitate.preset_voor_tegen'), options: [t('facilitate.preset_voor'), t('facilitate.preset_tegen'), t('facilitate.preset_onthouding')] },
                    { label: t('facilitate.preset_ja_nee'), options: [t('facilitate.preset_ja'), t('facilitate.preset_nee')] },
                  ].map((preset, i) => (
                    <Button
                      key={i}
                      variant="secondary"
                      className={styles.presetBtn}
                      onClick={() => setNewPoll(p => ({ ...p, options: preset.options }))}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className={styles.modalActions}>
            <Button variant="primary" onClick={handleSaveNewPoll} disabled={!newPoll.title.trim() || newPoll.options.filter(o => o.trim()).length < 2}>
              {editingPoll ? t('common.save') : t('facilitate.create_poll')}
            </Button>
            <Button variant="secondary" onClick={() => { setShowAddPollModal(false); setEditingPoll(null) }}>{t('common.cancel')}</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function PollCard({ poll, idx, activePoll, attendeeCount, canStart, onStart, onClose, onEdit, onDelete, onManualVote, getVoteCount, isActive, phase, confirmClosePollId, setConfirmClosePollId, isDraggable }) {
  const { t } = useTranslation()
  const voteCount = getVoteCount(poll)
  const pct = attendeeCount > 0 ? Math.round((voteCount / attendeeCount) * 100) : 0

  return (
    <div
      className={styles.pollCard}
      style={{
        border: `2px solid ${isActive ? 'var(--color-terracotta)' : 'var(--color-sand)'}`,
        paddingLeft: isDraggable ? 28 : 18,
        background: isActive ? 'rgba(196,98,45,0.03)' : 'white',
      }}
    >
      {isDraggable && (
        <div className={styles.pollDragHandle}>⠿</div>
      )}
      <div className={styles.pollHeader}>
        <div className={styles.pollInfo}>
          <div className={styles.pollNumRow}>
            <span className={styles.pollNum}>
              {t('facilitate.poll_number', { number: idx + 1 })}
            </span>
            {poll.status === 'active' && <Badge variant="orange" className="animate-pulse-soft">{t('facilitate.poll_live')}</Badge>}
            {poll.status === 'closed' && <Badge variant="gray">{t('facilitate.poll_closed_badge')}</Badge>}
            {poll.status === 'prepared' && <Badge variant="gray">{t('facilitate.poll_queue')}</Badge>}
          </div>
          <p className={styles.pollTitle}>{poll.title}</p>
          <div className={styles.pollOpts}>
            {poll.options.map(o => (
              <span key={o} className={styles.pollOptPill}>{o}</span>
            ))}
          </div>
        </div>
        {poll.status === 'prepared' && phase !== 'archived' && (
          <div className={styles.pollCardBtns}>
            <Button variant="secondary" className={styles.pollEditBtn} onClick={onEdit}>✏️</Button>
            <Button variant="secondary" className={styles.pollDeleteBtn} onClick={onDelete}>🗑️</Button>
          </div>
        )}
      </div>

      {/* Active poll live counter */}
      {poll.status === 'active' && (
        <div className={styles.pollLiveCounter}>
          <div className={styles.voteStats}>
            <span className={styles.voteCountText}>
              {t('facilitate.votes_of', { count: voteCount, total: attendeeCount })}
            </span>
            <span className={styles.votePct}>{pct}%</span>
          </div>
          <ProgressBar value={pct} />
        </div>
      )}

      {/* Closed result */}
      {poll.status === 'closed' && poll.result && (
        <div className={styles.pollResult}>
          <div className={styles.tallyRow}>
            {Object.entries(poll.result.tally).map(([option, count]) => (
              <span key={option} className={styles.tallyItem}>
                {option}: <strong className={styles.tallyCount}>{count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className={styles.pollActions}>
        {canStart && (
          <Button variant="primary" className={styles.btnPollAction} onClick={onStart}>
            {t('facilitate.start_poll')}
          </Button>
        )}
        {isActive && (
          <>
            {confirmClosePollId === poll.id ? (
              <div className={styles.pollConfirmRow}>
                <span className={styles.confirmText}>{t('common.confirm_question')}</span>
                <Button variant="danger" className={styles.btnSm} onClick={() => { setConfirmClosePollId(null); onClose() }}>
                  {t('common.yes')}
                </Button>
                <Button variant="secondary" className={styles.btnSm} onClick={() => setConfirmClosePollId(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            ) : (
              <Button variant="danger" className={styles.btnPollAction} onClick={() => setConfirmClosePollId(poll.id)}>
                {t('facilitate.close_poll')}
              </Button>
            )}
            <Button variant="secondary" className={styles.btnPollAction} onClick={onManualVote}>
              {t('facilitate.add_vote')}
            </Button>
          </>
        )}
        {!canStart && poll.status === 'prepared' && !activePoll && phase === 'in_session' && (
          <span className={styles.pollWaitText}>
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
    <div className={styles.loadingScreen}>
      <Loading>{t('common.loading')}</Loading>
    </div>
  )
}
