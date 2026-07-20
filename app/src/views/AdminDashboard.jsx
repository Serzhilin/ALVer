import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { adminListCommunities, adminDeleteCommunity } from '../api/client'
import { Button, Card, Loading, ErrorText } from '@ecommons/ui'
import styles from './AdminDashboard.module.css'

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
    <div className={styles.root}>
      {/* Header */}
      <header className={styles.header}>
        <span className={styles.headerTitle}>⚙️ {t('admin.title')}</span>
        <Button
          variant="secondary"
          className={styles.logoutBtn}
          onClick={() => { localStorage.removeItem('alver_token'); navigate('/admin', { replace: true }) }}
        >
          {t('admin.logout')}
        </Button>
      </header>

      <div className={styles.content}>

        {/* Community list heading */}
        <h2 className={styles.sectionHeading}>
          {t('admin.communities')} {!loading && `(${communities.length})`}
        </h2>

        {error && <ErrorText as="p">{error}</ErrorText>}

        {loading ? (
          <Loading>{t('admin.loading')}</Loading>
        ) : communities.length === 0 ? (
          <Card className={styles.noCommunitiesCard}>
            <p className={styles.noCommunitiesText}>{t('admin.no_communities')}</p>
          </Card>
        ) : (
          <Card className={styles.communitiesCard}>
            {communities.map((c, i) => (
              <div
                key={c.id}
                className={styles.communityRow}
                style={{ borderBottom: i < communities.length - 1 ? '1px solid var(--color-sand)' : 'none' }}
              >
                <div className={styles.communityLeft}>
                  {c.logo_url
                    ? <img src={c.logo_url} alt="logo" className={styles.communityLogo} />
                    : <div className={styles.communityColorDot} style={{ background: c.primary_color }} />
                  }
                  <div className={styles.communityInfo}>
                    <div className={styles.communityName}>{c.name}</div>
                    <div className={styles.communityMeta}>
                      <span className={styles.communitySlug}>/{c.slug}</span>
                      {c.ename
                        ? <span className={styles.evaultBadge}>w3id: {c.ename}</span>
                        : <span className={styles.noEvaultBadge}>⚠ No eVault</span>
                      }
                    </div>
                  </div>
                </div>
                <div className={styles.communityActions}>
                  {confirmDelete === c.id ? (
                    <div className={styles.confirmRow}>
                      <span className={styles.confirmText}>{t('admin.confirm_delete')}</span>
                      <Button variant="danger" className={styles.actionBtn} onClick={() => handleDelete(c.id)}>
                        {t('common.yes')}
                      </Button>
                      <Button variant="secondary" className={styles.actionBtn} onClick={() => setConfirmDelete(null)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <Button variant="danger" className={styles.actionBtn} onClick={() => setConfirmDelete(c.id)}>
                      {t('admin.delete')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
