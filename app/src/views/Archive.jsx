import { useEffect, useState } from 'react'
import { useMeeting } from '../context/MeetingContext'
import { useUser } from '../context/UserContext'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import FacilitatorHeader from '../components/FacilitatorHeader'
import AgendaHtml from '../components/AgendaHtml'
import MinutesEditor from '../components/MinutesEditor'
import * as api from '../api/client'
import { Button, Card, Badge, Heading, Loading, SectionLabel } from '@ecommons/ui'
import styles from './Archive.module.css'

const SUPERADMIN_ENAME = '@9dafa031-4118-564c-bfa6-5917ddc8ab88'

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

  if (!meeting) {
    return (
      <div className={styles.pageRoot}>
        <div className={styles.content}>
          <Loading>{t('common.loading')}</Loading>
        </div>
      </div>
    )
  }

  const isAvailable = meeting.phase === 'closed' || meeting.phase === 'archived'
  const dateLocale = i18n.language === 'nl' ? 'nl-NL' : 'en-GB'
  const dateStr = new Date(meeting.date + 'T12:00').toLocaleDateString(dateLocale, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })

  const isMinutesEditor = !!(user && (
    user.ename === meeting.notulist_ename || isFacilitator
  ) && meeting.minutes_status !== 'published')

  return (
    <div className={styles.pageRoot}>
      <FacilitatorHeader title={t('archive.header')} />

      <div className={styles.content}>
        {!isAvailable && (
          <Card className={styles.notAvailableCard}>
            <div className={styles.notAvailableIcon}>🔒</div>
            <div className={styles.notAvailableTitle}>
              <Heading as="h2" fontSize="1.1rem">
                {t('archive.not_available_title')}
              </Heading>
            </div>
            <p className={styles.notAvailableHint}>{t('archive.not_available_hint')}</p>
          </Card>
        )}

        {/* Meeting header */}
        <Card className={styles.meetingHeaderCard}>
          <div className={styles.meetingHeaderTop}>
            <div className={styles.meetingTitleCol}>
              <div className={styles.meetingName}>
                <Heading as="h1" fontSize="1.5rem">{meeting.name}</Heading>
              </div>
              <div className={styles.meetingMeta}>
                <div className={styles.metaRow}>📅 {dateStr}</div>
                <div className={styles.metaRow}>🕐 {meeting.time}{meeting.end_time ? ` – ${meeting.end_time}` : ''}</div>
                <div className={styles.metaRow}>📍 {meeting.location}</div>
              </div>
            </div>
            <div className={styles.meetingStats}>
              <div className={styles.statBlock}>
                <div className={styles.statNumber}>
                  {meeting.checkedIn.filter(c => !c.isAspirant).length}
                </div>
                <div className={styles.statLabel}>{t('archive.voters_present')}</div>
              </div>
              <div className={styles.statBlock}>
                <div className={styles.statNumber}>{meeting.confirmedMandates.length}</div>
                <div className={styles.statLabel}>{t('facilitate.mandates')}</div>
              </div>
            </div>
          </div>

          <hr className="divider" />

          <div className={styles.agendaSection}>
            <div className={styles.agendaLabel}>
              <SectionLabel>{t('common.agenda')}</SectionLabel>
            </div>
            <AgendaHtml html={meeting.agenda} />
          </div>
        </Card>

        {/* Decisions */}
        <div className={styles.decisionsHeading}>
          <Heading as="h2" fontSize="1.1rem">{t('archive.decisions')}</Heading>
        </div>

        {meeting.polls.filter(p => p.status === 'closed').length === 0 && (
          <Card className={styles.emptyCard}>
            <p className={styles.emptyText}>{t('archive.no_decisions')}</p>
          </Card>
        )}

        {meeting.polls.filter(p => p.status === 'closed').map((poll, idx) => (
          <Card key={poll.id} className={styles.pollCard}>
            <div className={styles.pollCardTop}>
              <div className={styles.pollCardLeft}>
                <div className={styles.decisionNumber}>
                  {t('archive.decision_number', { number: idx + 1 })}
                </div>
                <p className={styles.pollTitle}>{poll.title}</p>
              </div>
            </div>

            {poll.result && (
              <>
                <div className={styles.tallyRow}>
                  {Object.entries(poll.result.tally).map(([option, count]) => {
                    const isFor = option === 'Voor' || option === 'Ja'
                    const isAgainst = option === 'Tegen' || option === 'Nee'
                    return (
                      <div key={option} className={styles.tallyItem}>
                        <div
                          className={styles.tallyBox}
                          style={{
                            background: isFor ? 'rgba(45,122,74,0.1)' : isAgainst ? 'rgba(196,45,45,0.1)' : 'rgba(44,44,44,0.06)',
                            color: isFor ? 'var(--color-green)' : isAgainst ? 'var(--color-red)' : 'var(--color-charcoal-light)',
                          }}
                        >
                          {count}
                        </div>
                        <span className={styles.tallyLabel}>{option}</span>
                      </div>
                    )
                  })}
                </div>
                {poll.closedAt && (
                  <div className={styles.closedAt}>
                    {t('archive.closed_at', { time: poll.closedAt })}
                  </div>
                )}
              </>
            )}
          </Card>
        ))}

        {/* Attendees — collapsed by default */}
        <div className={styles.attendeesSection}>
          <Button
            variant="secondary"
            className={styles.collapseBtn}
            onClick={() => setAttendeesOpen(o => !o)}
          >
            <div className={styles.collapseHeading}>
              <Heading as="h2" fontSize="1.1rem">
                {t('archive.attendees_count', { count: meeting.checkedIn.length })}
              </Heading>
            </div>
            <span className={styles.collapseChevron}>{attendeesOpen ? '▼' : '▶'}</span>
          </Button>
        </div>
        {attendeesOpen && (
          <Card className={styles.attendeesCard}>
            <div className={styles.attendeeBadges}>
              {meeting.checkedIn.map(c => (
                <Badge key={c.id} variant="gray">
                  {c.name} {c.manual && <span title={t('facilitate.manually_added')}>📝</span>}
                </Badge>
              ))}
            </div>
          </Card>
        )}

        {/* Mandates — collapsed by default */}
        {meeting.confirmedMandates.length > 0 && (
          <>
            <div className={styles.mandatesSection}>
              <Button
                variant="secondary"
                className={styles.collapseBtn}
                onClick={() => setMandatesOpen(o => !o)}
              >
                <div className={styles.collapseHeading}>
                  <Heading as="h2" fontSize="1.1rem">
                    {t('archive.mandates_count', { count: meeting.confirmedMandates.length })}
                  </Heading>
                </div>
                <span className={styles.collapseChevron}>{mandatesOpen ? '▼' : '▶'}</span>
              </Button>
            </div>
            {mandatesOpen && (
              <Card className={styles.mandatesCard}>
                {meeting.confirmedMandates.map(m => (
                  <div key={m.id} className={styles.mandateRow}>
                    <div>
                      <div className={styles.mandateNames}>
                        <strong>{m.from}</strong> → <strong>{m.to}</strong>
                      </div>
                      {m.note && <div className={styles.mandateNote}>{m.note}</div>}
                    </div>
                    <span className={styles.mandateTime}>{m.confirmedAt}</span>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {/* Minutes — shown only when a notulist is assigned */}
        {meeting.notulist_ename && (
          <div className={styles.minutesSection}>
            <Button
              variant="secondary"
              className={styles.collapseBtn}
              onClick={() => setMinutesOpen(o => !o)}
            >
              <div className={styles.minutesTitleRow}>
                <div className={styles.collapseHeading}>
                  <Heading as="h2" fontSize="1.1rem">
                    {t('minutes.section_title')}
                  </Heading>
                </div>
                {meeting.minutes_status === 'draft' && isMinutesEditor && (
                  <Badge variant="gray">{t('minutes.draft_badge')}</Badge>
                )}
              </div>
              <span className={styles.collapseChevron}>{minutesOpen ? '▼' : '▶'}</span>
            </Button>

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
                  <Card className={styles.minutesReadCard}>
                    <AgendaHtml html={meeting.minutes_html ?? ''} />
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {user?.ename === SUPERADMIN_ENAME && (
          <div className={styles.deleteArea}>
            <Button
              variant="danger"
              onClick={async () => {
                if (!window.confirm(`Delete "${meeting.name}"? This cannot be undone.`)) return
                await api.deleteMeeting(id)
                navigate(-1)
              }}
            >
              Delete meeting
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
