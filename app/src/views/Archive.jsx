import { useEffect, useState } from 'react'
import { useMeeting } from '../context/MeetingContext'
import { useUser } from '../context/UserContext'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import FacilitatorHeader from '../components/FacilitatorHeader'
import AgendaHtml from '../components/AgendaHtml'
import MinutesEditor from '../components/MinutesEditor'

export default function Archive() {
  const { id } = useParams()
  const { meeting, setMeetingId } = useMeeting()
  const { user, isFacilitator } = useUser()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [attendeesOpen, setAttendeesOpen] = useState(false)
  const [mandatesOpen, setMandatesOpen] = useState(false)
  const [minutesOpen, setMinutesOpen] = useState(false)

  useEffect(() => { setMeetingId(id) }, [id])

  if (!meeting) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-charcoal-light)' }}>{t('common.loading')}</div>

  const isAvailable = meeting.phase === 'closed' || meeting.phase === 'archived'
  const dateLocale = i18n.language === 'nl' ? 'nl-NL' : 'en-GB'
  const dateStr = new Date(meeting.date + 'T12:00').toLocaleDateString(dateLocale, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  const isMinutesEditor = !!(user && (
    user.ename === meeting.notulist_ename || isFacilitator
  ) && meeting.minutes_status !== 'published')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)' }}>
      <FacilitatorHeader
        title={t('archive.header')}
      />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px' }}>
        {!isAvailable && (
          <div className="card" style={{ padding: 32, textAlign: 'center', marginBottom: 24 }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔒</div>
            <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>{t('archive.not_available_title')}</h2>
            <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.88rem' }}>
              {t('archive.not_available_hint')}
            </p>
          </div>
        )}

        {/* Meeting header */}
        <div className="card-warm" style={{ padding: 28, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h1 style={{ fontSize: '1.5rem', margin: '0 0 10px', color: 'var(--color-charcoal)' }}>
                {meeting.name}
              </h1>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ fontSize: '0.88rem', color: 'var(--color-charcoal-light)' }}>📅 {dateStr}</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--color-charcoal-light)' }}>🕐 {meeting.time}{meeting.end_time ? ` – ${meeting.end_time}` : ''}</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--color-charcoal-light)' }}>📍 {meeting.location}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', gap: 20 }}>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-charcoal)' }}>
                  {meeting.checkedIn.filter(c => !c.isAspirant).length}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)' }}>{t('archive.voters_present')}</div>
              </div>
              <div>
                <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-charcoal)' }}>
                  {meeting.confirmedMandates.length}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)' }}>{t('archive.mandates')}</div>
              </div>
            </div>
          </div>

          <hr className="divider" />

          <div>
            <label>{t('common.agenda')}</label>
            <AgendaHtml html={meeting.agenda} style={{ marginTop: 8 }} />
          </div>
        </div>

        {/* Decisions */}
        <h2 style={{ fontSize: '1.1rem', margin: '0 0 16px', color: 'var(--color-charcoal)' }}>
          {t('archive.decisions')}
        </h2>

        {meeting.polls.filter(p => p.status === 'closed').length === 0 && (
          <div className="card" style={{ padding: 24, textAlign: 'center', marginBottom: 24 }}>
            <p style={{ color: 'var(--color-charcoal-light)', margin: 0, fontSize: '0.88rem' }}>
              {t('archive.no_decisions')}
            </p>
          </div>
        )}

        {meeting.polls.filter(p => p.status === 'closed').map((poll, idx) => (
          <div key={poll.id} className="card" style={{ padding: 24, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-charcoal-light)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  {t('archive.decision_number', { number: idx + 1 })}
                </div>
                <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--color-charcoal)', lineHeight: 1.6, fontWeight: 500 }}>
                  {poll.title}
                </p>
              </div>
            </div>

            {poll.result && (
              <>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
                  {Object.entries(poll.result.tally).map(([option, count]) => (
                    <div key={option} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: option === 'Voor' || option === 'Ja' ? 'rgba(45,122,74,0.1)' :
                          option === 'Tegen' || option === 'Nee' ? 'rgba(196,45,45,0.1)' : 'rgba(44,44,44,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.95rem',
                        color: option === 'Voor' || option === 'Ja' ? 'var(--color-green)' :
                          option === 'Tegen' || option === 'Nee' ? 'var(--color-red)' : 'var(--color-charcoal-light)',
                      }}>
                        {count}
                      </div>
                      <span style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>{option}</span>
                    </div>
                  ))}
                </div>
                {poll.closedAt && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)' }}>
                    {t('archive.closed_at', { time: poll.closedAt })}
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {/* Attendees — collapsed by default */}
        <button
          onClick={() => setAttendeesOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: '24px 0 12px' }}
        >
          <h2 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--color-charcoal)' }}>
            {t('archive.attendees_count', { count: meeting.checkedIn.length })}
          </h2>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-light)' }}>{attendeesOpen ? '▼' : '▶'}</span>
        </button>
        {attendeesOpen && (
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {meeting.checkedIn.map(c => (
                <span
                  key={c.id}
                  style={{
                    padding: '4px 14px', borderRadius: 20,
                    background: 'var(--color-sand)', fontSize: '0.85rem',
                    color: 'var(--color-charcoal)',
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                  }}
                >
                  {c.name} {c.manual && <span title={t('facilitate.manually_added')} style={{ fontSize: '0.75rem' }}>📝</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mandates — collapsed by default */}
        {meeting.confirmedMandates.length > 0 && (
          <>
            <button
              onClick={() => setMandatesOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: '16px 0 12px' }}
            >
              <h2 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--color-charcoal)' }}>
                {t('archive.mandates_count', { count: meeting.confirmedMandates.length })}
              </h2>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-light)' }}>{mandatesOpen ? '▼' : '▶'}</span>
            </button>
            {mandatesOpen && (
              <div className="card" style={{ padding: 20 }}>
                {meeting.confirmedMandates.map(m => (
                  <div key={m.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--color-sand)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>
                        <strong>{m.from}</strong> → <strong>{m.to}</strong>
                      </span>
                      {m.note && <div style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>{m.note}</div>}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)' }}>{m.confirmedAt}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Minutes — shown only when a notulist is assigned */}
        {meeting.notulist_ename && (
          <div style={{ marginTop: 32 }}>
            <button
              onClick={() => setMinutesOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, margin: '0 0 12px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--color-charcoal)' }}>
                  {t('minutes.section_title')}
                </h2>
                {meeting.minutes_status === 'draft' && isMinutesEditor && (
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-charcoal-light)', background: 'var(--color-sand)', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {t('minutes.draft_badge')}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-charcoal-light)' }}>{minutesOpen ? '▼' : '▶'}</span>
            </button>

            {minutesOpen && (
              <>
                {/* Editor — notulist or facilitator, not yet published */}
                {isMinutesEditor && (
                  <MinutesEditor
                    meeting={meeting}
                    onPublished={() => setMeetingId(id)}
                  />
                )}

                {/* Read-only — published, for all logged-in members */}
                {meeting.minutes_status === 'published' && user && !isMinutesEditor && (
                  <div className="card" style={{ padding: 24 }}>
                    <AgendaHtml html={meeting.minutes_html ?? ''} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
