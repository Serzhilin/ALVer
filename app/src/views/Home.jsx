import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAllMeetings, transitionStatus, getMeetingMembers } from '../api/client'
import { useUser } from '../context/UserContext'
import { useCommunity } from '../context/CommunityContext'
import { useMeeting } from '../context/MeetingContext'
import LoginScreen from '../components/LoginScreen'
import AgendaHtml from '../components/AgendaHtml'
import MeetingFormModal from '../components/MeetingFormModal'
import FacilitatorHeader from '../components/FacilitatorHeader'
import AppHeader from '../components/AppHeader'
import { Button, Badge, Card, Loading, Heading, SectionLabel, Page, ErrorText, Select, Input } from '@ecommons/ui'
import styles from './Home.module.css'

const CURRENT_STATUSES  = ['in_session', 'open']
const UPCOMING_STATUSES = ['draft']
const ARCHIVE_STATUSES  = ['archived']

function statusVariant(s) {
  return { draft: 'gray', open: 'blue', in_session: 'green', archived: 'gray' }[s] || 'gray'
}

function lookupLocation(name, communityLocations) {
  const locs = communityLocations?.length ? communityLocations : []
  return locs.find(l => l.name === name) ?? null
}

export default function Home() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { user, isFacilitator, loading: authLoading, login, logout, communityId, communities, switchCommunity } = useUser()
  const { community, members } = useCommunity() || {}
  const { meeting: ctxMeeting, setMeetingId, preRegister, decline, addMandate, removeAttendee, revokeMandate } = useMeeting()
  const facilitatorMembers = (members || []).filter(m => m.is_facilitator)
  const dateLocale = i18n.language === 'nl' ? 'nl-NL' : 'en-GB'

  // ── Facilitator: meeting list ─────────────────────────────────────────────
  const [meetings, setMeetings] = useState([])
  const [meetingsLoading, setMeetingsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState(null)

  // ── Attendee: local state ─────────────────────────────────────────────────
  const [localPreReg, setLocalPreReg] = useState(null)
  const [attendanceMode, setAttendanceMode] = useState(null) // null | 'mandate'
  const [proxyMemberId, setProxyMemberId] = useState('')
  const [mandateNote, setMandateNote] = useState('')
  const [agendaOpen, setAgendaOpen] = useState(false)
  const [pollsOpen, setPollsOpen] = useState(false)
  const [meetingMembersList, setMeetingMembersList] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [mandateError, setMandateError] = useState(null)

  function loadMeetings() {
    setMeetingsLoading(true)
    getAllMeetings(communityId)
      .then(setMeetings)
      .catch(e => setError(e.message))
      .finally(() => setMeetingsLoading(false))
  }

  useEffect(() => { loadMeetings() }, [user, communityId])

  // Re-fetch meeting list when meeting phase changes via SSE (e.g. open → in_session)
  useEffect(() => {
    if (ctxMeeting?.phase) loadMeetings()
  }, [ctxMeeting?.phase])

  const currentMeeting = meetings.find(m => CURRENT_STATUSES.includes(m.status))

  // Init MeetingContext for attendee actions (preRegister, addMandate, etc.) and poll visibility
  useEffect(() => {
    if (currentMeeting) setMeetingId(currentMeeting.id)
  }, [currentMeeting?.id])

  // Read pre-reg status from localStorage when meeting is known
  useEffect(() => {
    if (!currentMeeting) { setLocalPreReg(null); return }
    try {
      const s = localStorage.getItem(`alver_checkin_${currentMeeting.id}`)
      setLocalPreReg(s ? JSON.parse(s) : null)
    } catch { setLocalPreReg(null) }
  }, [currentMeeting?.id])

  // DB truth: if server says we're checked in, navigate to Attend — regardless of localStorage
  useEffect(() => {
    if (!ctxMeeting || !user?.ename || isFacilitator || !community?.slug) return
    const myEntry = ctxMeeting.checkedIn.find(c =>
      (c.ename && c.ename === user.ename) ||
      (c.member_id && user?.member?.id && c.member_id === user.member.id)
    )
    if (myEntry) {
      navigate(`/${community?.slug}/meeting/${ctxMeeting.id}/attend`, { replace: true })
    }
  }, [ctxMeeting, user?.ename, user?.member?.id, isFacilitator, community?.slug])

  // Load members when mandate form opens
  useEffect(() => {
    if (currentMeeting && attendanceMode === 'mandate') {
      getMeetingMembers(currentMeeting.id).then(setMeetingMembersList).catch(() => {})
    }
  }, [attendanceMode, currentMeeting?.id])

  // ── Auth loading ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className={styles.fullscreen}>
        <Loading>{t('common.loading')}</Loading>
      </div>
    )
  }

  // ── Wait for DB check before rendering attendee UI (prevents stale-localStorage flash) ─────
  if (!isFacilitator && user && currentMeeting && !ctxMeeting) {
    return (
      <div className={styles.fullscreen}>
        <Loading>{t('common.loading')}</Loading>
      </div>
    )
  }

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className={styles.loginWrapper}>
        <Page maxWidth={420}>
          <div className={styles.logoRow}>
            <img src="/logo.png" alt="ALVer" className={styles.logo} />
            <div className={styles.logoText}>
              <Heading as="h1" fontSize="1.3rem">ALVer</Heading>
              <p className={styles.subtitle}>{t('home.subtitle')}</p>
            </div>
          </div>
          <Card style={{ padding: 'var(--space-28)' }}>
            <LoginScreen onSuccess={login} nameOption={false} />
          </Card>
          <p className={styles.facilitatorHint}>
            {t('home.facilitator_hint')}{' '}
            <a href="/facilitator" className={styles.facilitatorLink}>
              {t('home.facilitator_link')}
            </a>
          </p>
        </Page>
      </div>
    )
  }

  // ── Attendee actions ──────────────────────────────────────────────────────
  async function handleIllCome() {
    const name = [user?.member?.app_first_name, user?.member?.app_last_name].filter(s => s?.trim()).join(' ')
      || user?.displayName
      || user?.ename
    if (!name?.trim() || !currentMeeting) return
    setSubmitting(true)
    try {
      await preRegister()
      const data = { type: 'attend', name }
      localStorage.setItem(`alver_checkin_${currentMeeting.id}`, JSON.stringify(data))
      setLocalPreReg(data)
    } catch (e) {
      console.error('preRegister failed', e)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMandateSubmit() {
    if (!proxyMemberId || !currentMeeting) return
    setSubmitting(true)
    setMandateError(null)
    try {
      await addMandate(proxyMemberId, mandateNote)
      // localStorage display — use app names or displayName
      const displayName = user?.displayName || user?.ename || '?'
      const proxyMember = meetingMembersList.find(m => m.id === proxyMemberId)
      const proxyDisplay = proxyMember
        ? ([proxyMember.app_first_name, proxyMember.app_last_name].filter(Boolean).join(' ') || proxyMember.ename || '?')
        : proxyMemberId
      const data = { type: 'mandate', name: displayName, proxy: proxyDisplay }
      localStorage.setItem(`alver_checkin_${currentMeeting.id}`, JSON.stringify(data))
      setLocalPreReg(data)
      setAttendanceMode(null)
      setProxyMemberId('')
      setMandateNote('')
    } catch (e) {
      setMandateError(e.message || 'Failed to submit mandate')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCannotCome() {
    if (!currentMeeting) return
    try {
      await decline()
    } catch (e) {
      console.error('decline failed', e)
    }
    const data = { type: 'decline' }
    localStorage.setItem(`alver_checkin_${currentMeeting.id}`, JSON.stringify(data))
    setLocalPreReg(data)
  }

  async function handleModify() {
    if (!currentMeeting) return
    if (localPreReg?.type === 'attend' && ctxMeeting) {
      // Match by ename (from checkedIn shape) or by name for pre-registrations
      const myEname = user?.ename
      const preReg = ctxMeeting.preRegistrations.find(p =>
        (myEname && p.ename && p.ename === myEname) ||
        p.name.toLowerCase() === localPreReg.name?.toLowerCase()
      )
      if (preReg) await removeAttendee(preReg.id).catch(() => {})
    }
    if (localPreReg?.type === 'mandate' && localPreReg.name) {
      await revokeMandate(localPreReg.name).catch(() => {})
    }
    if (localPreReg?.type === 'decline' && ctxMeeting) {
      const myEname = user?.ename
      const declined = ctxMeeting.declines.find(d => myEname && d.ename && d.ename === myEname)
      if (declined) await removeAttendee(declined.id).catch(() => {})
    }
    localStorage.removeItem(`alver_checkin_${currentMeeting.id}`)
    setLocalPreReg(null)
    setAttendanceMode(null)
    setProxyMemberId('')
    setMandateNote('')
  }

  // ── Shared derived data (used by both attendee and facilitator views) ────
  const archiveMeetings = meetings
    .filter(m => ARCHIVE_STATUSES.includes(m.status))
    .sort((a, b) => b.date.localeCompare(a.date))

  function formatDate(dateStr) {
    if (!dateStr) return ''
    return new Date(dateStr + 'T12:00').toLocaleDateString(dateLocale, {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    })
  }

  // ── Attendee screen ───────────────────────────────────────────────────────
  if (!isFacilitator) {
    const loc = currentMeeting
      ? (community?.locations ?? []).find(l => l.name === currentMeeting.location) ?? null
      : null
    const dateStr = currentMeeting?.date
      ? new Date(currentMeeting.date + 'T12:00').toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })
      : null
    const isLive = currentMeeting?.status === 'in_session'
    const agenda = ctxMeeting?.agenda || currentMeeting?.agenda_text

    return (
      <div className={styles.attendeeRoot}>
        <AppHeader
          user={user}
          isFacilitator={isFacilitator}
          onLogout={logout}
          onSwitchCommunity={communities.length > 1 ? switchCommunity : undefined}
        />

        <div className={styles.attendeeContent}>
          <div className={styles.attendeeLogo}>
            <HeaderLogo communityLogo={community?.logo_url} size="large" />
          </div>

          {meetingsLoading ? (
            <Loading style={{ fontSize: '0.9rem' }}>{t('common.loading')}</Loading>
          ) : currentMeeting ? (
            <div className={styles.meetingStack}>
              {isLive && (
                <div className={styles.liveBanner}>
                  <span className={`animate-pulse-soft ${styles.liveDot}`} />
                  <span className={styles.liveBannerText}>
                    {t('dashboard.meeting_live')}
                  </span>
                </div>
              )}

              <div className={styles.meetingPanel}>
                <h1 style={{ margin: '0 0 16px', fontSize: '1.5rem', fontFamily: 'var(--font-title)', color: 'var(--color-charcoal)', lineHeight: 1.2 }}>
                  {currentMeeting.name}
                </h1>

                {/* Meeting meta */}
                <div className={styles.meetingMeta}>
                  {dateStr && (
                    <div className={styles.metaRow}>
                      <span>📅</span><span>{dateStr}</span>
                    </div>
                  )}
                  <div className={styles.metaRow}>
                    <span>🕐</span><span>{currentMeeting.time}</span>
                  </div>
                  {currentMeeting.facilitator_name && (
                    <div className={styles.metaRow}>
                      <span>🎙️</span><span>{currentMeeting.facilitator_name}</span>
                    </div>
                  )}
                  <div className={styles.metaRowTop}>
                    <span>📍</span>
                    <span>
                      {currentMeeting.location}
                      {loc?.address && <span className={styles.locAddress}>{loc.address}</span>}
                      {loc?.maps_url && (
                        <a href={loc.maps_url} target="_blank" rel="noopener noreferrer" className={styles.mapsLink}>
                          🗺️ {t('settings.location_maps_link')}
                        </a>
                      )}
                    </span>
                  </div>
                </div>

                {/* Collapsible agenda */}
                {agenda && (
                  <div className={styles.collapsible}>
                    <Button
                      variant="secondary"
                      className={styles.ghostBtn}
                      onClick={() => setAgendaOpen(o => !o)}
                    >
                      <span>{agendaOpen ? '▼' : '▶'}</span>
                      <span>{t('common.agenda')}</span>
                    </Button>
                    {agendaOpen && (
                      <AgendaHtml html={agenda} style={{ marginTop: 10, fontSize: '0.83rem', lineHeight: 1.7 }} />
                    )}
                  </div>
                )}

                {/* Collapsible polls */}
                {(ctxMeeting?.polls || []).filter(p => p.status === 'prepared').length > 0 && (
                  <div className={styles.collapsibleNoTop}>
                    <Button
                      variant="secondary"
                      className={styles.ghostBtn}
                      onClick={() => setPollsOpen(o => !o)}
                    >
                      <span>{pollsOpen ? '▼' : '▶'}</span>
                      <span>{t('attend.upcoming_polls')}</span>
                    </Button>
                    {pollsOpen && (
                      <div className={styles.pollList}>
                        {(ctxMeeting?.polls || []).filter(p => p.status === 'prepared').map((poll, i) => (
                          <div key={poll.id} className={styles.pollItem}>
                            <span className={styles.pollNum}>{i + 1}.</span>
                            <span className={styles.pollTitle}>{poll.title}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Action area ── */}
                <div className={styles.actionArea}>
                  {localPreReg?.type === 'attend' ? (
                    <>
                      <div className={styles.statusAttend}>
                        {t('home.preregistered_status')}
                      </div>
                      <Button variant="secondary" className={styles.btnModify} onClick={handleModify}>
                        {t('home.btn_modify')}
                      </Button>
                    </>

                  ) : localPreReg?.type === 'mandate' ? (
                    <>
                      <div className={styles.statusMandate}>
                        📜 {t('home.mandate_status', { proxy: localPreReg.proxy })}
                      </div>
                      <Button variant="secondary" className={styles.btnModify} onClick={handleModify}>
                        {t('home.btn_modify')}
                      </Button>
                    </>

                  ) : localPreReg?.type === 'decline' ? (
                    <>
                      <div className={styles.statusDecline}>
                        👋 {t('home.decline_status')}
                      </div>
                      <Button variant="secondary" className={styles.btnModify} onClick={handleModify}>
                        {t('home.btn_modify')}
                      </Button>
                    </>

                  ) : isLive && !localPreReg ? (
                    <div className={styles.statusLive}>
                      {t('home.scan_qr_to_checkin')}
                    </div>
                  ) : attendanceMode === 'mandate' ? (
                    <div className={styles.mandateForm}>
                      <h3 className={styles.mandateTitle}>📜 {t('register.give_mandate_title')}</h3>
                      <p className={styles.mandateHint}>{t('register.give_mandate_hint')}</p>
                      <Select
                        value={proxyMemberId}
                        onChange={e => setProxyMemberId(e.target.value)}
                        autoFocus
                      >
                        <option value="">{t('register.proxy_placeholder')}</option>
                        {meetingMembersList
                          .filter(m => m.id !== user?.member?.id)
                          .map(m => {
                            const displayName = [m.app_first_name, m.app_last_name].filter(Boolean).join(' ') || m.ename || '?'
                            return (
                              <option key={m.id} value={m.id}>{displayName}</option>
                            )
                          })
                        }
                      </Select>
                      <Input
                        value={mandateNote}
                        onChange={e => setMandateNote(e.target.value)}
                        placeholder={t('register.note_placeholder')}
                      />
                      {mandateError && (
                        <ErrorText as="p">{mandateError}</ErrorText>
                      )}
                      <div className={styles.mandateBtns}>
                        <Button
                          variant="primary"
                          className={styles.btnMandateFlex}
                          disabled={!proxyMemberId || submitting}
                          onClick={handleMandateSubmit}
                        >
                          {submitting ? t('common.loading') : t('register.sign_confirm')}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => { setAttendanceMode(null); setProxyMemberId(''); setMandateNote(''); setMandateError(null) }}
                        >
                          {t('common.cancel')}
                        </Button>
                      </div>
                    </div>

                  ) : (
                    <>
                      <Button
                        variant="primary"
                        className={styles.btnIllCome}
                        disabled={submitting}
                        onClick={handleIllCome}
                      >
                        {submitting ? t('common.loading') : t('home.btn_ill_come')}
                      </Button>
                      <Button
                        variant="secondary"
                        className={styles.btnFullWidth}
                        onClick={() => setAttendanceMode('mandate')}
                      >
                        {t('home.btn_mandate_short')}
                      </Button>
                      <Button
                        variant="secondary"
                        className={styles.cantComeBtn}
                        onClick={handleCannotCome}
                      >
                        {t('home.btn_cant_come')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.noMeetingPanel}>
              <div className={styles.noMeetingIcon}>🏛️</div>
              <p className={styles.noMeetingText}>
                {t('dashboard.no_active_meeting')}
              </p>
            </div>
          )}

          <div className={styles.archiveWrapper}>
            <ArchiveList meetings={archiveMeetings} formatDate={formatDate} t={t} />
          </div>
        </div>
      </div>
    )
  }

  // ── Facilitator dashboard ─────────────────────────────────────────────────
  const upcomingMeetings = meetings
    .filter(m => UPCOMING_STATUSES.includes(m.status))
    .sort((a, b) => a.date.localeCompare(b.date))

  function handleSaved() {
    setShowCreateModal(false)
    setEditingMeeting(null)
    loadMeetings()
  }

  function handleDeleted() {
    setEditingMeeting(null)
    loadMeetings()
  }

  return (
    <div className={styles.facilitatorRoot}>
      <FacilitatorHeader />

      <div className={styles.facilitatorContent}>
        {error && (
          <Card className={styles.errorCard}>
            <strong style={{ color: 'var(--color-red)' }}>{t('home.error_api')}</strong>
            <span className={styles.errorMsg}>{error}</span>
          </Card>
        )}

        <div className={styles.facilitatorSections}>
          <section>
            <SectionHeader label={
              currentMeeting?.status === 'in_session'
                ? t('dashboard.meeting_live')
                : currentMeeting?.status === 'open'
                  ? t('dashboard.meeting_announced')
                  : t('dashboard.current_meeting')
            } />
            {meetingsLoading
              ? <Loading>{t('common.loading')}</Loading>
              : currentMeeting
                ? <CurrentMeetingCard
                    meeting={currentMeeting}
                    navigate={navigate}
                    formatDate={formatDate}
                    onEdit={() => setEditingMeeting(currentMeeting)}
                    t={t}
                    communityLocations={community?.locations}
                    communitySlug={community?.slug}
                  />
                : <AnnounceCard
                    upcomingMeetings={upcomingMeetings}
                    onAnnounce={handleSaved}
                    t={t}
                  />
            }
          </section>

          <section>
            <SectionHeader label={t('dashboard.upcoming')}>
              <Button variant="primary" className={styles.newMeetingBtn} onClick={() => setShowCreateModal(true)}>
                + {t('dashboard.new_meeting')}
              </Button>
            </SectionHeader>
            {upcomingMeetings.length === 0
              ? <Card className={styles.simpleCard}>
                  <p className={styles.emptyText}>{t('dashboard.no_upcoming')}</p>
                </Card>
              : <Card className={styles.cardNoPad}>
                  {upcomingMeetings.map((m, i) => (
                    <UpcomingRow key={m.id} meeting={m} last={i === upcomingMeetings.length - 1} formatDate={formatDate} onEdit={() => setEditingMeeting(m)} isFacilitator={isFacilitator} navigate={navigate} t={t} communitySlug={community?.slug} />
                  ))}
                </Card>
            }
          </section>

          <section>
            <ArchiveList meetings={archiveMeetings} formatDate={formatDate} t={t} />
          </section>
        </div>
      </div>

      {(showCreateModal || editingMeeting) && (
        <MeetingFormModal
          meeting={editingMeeting}
          communityId={community?.id}
          communityLocations={community?.locations}
          facilitatorMembers={facilitatorMembers}
          onSave={saved => saved ? handleSaved() : handleDeleted()}
          onClose={() => { setShowCreateModal(false); setEditingMeeting(null) }}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AnnounceCard({ upcomingMeetings, onAnnounce, t }) {
  const [selected, setSelected] = useState(upcomingMeetings[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  if (upcomingMeetings.length === 0) {
    return (
      <Card className={styles.announceEmptyCard}>
        <p className={styles.emptyTextLg}>{t('dashboard.no_active_meeting')}</p>
      </Card>
    )
  }

  async function handleAnnounce() {
    if (!selected) return
    setLoading(true)
    setConfirming(false)
    try { await transitionStatus(selected, 'open'); onAnnounce() }
    finally { setLoading(false) }
  }

  return (
    <Card className={styles.announceCard}>
      <p className={styles.announceHint}>{t('dashboard.no_announced_hint')}</p>
      <div className={styles.announceRow}>
        <Select
          className={styles.announceSelect}
          value={selected}
          onChange={e => { setSelected(e.target.value); setConfirming(false) }}
        >
          {upcomingMeetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        {confirming ? (
          <div className={styles.announceConfirmRow}>
            <span className={styles.announceConfirmText}>{t('dashboard.announce_confirm')}</span>
            <Button variant="primary" className={styles.confirmYesBtn} onClick={handleAnnounce} disabled={loading}>
              {loading ? t('common.loading') : t('dashboard.announce_yes')}
            </Button>
            <Button variant="secondary" className={styles.confirmCancelBtn} onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        ) : (
          <Button variant="primary" onClick={() => setConfirming(true)} disabled={!selected}>
            📢 {t('facilitate.announce')}
          </Button>
        )}
      </div>
    </Card>
  )
}

function HeaderLogo({ communityLogo, onFail, size = 'small' }) {
  const [failed, setFailed] = useState(false)
  const h = size === 'large' ? 80 : 40
  const maxW = size === 'large' ? 200 : 120

  useEffect(() => { if (communityLogo) setFailed(false) }, [communityLogo])

  if (communityLogo && !failed) {
    return <img src={communityLogo} alt="logo" style={{ height: h, maxWidth: maxW, objectFit: 'contain' }} onError={() => { setFailed(true); onFail?.() }} />
  }
  return <img src="/logo.png" alt="logo" style={{ height: h, maxWidth: maxW, objectFit: 'contain' }} onError={e => { e.currentTarget.style.display = 'none' }} />
}

function SectionHeader({ label, children }) {
  return (
    <div className={styles.sectionHeaderRow}>
      <SectionLabel fontSize="0.78rem" fontWeight={700} letterSpacing="0.09em">{label}</SectionLabel>
      {children}
    </div>
  )
}

function CurrentMeetingCard({ meeting: m, navigate, formatDate, onEdit, t, communityLocations, communitySlug }) {
  const isInSession = m.status === 'in_session'
  const accentColor = isInSession ? 'var(--color-green)' : 'var(--color-terracotta)'
  const loc = lookupLocation(m.location, communityLocations)
  return (
    <Card style={{ padding: 'var(--space-28)', borderLeft: `4px solid ${accentColor}` }}>
      <div className={styles.currentCardHeader}>
        <div>
          <span className={styles.currentCardBadge}>
            <Badge variant={statusVariant(m.status)}>{t(`phases.${m.status}`)}</Badge>
          </span>
          <h2 className={styles.currentMeetingName}>{m.name}</h2>
        </div>
        {!isInSession && (
          <Button variant="secondary" className={styles.editIconBtn} onClick={onEdit} title={t('dashboard.edit_meeting')}>
            ✏️
          </Button>
        )}
      </div>
      <div className={styles.currentMeetingInfo}>
        <span>📅 {formatDate(m.date)} &nbsp;·&nbsp; 🕐 {m.time}</span>
        <span> &nbsp;·&nbsp; 📍 {m.location}</span>
        {loc?.address && <span className={styles.currentCardLocAddress}>{loc.address}</span>}
        {loc?.maps_url && (
          <a href={loc.maps_url} target="_blank" rel="noopener noreferrer" className={styles.mapsLink}>
            🗺️ {t('settings.location_maps_link')}
          </a>
        )}
      </div>
      <div className={styles.currentCardBtns}>
        <Button variant="primary" onClick={() => navigate(`/${communitySlug}/meeting/${m.id}/facilitate`)}>
          🎙️ {t('home.nav_facilitator')}
        </Button>
        {isInSession && (
          <Button variant="secondary" onClick={() => window.open(`/${communitySlug}/meeting/${m.id}/display`, '_blank')}>
            📺 {t('home.nav_display')}
          </Button>
        )}
      </div>
    </Card>
  )
}

function UpcomingRow({ meeting: m, last, formatDate, onEdit, isFacilitator, navigate, t, communitySlug }) {
  return (
    <div className={`upcoming-row ${styles.upcomingRowOuter}`} style={{ borderBottom: last ? 'none' : '1px solid var(--color-sand)' }}>
      <div className={styles.upcomingRowLeft}>
        <div className={styles.upcomingRowName}>{m.name}</div>
        <div className={styles.upcomingRowMeta}>{formatDate(m.date)} · 📍 {m.location}</div>
      </div>
      <div className={styles.upcomingRowBtns}>
        {isFacilitator && (
          <Button
            variant="secondary"
            className={`upcoming-row-btn ${styles.upcomingBtn}`}
            onClick={() => navigate(`/${communitySlug}/meeting/${m.id}/facilitate`)}
          >
            🎙️ {t('facilitate.facilitate')}
          </Button>
        )}
        <Button
          variant="secondary"
          className={`upcoming-row-btn ${styles.upcomingBtn}`}
          onClick={onEdit}
        >
          ✏️ {t('common.edit')}
        </Button>
      </div>
    </div>
  )
}

function ArchiveList({ meetings, formatDate, t }) {
  const navigate = useNavigate()
  const { community } = useCommunity() || {}
  const [open, setOpen] = useState(false)

  return (
    <div>
      <div className={styles.archiveHeader}>
        <Button variant="secondary" className={styles.archiveLabelBtn} onClick={() => setOpen(o => !o)}>
          {t('dashboard.archive')}
          <span className={styles.archiveChevron}>{open ? '▼' : '▶'}</span>
        </Button>
      </div>
      {open && (meetings.length === 0
        ? <Card style={{ padding: 'var(--space-20)' }}>
            <p className={styles.emptyText}>{t('dashboard.no_archive')}</p>
          </Card>
        : <Card className={styles.cardNoPad}>
            {meetings.map(m => (
              <div
                key={m.id}
                className={styles.archiveItem}
                onClick={() => navigate(`/${community?.slug}/meeting/${m.id}/archive`)}
              >
                <span>📁</span>
                <div>
                  <div className={styles.archiveItemName}>{m.name}</div>
                  <div className={styles.archiveItemMeta}>{formatDate(m.date)} · {m.location}</div>
                </div>
              </div>
            ))}
          </Card>
      )}
    </div>
  )
}
