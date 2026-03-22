import { useState, useEffect } from 'react'
import { useMeeting } from '../context/MeetingContext'
import { useUser } from '../context/UserContext'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import LoginScreen from '../components/LoginScreen'

export default function Register() {
  const { id } = useParams()
  const { meeting, checkIn, addMandate, revokeMandate, setMeetingId } = useMeeting()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { user, login } = useUser()

  useEffect(() => { setMeetingId(id) }, [id])
  if (!meeting) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</div>
  const [mode, setMode] = useState(null) // null | 'login' | 'attend' | 'mandate'
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [proxyName, setProxyName] = useState('')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(null) // { type, name, proxy? }

  // Check if already registered
  const existingCheckIn = name ? meeting.checkedIn.find(c => c.name.toLowerCase() === name.toLowerCase()) : null
  const existingMandate = name ? meeting.confirmedMandates.find(m => m.from.toLowerCase() === name.toLowerCase()) : null

  function handleAttendSubmit() {
    const effectiveName = name || user?.displayName || ''
    if (!effectiveName) return
    checkIn(effectiveName)
    setDone({ type: 'attend', name: effectiveName })
  }

  function handleMandateSubmit() {
    addMandate(name, proxyName, note)
    setDone({ type: 'mandate', name, proxy: proxyName })
  }

  function reset() {
    setMode(null)
    setStep(1)
    setName('')
    setProxyName('')
    setNote('')
    setDone(null)
  }

  const dateLocale = i18n.language === 'nl' ? 'nl-NL' : 'en-GB'
  const dateStr = new Date(meeting.date + 'T12:00').toLocaleDateString(dateLocale, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="card animate-scale-in" style={{ padding: 40, maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>
            {done.type === 'attend' ? '✅' : '📝'}
          </div>
          {done.type === 'attend' ? (
            <>
              <h2 style={{ margin: '0 0 10px' }}>{t('register.registered_title')}</h2>
              <p style={{ color: 'var(--color-charcoal-light)', margin: '0 0 24px' }}>
                {t('register.registered_hint', { name: done.name, time: meeting.time, location: meeting.location })}
              </p>
            </>
          ) : (
            <>
              <h2 style={{ margin: '0 0 10px' }}>{t('register.mandate_confirmed_title')}</h2>
              <p style={{ color: 'var(--color-charcoal-light)', margin: '0 0 24px' }}>
                {t('register.mandate_confirmed_hint', { name: done.name, proxy: done.proxy })}
              </p>
            </>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn-secondary" onClick={reset}>{t('register.modify_cancel')}</button>
            <button className="btn-primary" onClick={() => navigate(`/meeting/${meeting.id}/attend`)}>
              {t('register.to_meeting')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)' }}>
      {/* Header strip */}
      <div style={{ background: 'var(--color-terracotta)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: 500 }}>
          {t('register.header')}
        </span>
        <LanguageSwitcher light />
      </div>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '32px 24px' }}>
        {/* Meeting info */}
        <div className="card-warm" style={{ padding: 24, marginBottom: 28 }}>
          <h1 style={{ fontSize: '1.3rem', margin: '0 0 12px', color: 'var(--color-charcoal)' }}>
            {meeting.name}
          </h1>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem', color: 'var(--color-charcoal-light)' }}>
              <span>📅</span><span>{dateStr}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem', color: 'var(--color-charcoal-light)' }}>
              <span>🕐</span><span>{meeting.time}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem', color: 'var(--color-charcoal-light)' }}>
              <span>📍</span><span>{meeting.location}</span>
            </div>
          </div>
          <hr className="divider" />
          <div>
            <label>{t('common.agenda')}</label>
            <pre style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.85rem', color: 'var(--color-charcoal)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
              {meeting.agenda}
            </pre>
          </div>
        </div>

        {/* eID Login screen */}
        {mode === 'login' && (
          <div className="card animate-slide-in" style={{ padding: 28 }}>
            <button onClick={() => setMode(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-charcoal-light)', marginBottom: 16, fontSize: '0.85rem', padding: 0 }}>
              {t('common.back')}
            </button>
            <LoginScreen
              onSuccess={(token, u) => { login(token, u); setMode(null) }}
              nameOption={true}
              onNameContinue={(name) => { setName(name); setMode(null) }}
            />
          </div>
        )}

        {/* Mode selection */}
        {!mode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'slideIn 0.3s ease' }}>
            <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem' }}>{t('register.your_attendance')}</h2>
            <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.9rem', margin: '0 0 4px' }}>
              {t('register.your_attendance_hint')}
            </p>

            {/* eID login banner — show if not yet logged in */}
            {!user && (
              <button
                className="card"
                style={{ padding: '16px 24px', textAlign: 'left', cursor: 'pointer', border: '2px solid var(--color-terracotta)', transition: 'border-color 0.15s', fontFamily: 'Inter, sans-serif', background: 'rgba(196,98,45,0.04)' }}
                onClick={() => setMode('login')}
              >
                <div style={{ fontSize: '1.3rem', marginBottom: 6 }}>🪪</div>
                <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 4 }}>
                  {t('auth.login_title', 'Inloggen met eID')}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>
                  {t('auth.register_hint', 'Verifieer je identiteit via de eID-app')}
                </div>
              </button>
            )}

            {user && (
              <div style={{ padding: '12px 16px', background: 'rgba(45,122,74,0.08)', border: '1.5px solid rgba(45,122,74,0.3)', borderRadius: 10, fontSize: '0.88rem', color: 'var(--color-green)', fontWeight: 500 }}>
                🪪 {t('auth.logged_in_as', 'Ingelogd als')} <strong>{user.displayName}</strong>
              </div>
            )}

            <button
              className="card"
              style={{ padding: '20px 24px', textAlign: 'left', cursor: 'pointer', border: '2px solid transparent', transition: 'border-color 0.15s', fontFamily: 'Inter, sans-serif' }}
              onClick={() => setMode('attend')}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-terracotta)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>🙋</div>
              <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 4 }}>{t('register.attending_title')}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>
                {t('register.attending_hint')}
              </div>
            </button>
            <button
              className="card"
              style={{ padding: '20px 24px', textAlign: 'left', cursor: 'pointer', border: '2px solid transparent', transition: 'border-color 0.15s', fontFamily: 'Inter, sans-serif' }}
              onClick={() => setMode('mandate')}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#2D62C4'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📜</div>
              <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 4 }}>{t('register.mandate_title')}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>
                {t('register.mandate_hint')}
              </div>
            </button>
          </div>
        )}

        {/* Attend form */}
        {mode === 'attend' && (
          <div className="card animate-slide-in" style={{ padding: 28 }}>
            <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-charcoal-light)', marginBottom: 16, fontSize: '0.85rem', padding: 0 }}>
              {t('common.back')}
            </button>
            <h2 style={{ margin: '0 0 20px', fontSize: '1.2rem' }}>🙋 {t('register.attending_title')}</h2>
            <div style={{ marginBottom: 16 }}>
              <label>{t('register.your_name')}</label>
              <input
                className="input"
                autoFocus
                value={name || (user?.displayName ?? '')}
                onChange={e => setName(e.target.value)}
                placeholder={t('common.name_placeholder')}
                onKeyDown={e => e.key === 'Enter' && (name || user?.displayName) && handleAttendSubmit()}
                readOnly={!!user}
              />
              {user && (
                <div style={{ fontSize: '0.78rem', color: 'var(--color-green)', marginTop: 4 }}>
                  🪪 {t('auth.verified_identity', 'Geverifieerde identiteit')}
                </div>
              )}
            </div>
            {existingCheckIn && (
              <div className="badge badge-green" style={{ marginBottom: 12, display: 'inline-flex' }}>
                {t('register.already_registered')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn-primary"
                disabled={!name.trim() && !user?.displayName}
                onClick={handleAttendSubmit}
              >
                {t('common.confirm')}
              </button>
              <button className="btn-secondary" onClick={reset}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {/* Mandate form */}
        {mode === 'mandate' && (
          <div className="card animate-slide-in" style={{ padding: 28 }}>
            <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-charcoal-light)', marginBottom: 16, fontSize: '0.85rem', padding: 0 }}>
              {t('common.back')}
            </button>
            <h2 style={{ margin: '0 0 6px', fontSize: '1.2rem' }}>{t('register.give_mandate_title')}</h2>
            <p style={{ margin: '0 0 20px', color: 'var(--color-charcoal-light)', fontSize: '0.85rem' }}>
              {t('register.give_mandate_hint')}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label>{t('register.your_name_granter')}</label>
                <input
                  className="input"
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('register.your_name_granter')}
                />
              </div>
              <div>
                <label>{t('register.proxy_name_label')}</label>
                <input
                  className="input"
                  value={proxyName}
                  onChange={e => setProxyName(e.target.value)}
                  placeholder={t('register.proxy_placeholder')}
                />
              </div>
              <div>
                <label>{t('common.note_optional')}</label>
                <input
                  className="input"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={t('register.note_placeholder')}
                />
              </div>

              {/* Signature placeholder */}
              <div style={{ background: 'var(--color-cream)', borderRadius: 8, padding: '16px', border: '1.5px dashed var(--color-sand-dark)', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>
                  {t('register.consent')}
                </p>
              </div>

              {existingMandate && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge badge-orange">{t('register.existing_mandate', { name: existingMandate.to })}</span>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-red)', fontSize: '0.8rem', fontWeight: 600 }}
                    onClick={() => { revokeMandate(name); reset() }}
                  >
                    {t('register.revoke')}
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn-primary"
                  disabled={!name.trim() || !proxyName.trim()}
                  onClick={handleMandateSubmit}
                >
                  {t('register.sign_confirm')}
                </button>
                <button className="btn-secondary" onClick={reset}>{t('common.cancel')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
