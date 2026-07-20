import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useUser } from '../context/UserContext'
import { Button, Card, Avatar } from '@ecommons/ui'
import LinkCommunityWizard from './LinkCommunityWizard'
import styles from './CommunityPicker.module.css'

/**
 * Full-screen community selection screen.
 * Shown after login when the user belongs to more than one community.
 *
 * Props:
 *   communities       — array of { id, name, slug, logo_url, primary_color, isFacilitator }
 *   onSelect          — called with community id when user picks one
 *   isFacilitatorSession — true when user logged in via /facilitator route
 */
export default function CommunityPicker({ communities, onSelect, isFacilitatorSession = false }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { logout } = useUser()
  const [showLinkWizard, setShowLinkWizard] = useState(false)

  // Error state: facilitator login but no facilitator communities
  if (isFacilitatorSession && communities.length === 0) {
    return (
      <div className={styles.page}>
        <div className={styles.errorIcon}>🔒</div>
        <h1 className={styles.errorTitle}>
          {t('community_picker.no_facilitator_communities')}
        </h1>
        <Button
          variant="secondary"
          onClick={() => { logout(); navigate('/') }}
        >
          {t('community_picker.back_to_attendee')}
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>
        {isFacilitatorSession ? t('community_picker.facilitator_title') : t('community_picker.title')}
      </h1>
      {!isFacilitatorSession && (
        <p className={styles.subtitle}>
          {t('community_picker.subtitle')}
        </p>
      )}
      {isFacilitatorSession && <div className={styles.spacer} />}

      <div className={styles.list}>
        {communities.map(c => (
          <Card
            key={c.id}
            role="button"
            tabIndex={0}
            style={{ border: `2px solid ${c.primary_color || 'var(--color-sand, #e8e0d5)'}`, cursor: 'pointer' }}
            className={styles.communityCard}
            onClick={() => onSelect(c.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c.id); } }}
          >
            <Avatar
              src={c.logo_url || undefined}
              size={44}
              background={c.primary_color || '#C4622D'}
              fontSize="1.1rem"
              fontWeight={700}
            >
              {c.name?.[0]?.toUpperCase() ?? '?'}
            </Avatar>
            <span className={styles.communityName}>{c.name}</span>
            <span className={styles.chevron}>›</span>
          </Card>
        ))}
      </div>

      {!isFacilitatorSession && (
        <>
          <div className={styles.separator} />
          {showLinkWizard ? (
            <LinkCommunityWizard
              onLinked={(community) => { setShowLinkWizard(false); onSelect(community.id) }}
              onCancel={() => setShowLinkWizard(false)}
            />
          ) : (
            <div className={styles.linkBtnWrap}>
              <div className={styles.fullWidthBtn}>
                <Button
                  variant="secondary"
                  onClick={() => setShowLinkWizard(true)}
                >
                  + {t('community_link.title', { defaultValue: 'Link community' })}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
