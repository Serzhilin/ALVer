import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useUser } from '../context/UserContext'
import LinkCommunityWizard from './LinkCommunityWizard'

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
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'var(--color-cream, #faf8f5)',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: 16 }}>🔒</div>
        <h1 style={{
          fontFamily: 'var(--font-title, serif)',
          fontSize: '1.4rem',
          fontWeight: 700,
          marginBottom: 12,
          color: 'var(--color-charcoal, #2c2c2c)',
          textAlign: 'center',
        }}>
          {t('community_picker.no_facilitator_communities')}
        </h1>
        <button
          onClick={() => { logout(); navigate('/') }}
          style={{
            marginTop: 8,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-terracotta)',
            fontSize: '0.95rem',
            fontWeight: 500,
          }}
        >
          {t('community_picker.back_to_attendee')}
        </button>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'var(--color-cream, #faf8f5)',
    }}>
      <h1 style={{
        fontFamily: 'var(--font-title, serif)',
        fontSize: '1.6rem',
        fontWeight: 700,
        marginBottom: 8,
        color: 'var(--color-charcoal, #2c2c2c)',
        textAlign: 'center',
      }}>
        {isFacilitatorSession ? t('community_picker.facilitator_title') : t('community_picker.title')}
      </h1>
      {!isFacilitatorSession && (
        <p style={{
          fontSize: '0.95rem',
          color: 'var(--color-muted, #888)',
          marginBottom: 32,
          textAlign: 'center',
        }}>
          {t('community_picker.subtitle')}
        </p>
      )}
      {isFacilitatorSession && <div style={{ marginBottom: 32 }} />}

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        width: '100%',
        maxWidth: 420,
      }}>
        {communities.map(c => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 18px',
              background: 'white',
              border: `2px solid ${c.primary_color || 'var(--color-sand, #e8e0d5)'}`,
              borderRadius: 0,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 0,
              background: c.primary_color || '#C4622D',
              flexShrink: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {c.logo_url
                ? <img src={c.logo_url} alt={c.name} style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
                : <span style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem' }}>
                    {c.name?.[0]?.toUpperCase() ?? '?'}
                  </span>
              }
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 600,
                fontSize: '0.97rem',
                color: 'var(--color-charcoal, #2c2c2c)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {c.name}
              </div>
            </div>

            <span style={{ color: 'var(--color-muted, #888)', fontSize: '1.1rem' }}>›</span>
          </button>
        ))}
      </div>

      {!isFacilitatorSession && (
        <>
          <div style={{ height: 1, background: 'var(--color-sand, #e8e0d5)', margin: '20px 0', width: '100%', maxWidth: 420 }} />
          {showLinkWizard ? (
            <LinkCommunityWizard
              onLinked={(community) => { setShowLinkWizard(false); onSelect(community.id) }}
              onCancel={() => setShowLinkWizard(false)}
            />
          ) : (
            <button
              onClick={() => setShowLinkWizard(true)}
              style={{
                background: 'none',
                border: '2px dashed var(--color-sand, #e8e0d5)',
                padding: '12px 18px',
                width: '100%',
                maxWidth: 420,
                cursor: 'pointer',
                fontSize: '0.9rem',
                color: 'var(--color-muted, #888)',
                textAlign: 'center',
              }}
            >
              + {t('community_link.title', { defaultValue: 'Link community' })}
            </button>
          )}
        </>
      )}
    </div>
  )
}
