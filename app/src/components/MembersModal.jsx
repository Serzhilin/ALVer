import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCommunity } from '../context/CommunityContext'
import { useUser } from '../context/UserContext'
import { Modal, Button, Input, Badge, Heading, SectionLabel } from '@ecommons/ui'
import styles from './MembersModal.module.css'

const EMPTY = { app_first_name: '', app_last_name: '', email: '', phone: '', ename: '', is_aspirant: false, is_facilitator: false }

export default function MembersModal({ onClose }) {
  const { t } = useTranslation()
  const { members, community, createMember, updateMember, deleteMember } = useCommunity()
  const { user } = useUser()

  const [editing, setEditing]     = useState(null)  // null | 'new' | member id
  const [editingMember, setEditingMember] = useState(null)  // the full member object being edited
  const [form, setForm]           = useState(EMPTY)
  const [saving, setSaving]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // member id
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const regular   = members.filter(m => !m.is_aspirant)
  const aspirants = members.filter(m => m.is_aspirant)

  function openNew() {
    setForm(EMPTY)
    setEditing('new')
    setEditingMember(null)
  }

  function openEdit(m) {
    setForm({
      app_first_name: m.app_first_name || '',
      app_last_name:  m.app_last_name  || '',
      email:          m.email          || '',
      phone:          m.phone          || '',
      ename:          m.ename          || '',
      is_aspirant:    m.is_aspirant,
      is_facilitator: m.is_facilitator,
    })
    setEditing(m.id)
    setEditingMember(m)
  }

  function cancel() {
    setEditing(null)
    setConfirmDelete(null)
    setForm(EMPTY)
    setEditingMember(null)
  }

  async function handleSave() {
    if (!form.app_first_name.trim() || !form.app_last_name.trim()) return
    setSaving(true)
    try {
      const payload = {
        app_first_name: form.app_first_name.trim(),
        app_last_name:  form.app_last_name.trim(),
        email:          form.email.trim()  || null,
        phone:          form.phone.trim()  || null,
        ename:          form.ename.trim()  || null,
        is_aspirant:    form.is_aspirant,
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
    <Modal onOverlayClick={onClose}>
      <div className={styles.modalInner} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <Heading as="span" fontSize="1.2rem">
            {community?.name ?? t('settings.members_label')}
          </Heading>
          <div className={styles.headerRight}>
            {editing !== 'new' && (
              <Button variant="primary" onClick={openNew}>
                + {t('settings.member_add')}
              </Button>
            )}
            <button onClick={onClose} className={styles.closeBtn}>✕</button>
          </div>
        </div>

        {/* Inline add/edit form */}
        {editing && (
          <div className={styles.editForm}>
            <div className={styles.editFormFields}>
              <div className={styles.nameRow}>
                <div className={styles.nameInput}>
                  <Input
                    autoFocus
                    value={form.app_first_name}
                    onChange={e => set('app_first_name', e.target.value)}
                    placeholder={t('settings.member_first_name_placeholder')}
                  />
                </div>
                <div className={styles.nameInput}>
                  <Input
                    value={form.app_last_name}
                    onChange={e => set('app_last_name', e.target.value)}
                    placeholder={t('settings.member_last_name_placeholder')}
                    onKeyDown={e => e.key === 'Enter' && handleSave()}
                  />
                </div>
              </div>
              <Input
                value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder={t('settings.member_email_placeholder')}
                type="email"
              />
              <Input
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                placeholder={t('settings.member_phone_placeholder')}
                type="tel"
              />
              <Input
                value={form.ename}
                onChange={e => set('ename', e.target.value)}
                placeholder={t('settings.member_ename_placeholder')}
              />
              {editingMember?.ename && (
                <div className={styles.evaultPanel}>
                  <div className={styles.evaultLabel}>{t('settings.evault_identity')}</div>
                  {editingMember.avatar_url && (
                    <img
                      src={editingMember.avatar_url}
                      alt="avatar"
                      className={styles.evaultAvatar}
                    />
                  )}
                  <div className={styles.evaultText}>
                    <strong>{t('settings.evault_ename')}:</strong> {editingMember.ename}
                  </div>
                  {(editingMember.first_name || editingMember.last_name) && (
                    <div className={styles.evaultTextMt}>
                      <strong>{t('settings.evault_name')}:</strong>{' '}
                      {[editingMember.first_name, editingMember.last_name].filter(Boolean).join(' ')}
                    </div>
                  )}
                </div>
              )}
              <label className={styles.checkboxLabel}>
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
                  <label className={isSelf ? styles.checkboxLabelDisabled : styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={form.is_facilitator}
                      disabled={isSelf}
                      onChange={e => set('is_facilitator', e.target.checked)}
                    />
                    {t('settings.member_facilitator_label')}
                    {isSelf && <span className={styles.selfNote}>({t('settings.member_facilitator_self')})</span>}
                  </label>
                )
              })()}
              <div className={styles.formActions}>
                <Button variant="primary" onClick={handleSave} disabled={saving || !form.app_first_name.trim() || !form.app_last_name.trim()}>
                  {saving ? t('common.loading') : t('common.save')}
                </Button>
                <Button variant="secondary" onClick={cancel}>{t('common.cancel')}</Button>
              </div>
            </div>
          </div>
        )}

        {/* Lists */}
        <div className={styles.listContainer}>
          <MemberList
            label={t('settings.members_regular')}
            members={regular}
            badgeVariant="green"
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
            badgeVariant="orange"
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

        {/* Group eVault eName */}
        {community?.ename && (
          <div className={styles.groupEname}>
            <span className={styles.groupEnameLabel}>Group eVault</span>
            <span className={styles.groupEnameValue}>{community.ename}</span>
          </div>
        )}
      </div>
    </Modal>
  )
}

function MemberList({ label, members, badgeVariant, rowBg, editing, confirmDelete, onEdit, onDelete, onConfirmDelete, onCancelDelete, saving, t }) {
  return (
    <section>
      <div className={styles.sectionHeader}>
        <SectionLabel>{label}</SectionLabel>
        <Badge variant={badgeVariant}>{members.length}</Badge>
      </div>

      {members.length === 0
        ? <p className={styles.emptyText}>{t('settings.members_empty')}</p>
        : <div className={styles.memberRows}>
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
      className={styles.memberRow}
      style={{ background: isEditing ? 'rgba(196,98,45,0.1)' : rowBg }}
    >
      <div className={styles.memberInfo}>
        <div className={styles.memberNameRow}>
          <span className={styles.memberName}>{[m.app_first_name, m.app_last_name].filter(Boolean).join(' ') || m.ename || '?'}</span>
          {!m.ename && (
            <span title={t('settings.member_no_eid')} className={styles.noEidBadge}>?</span>
          )}
          {m.is_facilitator && (
            <Badge variant="blue">{t('settings.member_facilitator_badge')}</Badge>
          )}
        </div>
        <div className={styles.memberContacts}>
          {m.email && <span className={styles.memberContact}>{m.email}</span>}
          {m.phone && <span className={styles.memberContact}>{m.phone}</span>}
        </div>
      </div>

      {/* Actions — visible on hover */}
      <div className={styles.rowActions} style={{ opacity: hovered ? 1 : 0 }}>
        {confirmDelete ? (
          <div className={styles.deleteConfirmInline}>
            <span className={styles.deleteConfirmText}>{t('dashboard.delete_confirm')}</span>
            <button
              onClick={onDelete}
              disabled={saving}
              className={styles.deleteBtn}
            >
              {t('dashboard.delete_yes')}
            </button>
            <button
              onClick={onCancelDelete}
              className={styles.ghostBtn}
            >
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={onEdit}
              title={t('common.edit')}
              className={styles.iconBtn}
            >
              ✏️
            </button>
            <button
              onClick={onConfirmDelete}
              title={t('common.delete')}
              className={styles.iconBtn}
            >
              🗑️
            </button>
          </>
        )}
      </div>
    </div>
  )
}
