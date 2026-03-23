import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCommunity } from '../context/CommunityContext'

const EMPTY_LOC = { name: '', address: '', maps_url: '' }

export default function SettingsModal({ onClose }) {
  const { t } = useTranslation()
  const { community, updateCommunity } = useCommunity()

  // ── Logo ──────────────────────────────────────────────────────────────────
  const [logo, setLogo] = useState(community?.logo_url || null)

  function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result
      setLogo(dataUrl)
      await updateCommunity({ logo_url: dataUrl })
    }
    reader.readAsDataURL(file)
  }

  async function removeLogo() {
    setLogo(null)
    await updateCommunity({ logo_url: null })
  }

  // ── Cooperative name ──────────────────────────────────────────────────────
  const [name, setName] = useState(community?.name || '')
  const [nameSaving, setNameSaving] = useState(false)

  async function saveName() {
    setNameSaving(true)
    await updateCommunity({ name })
    setNameSaving(false)
  }

  // ── Locations ─────────────────────────────────────────────────────────────
  const [locations, setLocations] = useState(community?.locations || [])
  const [editingLoc, setEditingLoc] = useState(null) // null | 'new' | loc id
  const [locForm, setLocForm] = useState(EMPTY_LOC)
  const setLF = (k, v) => setLocForm(f => ({ ...f, [k]: v }))

  async function saveLocation() {
    if (!locForm.name.trim()) return
    let updated
    if (editingLoc === 'new') {
      const newLoc = {
        id: crypto.randomUUID(),
        name: locForm.name.trim(),
        address: locForm.address.trim(),
        maps_url: locForm.maps_url.trim(),
        isDefault: locations.length === 0,
      }
      updated = [...locations, newLoc]
    } else {
      updated = locations.map(l => l.id === editingLoc
        ? { ...l, name: locForm.name.trim(), address: locForm.address.trim(), maps_url: locForm.maps_url.trim() }
        : l)
    }
    setLocations(updated)
    await updateCommunity({ locations: updated })
    setEditingLoc(null)
    setLocForm(EMPTY_LOC)
  }

  async function removeLocation(id) {
    const updated = locations.filter(l => l.id !== id)
    if (updated.length > 0 && !updated.some(l => l.isDefault)) updated[0].isDefault = true
    setLocations(updated)
    await updateCommunity({ locations: updated })
  }

  async function setDefaultLocation(id) {
    const updated = locations.map(l => ({ ...l, isDefault: l.id === id }))
    setLocations(updated)
    await updateCommunity({ locations: updated })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 24px', fontFamily: 'Playfair Display, serif', fontSize: '1.2rem' }}>
          ⚙️ {t('settings.title')}
        </h3>

        {/* ── Logo ── */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ marginBottom: 10, display: 'block' }}>{t('settings.logo_label')}</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 80, height: 48, border: '1px solid var(--color-sand)', borderRadius: 8, background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {logo
                ? <img src={logo} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                : <span style={{ fontSize: '1.5rem' }}>🏛️</span>
              }
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <label className="btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 12px', cursor: 'pointer' }}>
                {t(logo ? 'settings.logo_replace' : 'settings.logo_upload')}
                <input type="file" accept="image/svg+xml,image/png,image/jpeg" onChange={handleLogoUpload} style={{ display: 'none' }} />
              </label>
              {logo && (
                <button className="btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 12px', color: 'var(--color-red)' }} onClick={removeLogo}>
                  {t('settings.logo_remove')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Cooperative name ── */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ marginBottom: 8, display: 'block' }}>{t('settings.cooperative_name_label')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('settings.cooperative_name_placeholder')}
              style={{ flex: 1 }}
            />
            <button className="btn-secondary" style={{ fontSize: '0.85rem', padding: '6px 14px' }} onClick={saveName} disabled={nameSaving}>
              {t('common.save')}
            </button>
          </div>
        </div>

        {/* ── Locations ── */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <label style={{ display: 'block' }}>{t('settings.locations_label')}</label>
            {editingLoc === null && (
              <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 12px' }} onClick={() => { setLocForm(EMPTY_LOC); setEditingLoc('new') }}>
                + {t('settings.location_add')}
              </button>
            )}
          </div>

          {locations.length === 0 && editingLoc !== 'new' && (
            <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: '0 0 12px' }}>
              {t('settings.locations_empty')}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {locations.map(loc => (
              <div key={loc.id}>
                {editingLoc === loc.id
                  ? <LocationForm form={locForm} setF={setLF} onSave={saveLocation} onCancel={() => setEditingLoc(null)} t={t} />
                  : <LocationCard loc={loc} onEdit={() => { setLocForm({ name: loc.name, address: loc.address || '', maps_url: loc.maps_url || '' }); setEditingLoc(loc.id) }} onDelete={() => removeLocation(loc.id)} onSetDefault={() => setDefaultLocation(loc.id)} t={t} />
                }
              </div>
            ))}
            {editingLoc === 'new' && (
              <LocationForm form={locForm} setF={setLF} onSave={saveLocation} onCancel={() => setEditingLoc(null)} t={t} />
            )}
          </div>
        </div>

        <button className="btn-primary" onClick={onClose}>{t('common.close')}</button>
      </div>
    </div>
  )
}

function LocationCard({ loc, onEdit, onDelete, onSetDefault, t }) {
  return (
    <div style={{
      border: `1px solid ${loc.isDefault ? 'var(--color-terracotta)' : 'var(--color-sand)'}`,
      borderRadius: 8, padding: '12px 14px',
      background: loc.isDefault ? 'rgba(196,98,45,0.04)' : 'white',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--color-charcoal)' }}>{loc.name}</span>
            {loc.isDefault && (
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-terracotta)', background: 'rgba(196,98,45,0.1)', padding: '1px 7px', borderRadius: 10 }}>
                {t('settings.location_default_badge')}
              </span>
            )}
          </div>
          {loc.address && <div style={{ fontSize: '0.82rem', color: 'var(--color-charcoal-light)', marginBottom: loc.maps_url ? 4 : 0 }}>📍 {loc.address}</div>}
          {loc.maps_url && (
            <a href={loc.maps_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: '0.8rem', color: 'var(--color-terracotta)', textDecoration: 'none' }}
              onClick={e => e.stopPropagation()}>
              🗺️ {t('settings.location_maps_link')}
            </a>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <IconBtn onClick={onEdit} title={t('common.edit')}>✏️</IconBtn>
          <IconBtn onClick={onDelete} title={t('common.delete')}>🗑️</IconBtn>
        </div>
      </div>
      {!loc.isDefault && (
        <button onClick={onSetDefault} style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--color-charcoal-light)', padding: 0 }}>
          {t('settings.location_set_default')}
        </button>
      )}
    </div>
  )
}

function LocationForm({ form, setF, onSave, onCancel, t }) {
  return (
    <div style={{ border: '1px solid var(--color-terracotta)', borderRadius: 8, padding: 14, background: 'rgba(196,98,45,0.03)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        <input className="input" autoFocus value={form.name} onChange={e => setF('name', e.target.value)} placeholder={t('settings.location_name_placeholder')} />
        <input className="input" value={form.address} onChange={e => setF('address', e.target.value)} placeholder={t('settings.location_address_placeholder')} />
        <input className="input" value={form.maps_url} onChange={e => setF('maps_url', e.target.value)} placeholder={t('settings.location_maps_placeholder')} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn-primary" style={{ fontSize: '0.85rem', padding: '6px 14px' }} onClick={onSave} disabled={!form.name.trim()}>{t('common.save')}</button>
        <button className="btn-secondary" style={{ fontSize: '0.85rem', padding: '6px 14px' }} onClick={onCancel}>{t('common.cancel')}</button>
      </div>
    </div>
  )
}


function IconBtn({ onClick, title, children }) {
  return (
    <button onClick={onClick} title={title}
      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: '2px 5px', color: 'var(--color-charcoal-light)', lineHeight: 1 }}>
      {children}
    </button>
  )
}
