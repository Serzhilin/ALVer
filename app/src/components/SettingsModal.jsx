import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCommunity, TITLE_FONTS } from '../context/CommunityContext'
import { Modal, Button, Input, Select, Label, Heading, SectionLabel, ErrorText } from '@ecommons/ui'
import styles from './SettingsModal.module.css'

const EMPTY_LOC = { name: '', address: '' }

function mapsUrl(address) {
  return address.trim() ? `https://maps.google.com/?q=${encodeURIComponent(address.trim())}` : ''
}

const PRESET_COLORS = [
  '#C4622D', // terracotta (default)
  '#2D7A4A', // green
  '#2D62C4', // blue
  '#8B2DC4', // purple
  '#C42D62', // rose
  '#C4A42D', // gold
  '#2DC4B5', // teal
  '#4A4A4A', // charcoal
]

export default function SettingsModal({ onClose }) {
  const { t } = useTranslation()
  const { community, updateCommunity } = useCommunity()

  // ── Appearance ────────────────────────────────────────────────────────────
  const [logo, setLogo] = useState(community?.logo_url || null)
  const [color, setColor] = useState(community?.primary_color || '#C4622D')
  const [hexInput, setHexInput] = useState(community?.primary_color || '#C4622D')
  const [font, setFont] = useState(community?.title_font || 'Barlow Condensed')
  const [saveError, setSaveError] = useState(null)

  function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result
      setLogo(dataUrl)
      try {
        setSaveError(null)
        await updateCommunity({ logo_url: dataUrl })
      } catch (err) {
        setSaveError(err.message)
        setLogo(community?.logo_url || null)
      }
    }
    reader.readAsDataURL(file)
  }

  async function removeLogo() {
    try {
      setSaveError(null)
      setLogo(null)
      await updateCommunity({ logo_url: null })
    } catch (err) {
      setSaveError(err.message)
      setLogo(community?.logo_url || null)
    }
  }

  async function applyColor(c) {
    setColor(c)
    setHexInput(c)
    try {
      setSaveError(null)
      await updateCommunity({ primary_color: c })
    } catch (err) {
      setSaveError(err.message)
    }
  }

  function handleHexInput(val) {
    setHexInput(val)
    const clean = val.startsWith('#') ? val : '#' + val
    if (/^#[0-9a-fA-F]{6}$/.test(clean)) applyColor(clean)
  }

  async function applyFont(f) {
    setFont(f)
    try {
      setSaveError(null)
      await updateCommunity({ title_font: f })
    } catch (err) {
      setSaveError(err.message)
    }
  }

  // ── Cooperative name ──────────────────────────────────────────────────────
  const [name, setName] = useState(community?.name || '')
  const [nameSaving, setNameSaving] = useState(false)

  async function saveName() {
    setNameSaving(true)
    try {
      setSaveError(null)
      await updateCommunity({ name })
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setNameSaving(false)
    }
  }

  // ── Locations ─────────────────────────────────────────────────────────────
  const [locations, setLocations] = useState(community?.locations || [])
  const [editingLoc, setEditingLoc] = useState(null)
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
        maps_url: mapsUrl(locForm.address),
        isDefault: locations.length === 0,
      }
      updated = [...locations, newLoc]
    } else {
      updated = locations.map(l => l.id === editingLoc
        ? { ...l, name: locForm.name.trim(), address: locForm.address.trim(), maps_url: mapsUrl(locForm.address) }
        : l)
    }
    try {
      setSaveError(null)
      setLocations(updated)
      await updateCommunity({ locations: updated })
      setEditingLoc(null)
      setLocForm(EMPTY_LOC)
    } catch (err) {
      setSaveError(err.message)
    }
  }

  async function removeLocation(id) {
    const updated = locations.filter(l => l.id !== id)
    if (updated.length > 0 && !updated.some(l => l.isDefault)) updated[0].isDefault = true
    try {
      setSaveError(null)
      setLocations(updated)
      await updateCommunity({ locations: updated })
    } catch (err) {
      setSaveError(err.message)
    }
  }

  async function setDefaultLocation(id) {
    const updated = locations.map(l => ({ ...l, isDefault: l.id === id }))
    try {
      setSaveError(null)
      setLocations(updated)
      await updateCommunity({ locations: updated })
    } catch (err) {
      setSaveError(err.message)
    }
  }

  return (
    <Modal onOverlayClick={onClose}>
      <div className={styles.modalInner} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <Heading as="span" fontSize="1.2rem">
            ⚙️ {t('settings.title')}
          </Heading>
          <Button variant="ghost" onClick={onClose}>✕</Button>
        </div>

        {/* ── Organisation ── */}
        <SectionLabel>{t('settings.organisation_label')}</SectionLabel>

        {/* ── Cooperative name ── */}
        <div className={styles.fieldRow}>
          <Label size="sm">{t('settings.cooperative_name_label')}</Label>
          <div className={styles.nameRow}>
            <div className={styles.nameInput}>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('settings.cooperative_name_placeholder')}
              />
            </div>
            <Button variant="secondary" onClick={saveName} disabled={nameSaving}>
              {t('common.save')}
            </Button>
          </div>
        </div>

        {/* ── Locations ── */}
        <div className={styles.locationsSection}>
          <div className={styles.locationHeader}>
            <Label size="sm">{t('settings.locations_label')}</Label>
            {editingLoc === null && (
              <Button variant="secondary" onClick={() => { setLocForm(EMPTY_LOC); setEditingLoc('new') }}>
                + {t('settings.location_add')}
              </Button>
            )}
          </div>

          {locations.length === 0 && editingLoc !== 'new' && (
            <p className={styles.emptyText}>{t('settings.locations_empty')}</p>
          )}

          <div className={styles.locationList}>
            {locations.map(loc => (
              <div key={loc.id}>
                {editingLoc === loc.id
                  ? <LocationForm form={locForm} setF={setLF} onSave={saveLocation} onCancel={() => setEditingLoc(null)} t={t} />
                  : <LocationCard loc={loc} onEdit={() => { setLocForm({ name: loc.name, address: loc.address || '' }); setEditingLoc(loc.id) }} onDelete={() => removeLocation(loc.id)} onSetDefault={() => setDefaultLocation(loc.id)} t={t} />
                }
              </div>
            ))}
            {editingLoc === 'new' && (
              <LocationForm form={locForm} setF={setLF} onSave={saveLocation} onCancel={() => setEditingLoc(null)} t={t} />
            )}
          </div>
        </div>

        <div className={styles.divider} />

        {/* ── Appearance ── */}
        <SectionLabel>{t('settings.appearance_label')}</SectionLabel>

        {/* Logo */}
        <div className={styles.fieldRow}>
          <Label size="sm">{t('settings.logo_label')}</Label>
          <div className={styles.logoRow}>
            <div className={styles.logoPreview}>
              {logo
                ? <img src={logo} alt="logo" className={styles.logoPreviewImg} />
                : <span className={styles.logoPlaceholder}>🏛️</span>
              }
            </div>
            <div className={styles.logoBtns}>
              <label className={styles.fileBtn}>
                {t(logo ? 'settings.logo_replace' : 'settings.logo_upload')}
                <input type="file" accept="image/svg+xml,image/png,image/jpeg" onChange={handleLogoUpload} style={{ display: 'none' }} />
              </label>
              {logo && (
                <Button variant="danger" onClick={removeLogo}>
                  {t('settings.logo_remove')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Primary color */}
        <div className={styles.fieldRow}>
          <Label size="sm">{t('settings.primary_color_label')}</Label>
          <div className={styles.colorPickerRow}>
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                onClick={() => applyColor(c)}
                title={c}
                style={{
                  width: 28, height: 28, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                  outline: color === c ? `3px solid ${c}` : '3px solid transparent',
                  outlineOffset: 2,
                  transition: 'outline 0.12s',
                }}
              />
            ))}
            {/* custom hex input */}
            <div className={styles.hexInputGroup}>
              <div className={styles.colorSwatch} style={{ background: color }} />
              <div className={styles.hexInputWrap}>
                <Input
                  value={hexInput}
                  onChange={e => handleHexInput(e.target.value)}
                  placeholder="#C4622D"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Title font */}
        <div className={styles.fieldRow}>
          <Label size="sm">{t('settings.title_font_label')}</Label>
          <div className={styles.fontRow}>
            <div className={styles.fontSelect}>
              <Select
                value={font}
                onChange={e => applyFont(e.target.value)}
              >
                {TITLE_FONTS.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </Select>
            </div>
            <span className={styles.fontPreview} style={{ fontFamily: `"${font}", serif` }}>
              Aa Bb Cc
            </span>
          </div>
        </div>

        {saveError && (
          <div className={styles.saveError}>
            Could not save: {saveError}
          </div>
        )}
        <Button variant="primary" onClick={onClose}>{t('common.close')}</Button>
      </div>
    </Modal>
  )
}

function LocationCard({ loc, onEdit, onDelete, onSetDefault, t }) {
  return (
    <div
      className={styles.locationCard}
      style={{
        border: `1px solid ${loc.isDefault ? 'var(--color-terracotta)' : 'var(--color-sand)'}`,
        background: loc.isDefault ? 'rgba(196,98,45,0.04)' : 'white',
      }}
    >
      <div className={styles.locationCardTop}>
        <div className={styles.locationCardBody}>
          <div className={styles.locationNameRow}>
            <span className={styles.locationName}>{loc.name}</span>
            {loc.isDefault && (
              <span className={styles.locationDefaultBadge}>
                {t('settings.location_default_badge')}
              </span>
            )}
          </div>
          {loc.address && (
            <div className={styles.locationAddress}>📍 {loc.address}</div>
          )}
          {loc.maps_url && (
            <a
              href={loc.maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.locationMapsLink}
              onClick={e => e.stopPropagation()}
            >
              🗺️ {t('settings.location_maps_link')}
            </a>
          )}
        </div>
        <div className={styles.locationCardActions}>
          <Button variant="ghost" onClick={onEdit} title={t('common.edit')}>✏️</Button>
          <Button variant="ghost" onClick={onDelete} title={t('common.delete')}>🗑️</Button>
        </div>
      </div>
      {!loc.isDefault && (
        <Button variant="ghost" onClick={onSetDefault}>
          {t('settings.location_set_default')}
        </Button>
      )}
    </div>
  )
}

function LocationForm({ form, setF, onSave, onCancel, t }) {
  return (
    <div
      className={styles.locationForm}
    >
      <div className={styles.locationFormFields}>
        <Input autoFocus value={form.name} onChange={e => setF('name', e.target.value)} placeholder={t('settings.location_name_placeholder')} />
        <Input value={form.address} onChange={e => setF('address', e.target.value)} placeholder={t('settings.location_address_placeholder')} />
      </div>
      <div className={styles.locationFormActions}>
        <Button variant="primary" onClick={onSave} disabled={!form.name.trim()}>{t('common.save')}</Button>
        <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
      </div>
    </div>
  )
}
