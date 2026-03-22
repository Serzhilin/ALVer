import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAllMeetings } from '../api/client'
import { useUser } from '../context/UserContext'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import LoginScreen from '../components/LoginScreen'

const FACILITATOR_ENAME = import.meta.env.VITE_FACILITATOR_ENAME

export default function Home() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { user, loading: authLoading, login, logout } = useUser()
  const [meetings, setMeetings] = useState([])
  const [meetingsLoading, setMeetingsLoading] = useState(false)
  const [error, setError] = useState(null)

  const isFacilitator = user?.ename === FACILITATOR_ENAME

  useEffect(() => {
    if (!user) return
    setMeetingsLoading(true)
    getAllMeetings()
      .then(setMeetings)
      .catch(e => setError(e.message))
      .finally(() => setMeetingsLoading(false))
  }, [user])

  const dateLocale = i18n.language === 'nl' ? 'nl-NL' : 'en-GB'

  // ── Loading auth state ────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</span>
      </div>
    )
  }

  // ── Not logged in → login screen ─────────────────────────────────────────
  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ maxWidth: 420, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: '2.8rem', marginBottom: 12 }}>🏛️</div>
            <h1 style={{ fontSize: '1.6rem', margin: '0 0 8px', fontFamily: 'Playfair Display, serif' }}>ALVer</h1>
            <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.9rem' }}>
              {t('home.subtitle')}
            </p>
          </div>
          <div className="card" style={{ padding: 28 }}>
            <LoginScreen onSuccess={login} nameOption={false} />
          </div>
        </div>
      </div>
    )
  }

  // ── Logged in → meeting list ──────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)' }}>
      <header style={{ borderBottom: '1px solid var(--color-sand)', background: 'white', padding: '0 24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.5rem' }}>🏛️</span>
            <span style={{ fontFamily: 'Playfair Display, serif', fontWeight: 600, fontSize: '1.2rem', color: 'var(--color-charcoal)' }}>
              ALVer
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>
              {isFacilitator ? '🎙️' : '👤'} {user.displayName}
            </span>
            <button
              onClick={logout}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-charcoal-light)' }}
            >
              {t('home.logout', 'Uitloggen')}
            </button>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: '1.8rem', margin: '0 0 6px', color: 'var(--color-charcoal)' }}>
            {isFacilitator ? t('home.title_facilitator', 'Dashboard') : t('home.title')}
          </h1>
          <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.95rem', margin: 0 }}>
            {isFacilitator
              ? t('home.subtitle_facilitator', 'Beheer en faciliteer vergaderingen')
              : t('home.subtitle')}
          </p>
        </div>

        {meetingsLoading && <p style={{ color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</p>}
        {error && (
          <div className="card" style={{ padding: 20, borderLeft: '4px solid var(--color-red)' }}>
            <strong style={{ color: 'var(--color-red)' }}>{t('home.error_api')}</strong>
            <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--color-charcoal-light)' }}>
              {error} {t('home.error_hint')} (<code>npm run dev</code>)
            </p>
          </div>
        )}

        {!meetingsLoading && !error && meetings.length === 0 && (
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ color: 'var(--color-charcoal-light)', margin: 0 }}>
              {t('home.empty')}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {meetings.map(m => (
            <MeetingCard
              key={m.id}
              meeting={m}
              navigate={navigate}
              dateLocale={dateLocale}
              isFacilitator={isFacilitator}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function MeetingCard({ meeting: m, navigate, dateLocale, isFacilitator }) {
  const { t } = useTranslation()
  const phaseLabel = t(`phases.${m.status}`, { defaultValue: t('phases.draft') })
  const phaseColor = {
    draft: 'badge-gray',
    published: 'badge-orange',
    open: 'badge-blue',
    in_session: 'badge-green',
    closed: 'badge-gray',
    archived: 'badge-gray',
  }[m.status] || 'badge-gray'

  const mid = m.id
  const dateStr = m.date
    ? new Date(m.date + 'T12:00').toLocaleDateString(dateLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ marginBottom: 6 }}>
            <span className={`badge ${phaseColor}`}>{phaseLabel}</span>
          </div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-charcoal)' }}>{m.name}</h2>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-light)' }}>📅 {dateStr}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-light)' }}>🕐 {m.time}</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-light)' }}>📍 {m.location}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {isFacilitator ? (
          <>
            <NavBtn icon="🎙️" label={t('home.nav_facilitator')} color="var(--color-terracotta)" onClick={() => navigate(`/meeting/${mid}/facilitate`)} />
            <NavBtn icon="📺" label={t('home.nav_display')} color="#8B6914" onClick={() => window.open(`/meeting/${mid}/display`, '_blank')} />
            <NavBtn icon="📁" label={t('home.nav_archive')} color="var(--color-charcoal-light)" onClick={() => navigate(`/meeting/${mid}/archive`)} />
          </>
        ) : (
          <>
            <NavBtn icon="👤" label={t('home.nav_attendee')} color="#2D62C4" onClick={() => navigate(`/meeting/${mid}/attend`)} />
            <NavBtn icon="📋" label={t('home.nav_register')} color="var(--color-green)" onClick={() => navigate(`/meeting/${mid}/register`)} />
          </>
        )}
      </div>
    </div>
  )
}

function NavBtn({ icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--color-cream)', border: '1px solid var(--color-sand-dark)',
        borderRadius: 8, padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
        fontFamily: 'Inter, sans-serif', transition: 'all 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = 'white' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-sand-dark)'; e.currentTarget.style.background = 'var(--color-cream)' }}
    >
      <span style={{ marginRight: 6 }}>{icon}</span>
      <span style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--color-charcoal)' }}>{label}</span>
    </button>
  )
}
