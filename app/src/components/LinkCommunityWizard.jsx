import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { resolveCommunityW3id, linkCommunityW3id } from '../api/client'
import { Button, Input, Heading, Label, ErrorText } from '@ecommons/ui'
import styles from './LinkCommunityWizard.module.css'

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

  async function handleResolve() {
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

  async function handleLink() {
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

  if (step === 1) return (
    <div className={styles.box}>
      <Heading as="h2" fontSize="1.3rem" fontWeight={700}>
        {t('community_link.title', { defaultValue: 'Link community' })}
      </Heading>
      <p className={styles.desc}>
        {t('community_link.description', { defaultValue: 'Enter the W3DS identity of your community.' })}
      </p>
      <div className={styles.fieldGroup}>
        <Label htmlFor="lcw-w3id" size="sm">
          {t('community_link.w3id_label', { defaultValue: 'Community W3ID' })}
        </Label>
        <Input
          id="lcw-w3id"
          type="text"
          value={w3id}
          onChange={e => setW3id(e.target.value)}
          placeholder="@550e8400-e29b-41d4-a716-..."
        />
      </div>
      {error && <ErrorText as="p">{error}</ErrorText>}
      <div className={styles.actions}>
        <div className={styles.primaryAction}>
          <Button
            variant="primary"
            disabled={loading || !w3id.trim()}
            onClick={handleResolve}
          >
            {loading ? t('community_link.resolving', { defaultValue: 'Checking…' }) : t('community_link.resolve_btn', { defaultValue: 'Continue' })}
          </Button>
        </div>
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel', { defaultValue: 'Cancel' })}
        </Button>
      </div>
    </div>
  )

  if (step === 2) return (
    <div className={styles.box}>
      <Heading as="h2" fontSize="1.3rem" fontWeight={700}>
        {t('community_link.review_title', { defaultValue: 'Review community' })}
      </Heading>
      {resolution.envelope.logo_url && (
        <img src={resolution.envelope.logo_url} alt="" className={styles.logoImg} />
      )}
      <p className={styles.communityName}>{resolution.envelope.name}</p>
      {resolution.envelope.description && (
        <p className={styles.communityDesc}>{resolution.envelope.description}</p>
      )}
      <div className={styles.fieldGroup}>
        <Label htmlFor="lcw-slug" size="sm">
          {t('community_link.slug_label', { defaultValue: 'URL slug' })}
        </Label>
        <Input
          id="lcw-slug"
          type="text"
          value={slug}
          onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        />
      </div>
      <p className={styles.slugHint}>
        {t('community_link.slug_hint', { defaultValue: 'Used in URLs. Letters, numbers, and hyphens only.' })}
      </p>
      {error && <ErrorText as="p">{error}</ErrorText>}
      <div className={styles.actions}>
        <div className={styles.primaryAction}>
          <Button
            variant="primary"
            disabled={loading || !slug}
            onClick={handleLink}
          >
            {loading ? t('community_link.linking', { defaultValue: 'Linking…' }) : t('community_link.link_btn', { defaultValue: 'Link community' })}
          </Button>
        </div>
        <Button variant="secondary" onClick={() => setStep(1)}>
          {t('common.back', { defaultValue: 'Back' })}
        </Button>
      </div>
    </div>
  )

  return (
    <div className={styles.box}>
      <div className={styles.successIcon}>✓</div>
      <Heading as="h2" fontSize="1.3rem" fontWeight={700}>
        {t('community_link.success_title', { defaultValue: 'Community linked!' })}
      </Heading>
      <p className={styles.successDesc}>
        {t('community_link.success_description', { defaultValue: 'You are now the first facilitator of this community in ALVer.' })}
      </p>
      <div className={styles.fullWidthBtn}>
        <Button variant="primary" onClick={() => onLinked(linked)}>
          {t('community_link.enter_btn', { defaultValue: 'Enter community' })}
        </Button>
      </div>
    </div>
  )
}
