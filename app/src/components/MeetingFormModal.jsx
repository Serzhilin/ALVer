import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createMeeting, updateMeeting, deleteMeeting } from '../api/client'
import RichTextEditor from './RichTextEditor'

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
export default function MeetingFormModal({ meeting, communityId, communityLocations, onSave, onClose }) {
  const { t } = useTranslation()
  const isEdit = !!meeting
  const locations = communityLocations || []
  const defaultLocation = locations.find(l => l.isDefault)?.name ?? locations[0]?.name ?? ''

  const [form, setForm] = useState({
    date: meeting?.date ?? '',
    time: meeting?.time ?? '',
    location: meeting?.location ?? defaultLocation,
    agenda_text: meeting?.agenda_text ?? meeting?.agenda ?? '',
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
      const payload = { ...form, name: buildName(form.date), community_id: communityId }
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--font-title)', fontSize: '1.2rem' }}>
            {isEdit ? t('dashboard.edit_meeting') : t('dashboard.new_meeting')}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--color-charcoal-light)', padding: 4 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label>{t('dashboard.meeting_date')}</label>
              <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
            </div>
            <div>
              <label>{t('dashboard.meeting_time')}</label>
              <input className="input" type="time" value={form.time} onChange={e => set('time', e.target.value)} />
            </div>
          </div>

          <div>
            <label>{t('dashboard.meeting_location')}</label>
            {locations.length > 0 ? (
              <select className="input" value={form.location} onChange={e => set('location', e.target.value)}>
                {locations.map(l => (
                  <option key={l.id} value={l.name}>{l.name}</option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder={t('dashboard.meeting_location_placeholder')}
              />
            )}
          </div>

          <div>
            <label>{t('dashboard.meeting_agenda')}</label>
            <RichTextEditor
              value={form.agenda_text}
              onChange={v => set('agenda_text', v)}
            />
          </div>
        </div>

        {error && (
          <p style={{ color: 'var(--color-red)', fontSize: '0.85rem', marginBottom: 14 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={saving || !form.date || !form.time || !form.location.trim()}
            >
              {saving ? t('common.loading') : isEdit ? t('common.save') : t('dashboard.create_btn')}
            </button>
            <button className="btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          </div>

          {isEdit && (
            confirmDelete
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)' }}>{t('dashboard.delete_confirm')}</span>
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-red)', fontWeight: 600, padding: '4px 8px' }}
                  >
                    {t('dashboard.delete_yes')}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-charcoal-light)', padding: '4px 8px' }}
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              : <button
                  onClick={() => setConfirmDelete(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-charcoal-light)', padding: '4px 8px' }}
                >
                  🗑️ {t('common.delete')}
                </button>
          )}
        </div>
      </div>
    </div>
  )
}
