import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createMeeting, updateMeeting, deleteMeeting } from '../api/client'
import RichTextEditor from './RichTextEditor'
import { Modal, Button, Input, Select, Label, Heading, ErrorText } from '@ecommons/ui'
import styles from './MeetingFormModal.module.css'

function buildName(date) {
  if (!date) return 'ALV'
  const [y, m, d] = date.split('-')
  return `ALV ${d}-${m}-${y}`
}

/**
 * Props:
 *   meeting  — existing meeting object to edit, or null to create
 *   onSave(meeting) — called with saved meeting
 *   onClose()
 */
export default function MeetingFormModal({ meeting, communityId, communityLocations, facilitatorMembers, onSave, onClose }) {
  const { t } = useTranslation()
  const isEdit = !!meeting
  const locations = communityLocations || []
  const facilitators = facilitatorMembers || []
  const defaultLocation = locations.find(l => l.isDefault)?.name ?? locations[0]?.name ?? ''

  const [form, setForm] = useState({
    date: meeting?.date ?? '',
    time: meeting?.time ?? '',
    end_time: meeting?.end_time ?? '',
    location: meeting?.location ?? defaultLocation,
    agenda_text: meeting?.agenda_text ?? meeting?.agenda ?? '',
    facilitator_ename: meeting?.facilitator_ename ?? '',
    facilitator_name: meeting?.facilitator_name ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleDelete() {
    setSaving(true)
    setError(null)
    try {
      await deleteMeeting(meeting.id)
      onSave(null)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit() {
    if (!form.date || !form.time || !form.location.trim()) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        name: buildName(form.date),
        community_id: communityId,
        facilitator_ename: form.facilitator_ename || undefined,
        facilitator_name: form.facilitator_name || undefined,
      }
      let saved
      if (isEdit) {
        saved = await updateMeeting(meeting.id, payload)
      } else {
        saved = await createMeeting(payload)
      }
      onSave(saved)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onOverlayClick={onClose}>
      <div className={styles.modalInner} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <Heading as="span" fontSize="1.2rem">
            {isEdit ? t('dashboard.edit_meeting') : t('dashboard.new_meeting')}
          </Heading>
          <button onClick={onClose} className={styles.closeBtn}>✕</button>
        </div>

        <div className={styles.fields}>
          <div className={styles.dateGrid}>
            <div>
              <Label>{t('dashboard.meeting_date')}</Label>
              <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div>
              <Label>{t('dashboard.meeting_time')}</Label>
              <Input type="time" value={form.time} onChange={e => set('time', e.target.value)} />
            </div>
            <div>
              <Label>{t('dashboard.meeting_end_time')}</Label>
              <Input type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} />
            </div>
          </div>

          <div>
            <Label>{t('dashboard.meeting_location')}</Label>
            {locations.length > 0 ? (
              <Select value={form.location} onChange={e => set('location', e.target.value)}>
                {locations.map(l => (
                  <option key={l.id} value={l.name}>{l.name}</option>
                ))}
              </Select>
            ) : (
              <Input
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder={t('dashboard.meeting_location_placeholder')}
              />
            )}
          </div>

          <div>
            <Label>{t('dashboard.meeting_agenda')}</Label>
            <RichTextEditor
              value={form.agenda_text}
              onChange={v => set('agenda_text', v)}
            />
          </div>

          {facilitators.length > 0 && (
            <div>
              <Label>{t('dashboard.meeting_facilitator')}</Label>
              <Select
                value={form.facilitator_ename}
                onChange={e => {
                  const selected = facilitators.find(m => m.ename === e.target.value)
                  set('facilitator_ename', e.target.value)
                  set('facilitator_name', [selected?.app_first_name, selected?.app_last_name].filter(s => s?.trim()).join(' ') ?? '')
                }}
              >
                <option value="">—</option>
                {facilitators.map(m => (
                  <option key={m.id} value={m.ename ?? m.id}>{[m.app_first_name, m.app_last_name].filter(s => s?.trim()).join(' ') || m.ename}</option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {error && <ErrorText as="p">{error}</ErrorText>}

        <div className={styles.actions}>
          <div className={styles.actionsLeft}>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={saving || !form.date || !form.time || !form.location.trim()}
            >
              {saving ? t('common.loading') : isEdit ? t('common.save') : t('dashboard.create_btn')}
            </Button>
            <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          </div>

          {isEdit && (
            confirmDelete
              ? <div className={styles.deleteConfirm}>
                  <span className={styles.deleteConfirmText}>{t('dashboard.delete_confirm')}</span>
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className={styles.deleteBtn}
                  >
                    {t('dashboard.delete_yes')}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className={styles.ghostBtn}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              : <button
                  onClick={() => setConfirmDelete(true)}
                  className={styles.ghostBtn}
                >
                  🗑️ {t('common.delete')}
                </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
