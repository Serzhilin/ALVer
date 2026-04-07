import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminListCommunities, adminCreateCommunity, adminDeleteCommunity } from '../api/client'
import { TITLE_FONTS } from '../context/CommunityContext'

const PRESET_COLORS = [
  '#C4622D', '#2D7A4A', '#2D62C4', '#8B2DC4',
  '#C42D62', '#C4A42D', '#2DC4B5', '#4A4A4A',
]

function toSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

const EMPTY_FORM = {
  name: '',
  slug: '',
  facilitator_ename: '',
  primary_color: '#C4622D',
  title_font: 'Playfair Display',
  logo_url: null,
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [communities, setCommunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [slugManual, setSlugManual] = useState(false)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await adminListCommunities()
      setCommunities(data)
    } catch (e) {
      const msg = e?.message || ''
      if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized') || msg.includes('Forbidden')) {
        navigate('/admin', { replace: true })
      } else {
        setError(msg || 'Failed to load communities')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function setField(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function handleNameChange(name) {
    setForm(f => ({
      ...f,
      name,
      slug: slugManual ? f.slug : toSlug(name),
    }))
  }

  function handleSlugChange(raw) {
    setSlugManual(true)
    setField('slug', raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''))
  }

  function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setField('logo_url', ev.target.result)
    reader.readAsDataURL(file)
  }

  async function handleCreate(e) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      await adminCreateCommunity(form)
      setForm(EMPTY_FORM)
      setSlugManual(false)
      await load()
    } catch (e) {
      setFormError(e?.message || 'Failed to create community')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    try {
      await adminDeleteCommunity(id)
      setConfirmDelete(null)
      await load()
    } catch (e) {
      setError(e?.message || 'Failed to delete community')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-cream)' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      {/* Header */}
      <header style={{ background: 'white', borderBottom: '1px solid var(--color-sand)', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <span style={{ fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: '1rem' }}>⚙️ {t('admin.title')}</span>
        <button
          className="btn-secondary"
          style={{ fontSize: '0.8rem', padding: '5px 12px' }}
          onClick={() => { localStorage.removeItem('alver_token'); navigate('/admin', { replace: true }) }}
        >
          {t('admin.logout')}
        </button>
      </header>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>

        {/* Create form */}
        <div className="card" style={{ padding: 28, marginBottom: 32 }}>
          <h2 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 600 }}>{t('admin.new_community')}</h2>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Name + Slug */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>{t('admin.field_name')}</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={e => handleNameChange(e.target.value)}
                  placeholder="My Community"
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>{t('admin.field_slug')}</label>
                <input
                  className="input"
                  value={form.slug}
                  onChange={e => handleSlugChange(e.target.value)}
                  placeholder="my-community"
                  required
                />
              </div>
            </div>

            {/* Facilitator eName */}
            <div>
              <label style={labelStyle}>{t('admin.field_facilitator_ename')}</label>
              <input
                className="input"
                value={form.facilitator_ename}
                onChange={e => setField('facilitator_ename', e.target.value)}
                placeholder="@uuid-here"
                required
              />
            </div>

            {/* Color */}
            <div>
              <label style={labelStyle}>{t('admin.field_color')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setField('primary_color', c)}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', background: c, border: 'none', cursor: 'pointer',
                      outline: form.primary_color === c ? `3px solid ${c}` : '3px solid transparent',
                      outlineOffset: 2,
                    }}
                  />
                ))}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
                  <input
                    type="color"
                    value={form.primary_color}
                    onChange={e => setField('primary_color', e.target.value)}
                    style={{ width: 32, height: 32, border: 'none', cursor: 'pointer', borderRadius: 6, padding: 0 }}
                  />
                  <input
                    className="input"
                    value={form.primary_color}
                    onChange={e => {
                      const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) setField('primary_color', v)
                      else setField('primary_color', e.target.value)
                    }}
                    style={{ width: 90, fontSize: '0.8rem', padding: '4px 8px', fontFamily: 'monospace' }}
                  />
                </div>
              </div>
            </div>

            {/* Font */}
            <div>
              <label style={labelStyle}>{t('admin.field_font')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <select
                  className="input"
                  value={form.title_font}
                  onChange={e => setField('title_font', e.target.value)}
                  style={{ flex: 1 }}
                >
                  {TITLE_FONTS.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <span style={{ fontFamily: `"${form.title_font}", serif`, fontSize: '1.1rem', color: 'var(--color-charcoal)', whiteSpace: 'nowrap' }}>
                  Aa Bb Cc
                </span>
              </div>
            </div>

            {/* Logo */}
            <div>
              <label style={labelStyle}>{t('settings.logo_label')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 80, height: 48, border: '1px solid var(--color-sand)', borderRadius: 8, background: 'var(--color-cream)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                  {form.logo_url
                    ? <img src={form.logo_url} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    : <span style={{ fontSize: '1.5rem' }}>🏛️</span>
                  }
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <label className="btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 12px', cursor: 'pointer' }}>
                    {t(form.logo_url ? 'settings.logo_replace' : 'settings.logo_upload')}
                    <input type="file" accept="image/svg+xml,image/png,image/jpeg" onChange={handleLogoUpload} style={{ display: 'none' }} />
                  </label>
                  {form.logo_url && (
                    <button type="button" className="btn-secondary" style={{ fontSize: '0.82rem', padding: '6px 12px', color: 'var(--color-red)' }} onClick={() => setField('logo_url', null)}>
                      {t('settings.logo_remove')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {formError && <p style={{ margin: 0, color: 'var(--color-red)', fontSize: '0.85rem' }}>{formError}</p>}

            <button className="btn-primary" type="submit" disabled={submitting} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center' }}>
              {submitting && <span style={spinnerStyle} />}
              {submitting ? t('admin.creating') : t('admin.create')}
            </button>
          </form>
        </div>

        {/* Community list */}
        <h2 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 600, color: 'var(--color-charcoal)' }}>
          {t('admin.communities')} {!loading && `(${communities.length})`}
        </h2>

        {error && <p style={{ color: 'var(--color-red)', fontSize: '0.88rem' }}>{error}</p>}

        {loading ? (
          <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.9rem' }}>{t('admin.loading')}</p>
        ) : communities.length === 0 ? (
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            <p style={{ margin: 0, color: 'var(--color-charcoal-light)', fontSize: '0.88rem' }}>{t('admin.no_communities')}</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {communities.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: i < communities.length - 1 ? '1px solid var(--color-sand)' : 'none', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  {c.logo_url
                    ? <img src={c.logo_url} alt="logo" style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }} />
                    : <div style={{ width: 12, height: 12, borderRadius: '50%', background: c.primary_color, flexShrink: 0 }} />
                  }
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>{c.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)' }}>
                        /{c.slug}
                      </span>
                      {c.ename
                        ? <span style={{ fontSize: '0.7rem', color: 'var(--color-charcoal-light)', fontFamily: 'monospace', background: 'var(--color-sand)', padding: '1px 6px', borderRadius: 4 }}>
                            w3id: {c.ename.slice(0, 8)}…
                          </span>
                        : <span style={{ fontSize: '0.7rem', color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 4 }}>
                            ⚠ No eVault
                          </span>
                      }
                    </div>
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {confirmDelete === c.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--color-charcoal)' }}>{t('admin.confirm_delete')}</span>
                      <button className="btn-danger" style={{ fontSize: '0.78rem', padding: '4px 10px' }} onClick={() => handleDelete(c.id)}>{t('common.yes')}</button>
                      <button className="btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 10px' }} onClick={() => setConfirmDelete(null)}>{t('common.cancel')}</button>
                    </div>
                  ) : (
                    <button className="btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 10px', color: 'var(--color-red)', borderColor: 'var(--color-red)' }} onClick={() => setConfirmDelete(c.id)}>
                      {t('admin.delete')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-charcoal-light)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }

const spinnerStyle = {
  display: 'inline-block',
  width: 14,
  height: 14,
  border: '2px solid rgba(255,255,255,0.4)',
  borderTopColor: 'white',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
  marginRight: 6,
}
