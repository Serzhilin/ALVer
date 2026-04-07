import { useTranslation } from 'react-i18next'

/**
 * Full-screen community selection screen.
 * Shown after login when the user belongs to more than one community.
 *
 * Props:
 *   communities — array of { id, name, slug, logo_url, primary_color, isFacilitator }
 *   onSelect    — called with community id when user picks one
 */
export default function CommunityPicker({ communities, onSelect }) {
  const { t } = useTranslation()

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
        {t('community_picker.title')}
      </h1>
      <p style={{
        fontSize: '0.95rem',
        color: 'var(--color-muted, #888)',
        marginBottom: 32,
        textAlign: 'center',
      }}>
        {t('community_picker.subtitle')}
      </p>

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
              borderRadius: 12,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'box-shadow 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'}
            onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
          >
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 10,
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
              <div style={{ fontSize: '0.8rem', color: 'var(--color-muted, #888)', marginTop: 2 }}>
                {c.isFacilitator
                  ? t('community_picker.role_facilitator')
                  : t('community_picker.role_member')}
              </div>
            </div>

            <span style={{ color: 'var(--color-muted, #888)', fontSize: '1.1rem' }}>›</span>
          </button>
        ))}
      </div>
    </div>
  )
}
