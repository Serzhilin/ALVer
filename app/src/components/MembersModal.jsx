import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCommunity } from '../context/CommunityContext'
import { useUser } from '../context/UserContext'

const EMPTY = { first_name: '', last_name: '', email: '', phone: '', ename: '', is_aspirant: false, is_facilitator: false }

export default function MembersModal({ onClose }) {
  const { t } = useTranslation()
  const { members, community, createMember, updateMember, deleteMember } = useCommunity()
  const { user } = useUser()

  const [editing, setEditing]     = useState(null)  // null | 'new' | member id
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // member id
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const regular   = members.filter(m => !m.is_aspirant)
  const aspirants = members.filter(m => m.is_aspirant)

  function openNew() {
    setForm(EMPTY)
    setEditing('new')
  }

  function openEdit(m) {
    setForm({
      first_name:    m.first_name    || '',
      last_name:     m.last_name     || '',
      email:         m.email         || '',
      phone:         m.phone         || '',
      ename:         m.ename         || '',
      is_aspirant:   m.is_aspirant,
      is_facilitator: m.is_facilitator,
    })
    setEditing(m.id)
  }

  function cancel() {
    setEditing(null)
    setConfirmDelete(null)
    setForm(EMPTY)
  }

  async function handleSave() {
    if (!form.first_name.trim() || !form.last_name.trim()) return
    setSaving(true)
    try {
      const payload = {
        first_name:    form.first_name.trim(),
        last_name:     form.last_name.trim(),
        email:         form.email.trim()  || undefined,
        phone:         form.phone.trim()  || undefined,
        ename:         form.ename.trim()  || undefined,
        is_aspirant:   form.is_aspirant,
        is_facilitator: form.is_facilitator,
      }
      if (editing === 'new') {
        await createMember(payload)
      } else {
        await updateMember(editing, payload)
      }
      cancel()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    setSaving(true)
    try {
      await deleteMember(id)
      setConfirmDelete(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontFamily: 'Playfair Display, serif', fontSize: '1.2rem' }}>
            {community?.name ?? t('settings.members_label')}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {editing !== 'new' && (
              <button className="btn-primary" style={{ fontSize: '0.8rem', padding: '5px 12px' }} onClick={openNew}>
                + {t('settings.member_add')}
              </button>
            )}
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--color-charcoal-light)', padding: 4 }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Inline add/edit form */}
        {editing && (
          <div style={{ marginBottom: 20, padding: 16, background: 'var(--color-cream)', borderRadius: 10, border: '1px solid var(--color-sand)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  autoFocus
                  value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                  placeholder={t('settings.member_first_name_placeholder')}
                  style={{ flex: 1 }}
                />
                <input
                  className="input"
                  value={form.last_name}
                  onChange={e => set('last_name', e.target.value)}
                  placeholder={t('settings.member_last_name_placeholder')}
                  style={{ flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
              </div>
              <input
                className="input"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder={t('settings.member_email_placeholder')}
                type="email"
              />
              <input
                className="input"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder={t('settings.member_phone_placeholder')}
                type="tel"
              />
              <input
                className="input"
                value={form.ename}
                onChange={e => set('ename', e.target.value)}
                placeholder={t('settings.member_ename_placeholder')}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.is_aspirant}
                  onChange={e => set('is_aspirant', e.target.checked)}
                />
                {t('settings.member_aspirant_label')}
              </label>
              {(() => {
                const isSelf = form.ename && user?.ename && form.ename === user.ename
                return (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', cursor: isSelf ? 'not-allowed' : 'pointer', opacity: isSelf ? 0.5 : 1 }}>
                    <input
                      type="checkbox"
                      checked={form.is_facilitator}
                      disabled={isSelf}
                      onChange={e => set('is_facilitator', e.target.checked)}
                    />
                    {t('settings.member_facilitator_label')}
                    {isSelf && <span style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)' }}>({t('settings.member_facilitator_self')})</span>}
                  </label>
                )
              })()}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={handleSave} disabled={saving || !form.first_name.trim() || !form.last_name.trim()}>
                  {saving ? t('common.loading') : t('common.save')}
                </button>
                <button className="btn-secondary" onClick={cancel}>{t('common.cancel')}</button>
              </div>
            </div>
          </div>
        )}

        {/* Lists */}
        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <MemberList
            label={t('settings.members_regular')}
            members={regular}
            badgeClass="badge-green"
            rowBg="var(--color-cream)"
            editing={editing}
            confirmDelete={confirmDelete}
            onEdit={openEdit}
            onDelete={handleDelete}
            onConfirmDelete={setConfirmDelete}
            onCancelDelete={() => setConfirmDelete(null)}
            saving={saving}
            t={t}
          />
          <MemberList
            label={t('settings.members_aspirants')}
            members={aspirants}
            badgeClass="badge-orange"
            rowBg="rgba(196,98,45,0.06)"
            editing={editing}
            confirmDelete={confirmDelete}
            onEdit={openEdit}
            onDelete={handleDelete}
            onConfirmDelete={setConfirmDelete}
            onCancelDelete={() => setConfirmDelete(null)}
            saving={saving}
            t={t}
          />
        </div>
      </div>
    </div>
  )
}

function MemberList({ label, members, badgeClass, rowBg, editing, confirmDelete, onEdit, onDelete, onConfirmDelete, onCancelDelete, saving, t }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-charcoal-light)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {label}
        </span>
        <span className={`badge ${badgeClass}`}>{members.length}</span>
      </div>

      {members.length === 0
        ? <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: 0 }}>{t('settings.members_empty')}</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {members.map(m => (
              <MemberRow
                key={m.id}
                member={m}
                rowBg={rowBg}
                isEditing={editing === m.id}
                confirmDelete={confirmDelete === m.id}
                onEdit={() => onEdit(m)}
                onDelete={() => onDelete(m.id)}
                onConfirmDelete={() => onConfirmDelete(m.id)}
                onCancelDelete={onCancelDelete}
                saving={saving}
                t={t}
              />
            ))}
          </div>
      }
    </section>
  )
}

function MemberRow({ member: m, rowBg, isEditing, confirmDelete, onEdit, onDelete, onConfirmDelete, onCancelDelete, saving, t }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (confirmDelete) onCancelDelete() }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', borderRadius: 7, background: isEditing ? 'rgba(196,98,45,0.1)' : rowBg,
        minHeight: 38,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.92rem', color: 'var(--color-charcoal)', fontWeight: 500 }}>{m.name}</span>
          {m.is_facilitator && (
            <span className="badge badge-blue" style={{ fontSize: '0.68rem', padding: '1px 7px' }}>
              {t('settings.member_facilitator_badge')}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {m.email && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)' }}>{m.email}</span>
          )}
          {m.phone && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-charcoal-light)' }}>{m.phone}</span>
          )}
          {m.ename && (
            <span style={{ fontSize: '0.72rem', color: 'var(--color-charcoal-light)', fontStyle: 'italic' }}>{m.ename}</span>
          )}
        </div>
      </div>

      {/* Actions — visible on hover */}
      <div style={{ opacity: hovered ? 1 : 0, transition: 'opacity 0.15s', display: 'flex', alignItems: 'center', gap: 4 }}>
        {confirmDelete ? (
          <>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', marginRight: 4 }}>{t('dashboard.delete_confirm')}</span>
            <button
              onClick={onDelete}
              disabled={saving}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-red)', fontWeight: 700, padding: '3px 6px' }}
            >
              {t('dashboard.delete_yes')}
            </button>
            <button
              onClick={onCancelDelete}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-charcoal-light)', padding: '3px 6px' }}
            >
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onEdit}
              title={t('common.edit')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.95rem', padding: '3px 5px', borderRadius: 4, lineHeight: 1 }}
            >
              ✏️
            </button>
            <button
              onClick={onConfirmDelete}
              title={t('common.delete')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.95rem', padding: '3px 5px', borderRadius: 4, lineHeight: 1 }}
            >
              🗑️
            </button>
          </>
        )}
      </div>
    </div>
  )
}
