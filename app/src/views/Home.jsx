import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
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

const CURRENT_STATUSES  = ['in_session', 'open']
const UPCOMING_STATUSES = ['draft']
const ARCHIVE_STATUSES  = ['archived']

function statusColor(s) {
  return { draft: 'badge-gray', open: 'badge-blue', in_session: 'badge-green', archived: 'badge-gray' }[s] || 'badge-gray'
}

function lookupLocation(name, communityLocations) {
  const locs = communityLocations?.length ? communityLocations : []
  return locs.find(l => l.name === name) ?? null
}

export default function Home() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { user, isFacilitator, loading: authLoading, login, logout } = useUser()
  const { community, members } = useCommunity() || {}
  const { meeting: ctxMeeting, setMeetingId, preRegister, addMandate, removeAttendee, revokeMandate } = useMeeting()
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
  const [proxyName, setProxyName] = useState('')
  const [mandateNote, setMandateNote] = useState('')
  const [agendaOpen, setAgendaOpen] = useState(false)
  const [meetingMembersList, setMeetingMembersList] = useState([])
  const [submitting, setSubmitting] = useState(false)

  function loadMeetings() {
    setMeetingsLoading(true)
    getAllMeetings()
      .then(setMeetings)
      .catch(e => setError(e.message))
      .finally(() => setMeetingsLoading(false))
  }

  useEffect(() => { loadMeetings() }, [user])

  const currentMeeting = meetings.find(m => CURRENT_STATUSES.includes(m.status))

  // Init MeetingContext for attendee actions (preRegister, addMandate, etc.)
  useEffect(() => {
    if (currentMeeting && !isFacilitator) setMeetingId(currentMeeting.id)
  }, [currentMeeting?.id, isFacilitator])

  // Read pre-reg status from localStorage when meeting is known
  useEffect(() => {
    if (!currentMeeting) { setLocalPreReg(null); return }
    try {
      const s = localStorage.getItem(`alver_checkin_${currentMeeting.id}`)
      setLocalPreReg(s ? JSON.parse(s) : null)
    } catch { setLocalPreReg(null) }
  }, [currentMeeting?.id])

  // Load members when mandate form opens
  useEffect(() => {
    if (currentMeeting && attendanceMode === 'mandate') {
      getMeetingMembers(currentMeeting.id).then(setMeetingMembersList).catch(() => {})
    }
  }, [attendanceMode, currentMeeting?.id])

  // ── Auth loading ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</span>
      </div>
    )
  }

  // ── Redirect checked-in attendee back to their meeting ────────────────────
  const checkedInName = localStorage.getItem('alver_my_name')
  const storedMeetingId = localStorage.getItem('alver_attend_meeting_id')
  const redirectMeetingId = storedMeetingId || currentMeeting?.id
  if (!isFacilitator && checkedInName) {
    // If we don't have a meeting ID yet, wait for meetings to load before deciding
    if (!redirectMeetingId && meetingsLoading) {
      return (
        <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</span>
        </div>
      )
    }
    if (redirectMeetingId) {
      return <Navigate to={`/meeting/${redirectMeetingId}/attend`} replace />
    }
  }

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: '2.8rem', marginBottom: 12 }}>🏛️</div>
            <h1 style={{ fontSize: '1.6rem', margin: '0 0 8px', fontFamily: 'var(--font-title)' }}>ALVer</h1>
            <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.9rem' }}>{t('home.subtitle')}</p>
          </div>
          <div className="card" style={{ padding: 28 }}>
            <LoginScreen onSuccess={login} nameOption={false} />
          </div>
          <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>
            {t('home.facilitator_hint')}{' '}
            <a href="/facilitator-login" style={{ color: 'var(--color-terracotta)', textDecoration: 'none', fontWeight: 500 }}>
              {t('home.facilitator_link')}
            </a>
          </p>
        </div>
      </div>
    )
  }

  // ── Attendee actions ──────────────────────────────────────────────────────
  async function handleIllCome() {
    const name = (user?.firstName && user?.lastName)
      ? `${user.firstName} ${user.lastName}`
      : user?.displayName
    if (!name || !currentMeeting) return
    setSubmitting(true)
    try {
      await preRegister(name)
      const data = { type: 'attend', name }
      localStorage.setItem(`alver_checkin_${currentMeeting.id}`, JSON.stringify(data))
      setLocalPreReg(data)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMandateSubmit() {
    const name = (user?.firstName && user?.lastName)
      ? `${user.firstName} ${user.lastName}`
      : user?.displayName
    if (!name || !proxyName || !currentMeeting) return
    setSubmitting(true)
    try {
      await addMandate(name, proxyName, mandateNote)
      const data = { type: 'mandate', name, proxy: proxyName }
      localStorage.setItem(`alver_checkin_${currentMeeting.id}`, JSON.stringify(data))
      setLocalPreReg(data)
      setAttendanceMode(null)
      setProxyName('')
      setMandateNote('')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCannotCome() {
    if (!currentMeeting) return
    localStorage.setItem(`alver_checkin_${currentMeeting.id}`, JSON.stringify({ type: 'decline' }))
    setLocalPreReg({ type: 'decline' })
  }

  async function handleModify() {
    if (!currentMeeting) return
    if (localPreReg?.type === 'attend' && ctxMeeting) {
      const preReg = ctxMeeting.preRegistrations.find(p => p.name.toLowerCase() === localPreReg.name?.toLowerCase())
      if (preReg) await removeAttendee(preReg.id).catch(() => {})
    }
    if (localPreReg?.type === 'mandate' && localPreReg.name) {
      await revokeMandate(localPreReg.name).catch(() => {})
    }
    localStorage.removeItem(`alver_checkin_${currentMeeting.id}`)
    setLocalPreReg(null)
    setAttendanceMode(null)
    setProxyName('')
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
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', flexDirection: 'column' }}>
        <AppHeader logo={community?.logo_url} user={user} onLogout={logout} />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <HeaderLogo communityLogo={community?.logo_url} size="large" />
          </div>

          {meetingsLoading ? (
            <span style={{ color: 'var(--color-charcoal-light)', fontSize: '0.9rem' }}>{t('common.loading')}</span>
          ) : currentMeeting ? (
            <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 0 }}>
              {isLive && (
                <div style={{ background: 'var(--color-green)', borderRadius: '14px 14px 0 0', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="animate-pulse-soft" style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.9)', display: 'inline-block' }} />
                  <span style={{ color: 'white', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {t('dashboard.meeting_live')}
                  </span>
                </div>
              )}

              <div style={{ background: 'white', borderRadius: isLive ? '0 0 14px 14px' : 14, padding: '28px 24px', boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>
                <h1 style={{ margin: '0 0 16px', fontSize: '1.5rem', fontFamily: 'var(--font-title)', color: 'var(--color-charcoal)', lineHeight: 1.2 }}>
                  {currentMeeting.name}
                </h1>

                {/* Meeting meta */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 20 }}>
                  {dateStr && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.9rem', color: 'var(--color-charcoal-light)' }}>
                      <span>📅</span><span>{dateStr}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.9rem', color: 'var(--color-charcoal-light)' }}>
                    <span>🕐</span><span>{currentMeeting.time}</span>
                  </div>
                  {currentMeeting.facilitator_name && (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.9rem', color: 'var(--color-charcoal-light)' }}>
                      <span>🎙️</span><span>{currentMeeting.facilitator_name}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: '0.9rem', color: 'var(--color-charcoal-light)' }}>
                    <span>📍</span>
                    <span>
                      {currentMeeting.location}
                      {loc?.address && <span style={{ display: 'block', fontSize: '0.82rem', marginTop: 2 }}>{loc.address}</span>}
                      {loc?.maps_url && (
                        <a href={loc.maps_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-block', marginTop: 3, fontSize: '0.8rem', color: 'var(--color-terracotta)', textDecoration: 'none' }}>
                          🗺️ {t('settings.location_maps_link')}
                        </a>
                      )}
                    </span>
                  </div>
                </div>

                {/* Collapsible agenda */}
                {agenda && (
                  <div style={{ marginBottom: 20, borderTop: '1px solid var(--color-sand)', paddingTop: 14 }}>
                    <button
                      onClick={() => setAgendaOpen(o => !o)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-charcoal-light)', padding: 0 }}
                    >
                      <span>{agendaOpen ? '▼' : '▶'}</span>
                      <span>{t('common.agenda')}</span>
                    </button>
                    {agendaOpen && (
                      <AgendaHtml html={agenda} style={{ marginTop: 10, fontSize: '0.83rem', lineHeight: 1.7 }} />
                    )}
                  </div>
                )}

                {/* ── Action area ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {isLive && !localPreReg && (
                    <div style={{ padding: '12px 16px', background: 'rgba(45,122,74,0.06)', border: '1.5px solid rgba(45,122,74,0.25)', borderRadius: 10, fontSize: '0.88rem', color: 'var(--color-green)', fontWeight: 500, textAlign: 'center' }}>
                      {t('home.scan_qr_to_checkin')}
                    </div>
                  )}

                  {localPreReg?.type === 'attend' ? (
                    <>
                      <div style={{ padding: '12px 16px', background: 'rgba(45,122,74,0.08)', border: '1.5px solid rgba(45,122,74,0.3)', borderRadius: 10, fontSize: '0.88rem', color: 'var(--color-green)', fontWeight: 500, textAlign: 'center' }}>
                        {t('home.preregistered_status')}
                      </div>
                      <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem' }} onClick={handleModify}>
                        {t('home.btn_modify')}
                      </button>
                    </>

                  ) : localPreReg?.type === 'mandate' ? (
                    <>
                      <div style={{ padding: '12px 16px', background: 'rgba(45,98,196,0.07)', border: '1.5px solid rgba(45,98,196,0.25)', borderRadius: 10, fontSize: '0.88rem', color: '#2D62C4', fontWeight: 500, textAlign: 'center' }}>
                        📜 {t('home.mandate_status', { proxy: localPreReg.proxy })}
                      </div>
                      <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem' }} onClick={handleModify}>
                        {t('home.btn_modify')}
                      </button>
                    </>

                  ) : localPreReg?.type === 'decline' ? (
                    <>
                      <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.04)', border: '1.5px solid var(--color-sand-dark)', borderRadius: 10, fontSize: '0.88rem', color: 'var(--color-charcoal-light)', textAlign: 'center' }}>
                        👋 {t('home.decline_status')}
                      </div>
                      <button className="btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem' }} onClick={handleModify}>
                        {t('home.btn_modify')}
                      </button>
                    </>

                  ) : attendanceMode === 'mandate' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>📜 {t('register.give_mandate_title')}</h3>
                      <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--color-charcoal-light)' }}>{t('register.give_mandate_hint')}</p>
                      <select
                        className="input"
                        value={proxyName}
                        onChange={e => setProxyName(e.target.value)}
                        autoFocus
                      >
                        <option value="">{t('register.proxy_placeholder')}</option>
                        {meetingMembersList.map(m => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                      <input
                        className="input"
                        value={mandateNote}
                        onChange={e => setMandateNote(e.target.value)}
                        placeholder={t('register.note_placeholder')}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn-primary"
                          style={{ flex: 1, justifyContent: 'center' }}
                          disabled={!proxyName || submitting}
                          onClick={handleMandateSubmit}
                        >
                          {submitting ? t('common.loading') : t('register.sign_confirm')}
                        </button>
                        <button className="btn-secondary" onClick={() => { setAttendanceMode(null); setProxyName(''); setMandateNote('') }}>
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>

                  ) : (
                    <>
                      <button
                        className="btn-primary"
                        style={{ width: '100%', justifyContent: 'center', fontSize: '1rem', padding: '16px' }}
                        disabled={submitting}
                        onClick={handleIllCome}
                      >
                        {submitting ? t('common.loading') : t('home.btn_ill_come')}
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem' }}
                        onClick={() => setAttendanceMode('mandate')}
                      >
                        {t('home.btn_mandate_short')}
                      </button>
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-charcoal-light)', fontSize: '0.85rem', padding: '6px 0', textAlign: 'center' }}
                        onClick={handleCannotCome}
                      >
                        {t('home.btn_cant_come')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ width: '100%', maxWidth: 420, background: 'white', borderRadius: 14, padding: '28px 24px', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 16 }}>🏛️</div>
              <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.95rem', margin: 0, lineHeight: 1.6 }}>
                {t('dashboard.no_active_meeting')}
              </p>
            </div>
          )}

          <div style={{ width: '100%', maxWidth: 420, marginTop: 32 }}>
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
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)' }}>
      <FacilitatorHeader />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>
        {error && (
          <div className="card" style={{ padding: 16, borderLeft: '4px solid var(--color-red)', marginBottom: 24 }}>
            <strong style={{ color: 'var(--color-red)' }}>{t('home.error_api')}</strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-light)', marginLeft: 8 }}>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          <section>
            <SectionHeader label={
              currentMeeting?.status === 'in_session'
                ? t('dashboard.meeting_live')
                : currentMeeting?.status === 'open'
                  ? t('dashboard.meeting_announced')
                  : t('dashboard.current_meeting')
            } />
            {meetingsLoading
              ? <p style={{ color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</p>
              : currentMeeting
                ? <CurrentMeetingCard
                    meeting={currentMeeting}
                    navigate={navigate}
                    formatDate={formatDate}
                    onEdit={() => setEditingMeeting(currentMeeting)}
                    t={t}
                    communityLocations={community?.locations}
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
              <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '6px 14px' }} onClick={() => setShowCreateModal(true)}>
                + {t('dashboard.new_meeting')}
              </button>
            </SectionHeader>
            {upcomingMeetings.length === 0
              ? <div className="card" style={{ padding: '18px 20px' }}>
                  <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.88rem' }}>{t('dashboard.no_upcoming')}</p>
                </div>
              : <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {upcomingMeetings.map((m, i) => (
                    <UpcomingRow key={m.id} meeting={m} last={i === upcomingMeetings.length - 1} formatDate={formatDate} onEdit={() => setEditingMeeting(m)} isFacilitator={isFacilitator} navigate={navigate} t={t} />
                  ))}
                </div>
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

  if (upcomingMeetings.length === 0) {
    return (
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.95rem' }}>{t('dashboard.no_active_meeting')}</p>
      </div>
    )
  }

  async function handleAnnounce() {
    if (!selected) return
    setLoading(true)
    try { await transitionStatus(selected, 'open'); onAnnounce() }
    finally { setLoading(false) }
  }

  return (
    <div className="card" style={{ padding: 28, borderLeft: '4px solid var(--color-sand-dark)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-charcoal-light)' }}>{t('dashboard.no_announced_hint')}</p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="input" value={selected} onChange={e => setSelected(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
          {upcomingMeetings.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <button className="btn-primary" onClick={handleAnnounce} disabled={loading || !selected}>
          📢 {loading ? t('common.loading') : t('facilitate.announce')}
        </button>
      </div>
    </div>
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
  return <img src="/Logo.png" alt="logo" style={{ height: h, maxWidth: maxW, objectFit: 'contain' }} onError={e => { e.currentTarget.style.display = 'none' }} />
}

function SectionHeader({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-charcoal-light)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>{label}</h2>
      {children}
    </div>
  )
}

function CurrentMeetingCard({ meeting: m, navigate, formatDate, onEdit, t, communityLocations }) {
  const isInSession = m.status === 'in_session'
  const accentColor = isInSession ? 'var(--color-green)' : 'var(--color-terracotta)'
  const loc = lookupLocation(m.location, communityLocations)
  return (
    <div className="card" style={{ padding: 28, borderLeft: `4px solid ${accentColor}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <div>
          <span className={`badge ${statusColor(m.status)}`} style={{ marginBottom: 8, display: 'inline-block' }}>{t(`phases.${m.status}`)}</span>
          <h2 style={{ margin: 0, fontSize: '1.4rem', color: 'var(--color-charcoal)' }}>{m.name}</h2>
        </div>
        {!isInSession && (
          <button onClick={onEdit} title={t('dashboard.edit_meeting')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--color-charcoal-light)', padding: '4px', flexShrink: 0 }}>
            ✏️
          </button>
        )}
      </div>
      <div style={{ color: 'var(--color-charcoal-light)', fontSize: '0.9rem', margin: '0 0 22px' }}>
        <span>📅 {formatDate(m.date)} &nbsp;·&nbsp; 🕐 {m.time}</span>
        <span> &nbsp;·&nbsp; 📍 {m.location}</span>
        {loc?.address && <span style={{ display: 'block', fontSize: '0.82rem', marginTop: 3 }}>{loc.address}</span>}
        {loc?.maps_url && (
          <a href={loc.maps_url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: 3, fontSize: '0.8rem', color: 'var(--color-terracotta)', textDecoration: 'none' }}>
            🗺️ {t('settings.location_maps_link')}
          </a>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn-primary" onClick={() => navigate(`/meeting/${m.id}/facilitate`)}>
          🎙️ {t('home.nav_facilitator')}
        </button>
        {isInSession && (
          <button className="btn-secondary" onClick={() => window.open(`/meeting/${m.id}/display`, '_blank')}>
            📺 {t('home.nav_display')}
          </button>
        )}
      </div>
    </div>
  )
}

function UpcomingRow({ meeting: m, last, formatDate, onEdit, isFacilitator, navigate, t }) {
  return (
    <div className="upcoming-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: last ? 'none' : '1px solid var(--color-sand)' }}>
      <div>
        <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>{m.name}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>{formatDate(m.date)} · 📍 {m.location}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {isFacilitator && (
          <button onClick={() => navigate(`/meeting/${m.id}/facilitate`)} className="upcoming-row-btn">
            🎙️ {t('facilitate.facilitate')}
          </button>
        )}
        <button onClick={onEdit} className="upcoming-row-btn">
          ✏️ {t('common.edit')}
        </button>
      </div>
    </div>
  )
}

function ArchiveList({ meetings, formatDate, t }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-charcoal-light)', fontFamily: 'inherit' }}
        >
          {t('dashboard.archive')}
          <span style={{ fontSize: '0.7rem' }}>{open ? '▼' : '▶'}</span>
        </button>
      </div>
      {open && (meetings.length === 0
        ? <div className="card" style={{ padding: '18px 20px' }}>
            <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.88rem' }}>{t('dashboard.no_archive')}</p>
          </div>
        : <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {meetings.map((m, i) => (
              <div
                key={m.id}
                onClick={() => navigate(`/meeting/${m.id}/archive`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: i < meetings.length - 1 ? '1px solid var(--color-sand)' : 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--color-cream)'}
                onMouseLeave={e => e.currentTarget.style.background = 'white'}
              >
                <span>📁</span>
                <div>
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>{m.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>{formatDate(m.date)} · {m.location}</div>
                </div>
              </div>
            ))}
          </div>
      )}
    </div>
  )
}
