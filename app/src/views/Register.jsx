import { useState, useEffect } from 'react'
import { useMeeting } from '../context/MeetingContext'
import { useUser } from '../context/UserContext'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getMeetingMembers } from '../api/client'
import LoginScreen from '../components/LoginScreen'
import AppHeader from '../components/AppHeader'

export default function Register() {
  const { id } = useParams()
  const { meeting, checkIn, preRegister, addMandate, revokeMandate, setMeetingId } = useMeeting()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { user, login } = useUser()
  const [regularMembers, setRegularMembers] = useState([])

  useEffect(() => {
    getMeetingMembers(id).then(setRegularMembers).catch(() => {})
  }, [id])

  const [searchParams] = useSearchParams()
  useEffect(() => { setMeetingId(id) }, [id])

  // All hooks must be declared before any conditional return
  const initialMode = searchParams.get('mode') // 'attend' | 'mandate' | null
  const [mode, setMode] = useState(initialMode) // null | 'login' | 'attend' | 'mandate'
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [proxyName, setProxyName] = useState('')
  const [note, setNote] = useState('')
  const CHECKIN_KEY = `alver_checkin_${id}`
  const [done, setDone] = useState(() => {
    try { const s = localStorage.getItem(`alver_checkin_${id}`); return s ? JSON.parse(s) : null }
    catch { return null }
  })

  // Auto-submit pre-registration when arriving via ?mode=attend and user is already known
  useEffect(() => {
    const effectiveName = user?.displayName || name
    if (mode === 'attend' && meeting && !done && effectiveName) {
      preRegister(effectiveName).catch(() => {})
      const doneData = { type: 'attend', name: effectiveName }
      localStorage.setItem(CHECKIN_KEY, JSON.stringify(doneData))
      setDone(doneData)
    }
  }, [meeting, user])

  if (!meeting) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</div>

  // Check if already registered
  const existingCheckIn = name ? meeting.checkedIn.find(c => c.name.toLowerCase() === name.toLowerCase()) : null
  const existingMandate = name ? meeting.confirmedMandates.find(m => m.from.toLowerCase() === name.toLowerCase()) : null

  function handleAttendSubmit(overrideName) {
    const effectiveName = overrideName || name || user?.displayName || ''
    if (!effectiveName) return
    preRegister(effectiveName).catch(() => {})
    const doneData = { type: 'attend', name: effectiveName }
    localStorage.setItem(CHECKIN_KEY, JSON.stringify(doneData))
    setDone(doneData)
  }

  function handleCannotCome() {
    setDone({ type: 'decline' })
  }

  function handleMandateSubmit() {
    const from = user?.displayName || name
    addMandate(from, proxyName, note)
    setDone({ type: 'mandate', name: from, proxy: proxyName })
  }

  function reset() {
    localStorage.removeItem(CHECKIN_KEY)
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
            {done.type === 'attend' ? '🙋' : done.type === 'decline' ? '👋' : '📝'}
          </div>
          {done.type === 'attend' ? (
            <>
              <h2 style={{ margin: '0 0 10px' }}>{t('register.preregistered_title')}</h2>
              <p style={{ color: 'var(--color-charcoal-light)', margin: '0 0 24px' }}>
                {t('register.preregistered_hint', { name: done.name, time: meeting.time, location: meeting.location })}
              </p>
            </>
          ) : done.type === 'decline' ? (
            <>
              <h2 style={{ margin: '0 0 10px' }}>{t('register.declined_title')}</h2>
              <p style={{ color: 'var(--color-charcoal-light)', margin: '0 0 24px' }}>
                {t('register.declined_hint')}
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
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)' }}>
      <AppHeader
        backTo={-1}
        title={meeting.name}
        user={user ?? null}
        onLogout={user ? () => {} : undefined}
      />

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

            {!user && !name && (
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
              onClick={() => (user || name) ? handleAttendSubmit(user?.displayName || name) : setMode('attend')}
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

            <button
              className="card"
              style={{ padding: '20px 24px', textAlign: 'left', cursor: 'pointer', border: '2px solid transparent', transition: 'border-color 0.15s', fontFamily: 'Inter, sans-serif' }}
              onClick={handleCannotCome}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-charcoal-light)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}
            >
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>👋</div>
              <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 4 }}>{t('register.decline_card_title')}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>
                {t('register.decline_card_hint')}
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
              {!user && (
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
              )}
              <div>
                <label>{t('register.proxy_name_label')}</label>
                <select
                  className="input"
                  autoFocus={!!user}
                  value={proxyName}
                  onChange={e => setProxyName(e.target.value)}
                >
                  <option value="">{t('register.proxy_placeholder')}</option>
                  {regularMembers.map(m => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
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
                  disabled={(!user && !name.trim()) || !proxyName.trim()}
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
