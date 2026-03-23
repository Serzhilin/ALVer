import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAllMeetings } from '../api/client'
import { useUser } from '../context/UserContext'
import { useCommunity } from '../context/CommunityContext'
import LoginScreen from '../components/LoginScreen'
import MeetingFormModal from '../components/MeetingFormModal'
import SettingsModal from '../components/SettingsModal'
import MembersModal from '../components/MembersModal'

const FACILITATOR_ENAME = import.meta.env.VITE_FACILITATOR_ENAME
const CURRENT_STATUSES  = ['in_session', 'open']
const UPCOMING_STATUSES = ['draft']
const ARCHIVE_STATUSES  = ['closed', 'archived']

function statusColor(s) {
  return { draft: 'badge-gray', open: 'badge-blue', in_session: 'badge-green', closed: 'badge-gray', archived: 'badge-gray' }[s] || 'badge-gray'
}

function lookupLocation(name, communityLocations) {
  const locs = communityLocations?.length ? communityLocations : []
  return locs.find(l => l.name === name) ?? null
}

export default function Home() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { user, loading: authLoading, login, logout } = useUser()
  const { community } = useCommunity() || {}
  const [meetings, setMeetings] = useState([])
  const [meetingsLoading, setMeetingsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingMeeting, setEditingMeeting] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const userMenuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

  const isFacilitator = user?.ename === FACILITATOR_ENAME
  const dateLocale = i18n.language === 'nl' ? 'nl-NL' : 'en-GB'

  function loadMeetings() {
    setMeetingsLoading(true)
    getAllMeetings()
      .then(setMeetings)
      .catch(e => setError(e.message))
      .finally(() => setMeetingsLoading(false))
  }

  useEffect(() => { if (user) loadMeetings() }, [user])

  // ── Auth loading ──────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</span>
      </div>
    )
  }

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: '2.8rem', marginBottom: 12 }}>🏛️</div>
            <h1 style={{ fontSize: '1.6rem', margin: '0 0 8px', fontFamily: 'Playfair Display, serif' }}>ALVer</h1>
            <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.9rem' }}>{t('home.subtitle')}</p>
          </div>
          <div className="card" style={{ padding: 28 }}>
            <LoginScreen onSuccess={login} nameOption={false} />
          </div>
        </div>
      </div>
    )
  }

  // ── Logged in ─────────────────────────────────────────────────────────────
  const currentMeeting  = meetings.find(m => CURRENT_STATUSES.includes(m.status))
  const upcomingMeetings = meetings
    .filter(m => UPCOMING_STATUSES.includes(m.status))
    .sort((a, b) => a.date.localeCompare(b.date))
  const archiveMeetings = meetings
    .filter(m => ARCHIVE_STATUSES.includes(m.status))
    .sort((a, b) => b.date.localeCompare(a.date))

  function formatDate(dateStr) {
    if (!dateStr) return ''
    return new Date(dateStr + 'T12:00').toLocaleDateString(dateLocale, {
      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    })
  }

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
      {/* Header */}
      <header style={{ borderBottom: '1px solid var(--color-sand)', background: 'white', padding: '0 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <HeaderLogo communityLogo={community?.logo_url} onFail={() => setLogoFailed(true)} />
            <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 600, fontSize: '1.2rem', color: 'var(--color-charcoal)' }}>
              {community?.name || 'ALVer'}
            </span>
          </div>
          <div ref={userMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              title={user.displayName}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: isFacilitator ? 'var(--color-terracotta)' : 'var(--color-sand-dark)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', color: 'white', fontWeight: 600,
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {user.displayName?.[0]?.toUpperCase() ?? '?'}
            </button>

            {showUserMenu && (
              <div style={{
                position: 'absolute', top: 44, right: 0, zIndex: 100,
                background: 'white', border: '1px solid var(--color-sand)',
                borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                minWidth: 200, overflow: 'hidden',
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-sand)' }}>
                  <div style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)', marginBottom: 2 }}>
                    {isFacilitator ? '🎙️ facilitator' : '👤 attendee'}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--color-charcoal)' }}>
                    {user.displayName}
                  </div>
                </div>

                <MenuItem onClick={() => { i18n.changeLanguage(i18n.language === 'nl' ? 'en' : 'nl'); setShowUserMenu(false) }}>
                  🌐 {i18n.language === 'nl' ? 'Switch to English' : 'Schakel naar Nederlands'}
                </MenuItem>

                {isFacilitator && (
                  <MenuItem onClick={() => { setShowMembers(true); setShowUserMenu(false) }}>
                    👥 {t('settings.members_label')}
                  </MenuItem>
                )}

                {isFacilitator && (
                  <MenuItem onClick={() => { setShowSettings(true); setShowUserMenu(false) }}>
                    ⚙️ {t('settings.title')}
                  </MenuItem>
                )}

                <div style={{ borderTop: '1px solid var(--color-sand)' }}>
                  <MenuItem onClick={() => { logout(); setShowUserMenu(false) }} danger>
                    {t('home.logout')}
                  </MenuItem>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>
        {error && (
          <div className="card" style={{ padding: 16, borderLeft: '4px solid var(--color-red)', marginBottom: 24 }}>
            <strong style={{ color: 'var(--color-red)' }}>{t('home.error_api')}</strong>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-light)', marginLeft: 8 }}>{error}</span>
          </div>
        )}

        {/* ── Facilitator dashboard ── */}
        {isFacilitator ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

            {/* Section: Current meeting */}
            <section>
              <SectionHeader label={t('dashboard.current_meeting')} />
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
                  : <div className="card" style={{ padding: 32, textAlign: 'center' }}>
                      <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.95rem' }}>
                        {t('dashboard.no_active_meeting')}
                      </p>
                    </div>
              }
            </section>

            {/* Section: Upcoming + New ALV button */}
            <section>
              <SectionHeader label={t('dashboard.upcoming')}>
                <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '6px 14px' }} onClick={() => setShowCreateModal(true)}>
                  + {t('dashboard.new_meeting')}
                </button>
              </SectionHeader>

              {upcomingMeetings.length === 0
                ? <div className="card" style={{ padding: '18px 20px' }}>
                    <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.88rem' }}>
                      {t('dashboard.no_upcoming')}
                    </p>
                  </div>
                : <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {upcomingMeetings.map((m, i) => (
                      <UpcomingRow
                        key={m.id}
                        meeting={m}
                        last={i === upcomingMeetings.length - 1}
                        formatDate={formatDate}
                        onEdit={() => setEditingMeeting(m)}
                        navigate={navigate}
                        t={t}
                      />
                    ))}
                  </div>
              }
            </section>

            {/* Section: Archive */}
            <section>
              <SectionHeader label={t('dashboard.archive')} />
              {archiveMeetings.length === 0
                ? <div className="card" style={{ padding: '18px 20px' }}>
                    <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.88rem' }}>
                      {t('dashboard.no_archive')}
                    </p>
                  </div>
                : <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {archiveMeetings.map((m, i) => (
                      <div
                        key={m.id}
                        onClick={() => navigate(`/meeting/${m.id}/archive`)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '14px 20px',
                          borderBottom: i < archiveMeetings.length - 1 ? '1px solid var(--color-sand)' : 'none',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-cream)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                      >
                        <span>📁</span>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>{m.name}</div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>
                            {formatDate(m.date)} · {m.location}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </section>
          </div>

        ) : (
          /* ── Attendee view ── */
          <>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: '1.6rem', margin: '0 0 6px' }}>{t('home.title')}</h1>
              <p style={{ color: 'var(--color-charcoal-light)', margin: 0 }}>{t('home.subtitle')}</p>
            </div>
            {meetingsLoading && <p style={{ color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {meetings.filter(m => CURRENT_STATUSES.includes(m.status)).map(m => (
                <div key={m.id} className="card" style={{ padding: 20 }}>
                  <span className={`badge ${statusColor(m.status)}`} style={{ marginBottom: 8, display: 'inline-block' }}>{t(`phases.${m.status}`)}</span>
                  <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>{m.name}</h2>
                  <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: '0 0 14px' }}>
                    📅 {formatDate(m.date)} · 🕐 {m.time} · 📍 {m.location}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-primary" style={{ fontSize: '0.85rem' }} onClick={() => navigate(`/meeting/${m.id}/attend`)}>
                      {t('home.nav_attendee')}
                    </button>
                    <button className="btn-secondary" style={{ fontSize: '0.85rem' }} onClick={() => navigate(`/meeting/${m.id}/register`)}>
                      {t('home.nav_register')}
                    </button>
                  </div>
                </div>
              ))}
              {!meetingsLoading && meetings.filter(m => CURRENT_STATUSES.includes(m.status)).length === 0 && (
                <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                  <p style={{ color: 'var(--color-charcoal-light)', margin: 0 }}>{t('home.empty')}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {(showCreateModal || editingMeeting) && (
        <MeetingFormModal
          meeting={editingMeeting}
          communityId={community?.id}
          communityLocations={community?.locations}
          onSave={saved => saved ? handleSaved() : handleDeleted()}
          onClose={() => { setShowCreateModal(false); setEditingMeeting(null) }}
        />
      )}
      {showMembers && <MembersModal onClose={() => setShowMembers(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function HeaderLogo({ communityLogo, onFail }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (communityLogo) setFailed(false)
  }, [communityLogo])

  if (communityLogo && !failed) {
    return (
      <img
        src={communityLogo}
        alt="logo"
        style={{ height: 40, maxWidth: 120, objectFit: 'contain' }}
        onError={() => { setFailed(true); onFail?.() }}
      />
    )
  }

  // fallback: /Logo.png > emoji
  return (
    <img
      src="/Logo.png"
      alt="logo"
      style={{ height: 40, maxWidth: 120, objectFit: 'contain' }}
      onError={e => { e.currentTarget.style.display = 'none' }}
    />
  )
}

function MenuItem({ onClick, children, danger = false }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '10px 16px', border: 'none', cursor: 'pointer',
        fontSize: '0.88rem', fontFamily: 'Inter, sans-serif',
        background: hover ? 'var(--color-cream)' : 'white',
        color: danger ? 'var(--color-red)' : 'var(--color-charcoal)',
      }}
    >
      {children}
    </button>
  )
}

function SectionHeader({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-charcoal-light)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
        {label}
      </h2>
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
          <span className={`badge ${statusColor(m.status)}`} style={{ marginBottom: 8, display: 'inline-block' }}>
            {t(`phases.${m.status}`)}
          </span>
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

function UpcomingRow({ meeting: m, last, formatDate, onEdit, navigate, t }) {
  return (
    <div
      onClick={() => navigate(`/meeting/${m.id}/facilitate`)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px',
        borderBottom: last ? 'none' : '1px solid var(--color-sand)',
        cursor: 'pointer',
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-cream)'}
      onMouseLeave={e => e.currentTarget.style.background = 'white'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>{m.name}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>
            {formatDate(m.date)} · 📍 {m.location}
          </div>
        </div>
      </div>
      <button
        onClick={e => { e.stopPropagation(); onEdit() }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--color-charcoal-light)', padding: '4px 6px' }}
      >
        ✏️
      </button>
    </div>
  )
}
