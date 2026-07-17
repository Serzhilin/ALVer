import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveCommunityW3id, linkCommunityW3id } from '../api/client'

function toSlug(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

const ERROR_MESSAGES = {
  w3id_not_found: 'community_link.error_w3id_not_found',
  group_not_found: 'community_link.error_group_not_found',
  not_admin: 'community_link.error_not_admin',
  w3id_already_linked: 'community_link.error_already_linked',
  slug_taken: 'community_link.error_slug_taken',
}

export default function LinkCommunityWizard({ onLinked, onCancel }) {
  const { t } = useTranslation()
  const [step, setStep] = useState(1)
  const [w3id, setW3id] = useState('')
  const [resolution, setResolution] = useState(null)
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [linked, setLinked] = useState(null)

  async function handleResolve(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await resolveCommunityW3id(w3id.trim())
      setResolution(res)
      setSlug(toSlug(res.envelope.name))
      setStep(2)
    } catch (err) {
      const key = ERROR_MESSAGES[err.message] ?? 'community_link.error_generic'
      setError(t(key, { defaultValue: err.message }))
    } finally {
      setLoading(false)
    }
  }

  async function handleLink(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const community = await linkCommunityW3id({ w3id: resolution.w3id, slug })
      setLinked(community)
      setStep(3)
    } catch (err) {
      const key = ERROR_MESSAGES[err.message] ?? 'community_link.error_generic'
      setError(t(key, { defaultValue: err.message }))
    } finally {
      setLoading(false)
    }
  }

  const box = {
    maxWidth: 440,
    margin: '0 auto',
    padding: 24,
    background: 'white',
    border: '1px solid var(--color-sand, #e8e0d5)',
  }

  if (step === 1) return (
    <div style={box}>
      <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.3rem', marginBottom: 8 }}>
        {t('community_link.title', { defaultValue: 'Link community' })}
      </h2>
      <p style={{ fontSize: '0.9rem', color: '#888', marginBottom: 20 }}>
        {t('community_link.description', { defaultValue: 'Enter the W3DS identity of your community.' })}
      </p>
      <form onSubmit={handleResolve}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
          {t('community_link.w3id_label', { defaultValue: 'Community W3ID' })}
        </label>
        <input
          type="text"
          value={w3id}
          onChange={e => setW3id(e.target.value)}
          placeholder="@550e8400-e29b-41d4-a716-..."
          required
          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-sand, #e8e0d5)', fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: 8 }}
        />
        {error && <p style={{ color: '#c0392b', fontSize: '0.85rem', marginBottom: 8 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" disabled={loading || !w3id.trim()} className="btn-primary" style={{ flex: 1 }}>
            {loading ? t('community_link.resolving', { defaultValue: 'Checking…' }) : t('community_link.resolve_btn', { defaultValue: 'Continue' })}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </button>
        </div>
      </form>
    </div>
  )

  if (step === 2) return (
    <div style={box}>
      <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.3rem', marginBottom: 16 }}>
        {t('community_link.review_title', { defaultValue: 'Review community' })}
      </h2>
      {resolution.envelope.logo_url && (
        <img src={resolution.envelope.logo_url} alt="" style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 12 }} />
      )}
      <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 4 }}>{resolution.envelope.name}</p>
      {resolution.envelope.description && (
        <p style={{ fontSize: '0.85rem', color: '#888', marginBottom: 16 }}>{resolution.envelope.description}</p>
      )}
      <form onSubmit={handleLink}>
        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
          {t('community_link.slug_label', { defaultValue: 'URL slug' })}
        </label>
        <input
          type="text"
          value={slug}
          onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
          required
          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--color-sand, #e8e0d5)', fontSize: '0.9rem', boxSizing: 'border-box', marginBottom: 8 }}
        />
        <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: 8 }}>
          {t('community_link.slug_hint', { defaultValue: 'Used in URLs. Letters, numbers, and hyphens only.' })}
        </p>
        {error && <p style={{ color: '#c0392b', fontSize: '0.85rem', marginBottom: 8 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="submit" disabled={loading || !slug} className="btn-primary" style={{ flex: 1 }}>
            {loading ? t('community_link.linking', { defaultValue: 'Linking…' }) : t('community_link.link_btn', { defaultValue: 'Link community' })}
          </button>
          <button type="button" onClick={() => setStep(1)} className="btn-secondary">
            {t('common.back', { defaultValue: 'Back' })}
          </button>
        </div>
      </form>
    </div>
  )

  return (
    <div style={box}>
      <div style={{ fontSize: '2rem', marginBottom: 12 }}>✓</div>
      <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '1.3rem', marginBottom: 8 }}>
        {t('community_link.success_title', { defaultValue: 'Community linked!' })}
      </h2>
      <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: 20 }}>
        {t('community_link.success_description', { defaultValue: 'You are now the first facilitator of this community in ALVer.' })}
      </p>
      <button className="btn-primary" style={{ width: '100%' }} onClick={() => onLinked(linked)}>
        {t('community_link.enter_btn', { defaultValue: 'Enter community' })}
      </button>
    </div>
  )
}
