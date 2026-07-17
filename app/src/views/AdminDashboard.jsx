import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminListCommunities, adminDeleteCommunity } from '../api/client'

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [communities, setCommunities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
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
                        ? <span style={{ fontSize: '0.7rem', color: 'var(--color-charcoal-light)', fontFamily: 'monospace', background: 'var(--color-sand)', padding: '1px 6px', borderRadius: 0 }}>
                            w3id: {c.ename}
                          </span>
                        : <span style={{ fontSize: '0.7rem', color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 0 }}>
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
