import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminListCommunities, adminCreateCommunity, adminDeleteCommunity } from '../api/client'

const EMPTY_FORM = { name: '', slug: '', facilitator_ename: '', primary_color: '#C4622D', title_font: 'Playfair Display' }

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [communities, setCommunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // community id

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

  async function handleCreate(e) {
    e.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      await adminCreateCommunity(form)
      setForm(EMPTY_FORM)
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
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>{t('admin.field_name')}</label>
                <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="De Woonwolk" required />
              </div>
              <div>
                <label style={labelStyle}>{t('admin.field_slug')}</label>
                <input className="input" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))} placeholder="dewoonwolk" required />
              </div>
            </div>
            <div>
              <label style={labelStyle}>{t('admin.field_facilitator_ename')}</label>
              <input className="input" value={form.facilitator_ename} onChange={e => setForm(f => ({ ...f, facilitator_ename: e.target.value }))} placeholder="@uuid-here" required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>{t('admin.field_color')}</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} style={{ width: 40, height: 36, border: 'none', cursor: 'pointer', borderRadius: 6 }} />
                  <input className="input" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} style={{ flex: 1 }} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{t('admin.field_font')}</label>
                <input className="input" value={form.title_font} onChange={e => setForm(f => ({ ...f, title_font: e.target.value }))} placeholder="Playfair Display" />
              </div>
            </div>
            {formError && <p style={{ margin: 0, color: 'var(--color-red)', fontSize: '0.85rem' }}>{formError}</p>}
            <button className="btn-primary" type="submit" disabled={submitting} style={{ alignSelf: 'flex-start' }}>
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
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: c.primary_color, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--color-charcoal)' }}>{c.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', marginTop: 2 }}>
                      /{c.slug} · {c.facilitator_ename}
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
