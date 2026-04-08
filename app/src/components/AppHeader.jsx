import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './LanguageSwitcher'

/**
 * App-wide header component.
 *
 * Props:
 *   logo          — community logo URL; falls back to /Logo.png then nothing
 *   backTo        — path string or -1 (numeric); renders "← Back |" when set
 *   title         — text or node shown after back separator / next to logo
 *   liveIndicator — boolean; green pulse dot before the title
 *   user          — user object { displayName }; shows avatar + dropdown when set
 *                   when null, falls back to plain <LanguageSwitcher />
 *   isFacilitator — gates Members + Settings items in the dropdown
 *   onSettings    — called when Settings item clicked (facilitator only)
 *   onMembers     — called when Members item clicked (facilitator only)
 *   onLogout      — called when Logout item clicked
 *   right         — ReactNode slot appended before the avatar on the right side
 *                   (use for phase badge, display link, etc.)
 */
export default function AppHeader({
  appLogo,
  logo,
  centerLogo = false,
  title,
  liveIndicator = false,
  user,
  isFacilitator = false,
  onSettings,
  onMembers,
  onLogout,
  onSwitchCommunity,
  right,
}) {
  const { i18n, t } = useTranslation()
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false)
      }
    }
    if (showMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  return (
    <header style={{
      background: 'white',
      borderBottom: '1px solid var(--color-sand)',
      padding: '0 20px',
      position: 'sticky',
      top: 0,
      zIndex: 10,
    }}>
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 56,
        position: 'relative',
      }}>

        {/* ── Center — community logo (facilitator only) ── */}
        {logo && centerLogo && (
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' }}>
            <HeaderLogo src={logo} />
          </div>
        )}

        {/* ── Left ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {appLogo && <HeaderLogo src={appLogo} />}
          {logo && !centerLogo && <HeaderLogo src={logo} />}

          {title && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: 7,
              fontFamily: 'var(--font-title)', fontWeight: 600, fontSize: '0.95rem',
              color: 'var(--color-charcoal)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {liveIndicator && (
                <span
                  className="animate-pulse-soft"
                  style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-green)', display: 'inline-block', flexShrink: 0 }}
                />
              )}
              {title}
            </span>
          )}
        </div>

        {/* ── Right ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {right}

          {user ? (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowMenu(v => !v)}
                title={user.displayName}
                style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: isFacilitator ? 'var(--color-terracotta)' : 'var(--color-sand-dark)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.88rem', color: 'white', fontWeight: 600,
                  fontFamily: 'Inter, sans-serif', flexShrink: 0,
                }}
              >
                {user.displayName?.[0]?.toUpperCase() ?? '?'}
              </button>

              {showMenu && (
                <div style={{
                  position: 'absolute', top: 42, right: 0, zIndex: 100,
                  background: 'white', border: '1px solid var(--color-sand)',
                  borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                  minWidth: 200, overflow: 'hidden',
                }}>
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-sand)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--color-charcoal)' }}>
                      {user.displayName}
                    </div>
                  </div>

                  {onSwitchCommunity && (
                    <MenuItem onClick={() => { onSwitchCommunity(); setShowMenu(false) }}>
                      🔀 {t('community_picker.switch_btn')}
                    </MenuItem>
                  )}

                  {isFacilitator && onMembers && (
                    <MenuItem onClick={() => { onMembers(); setShowMenu(false) }}>
                      👥 {t('settings.members_label')}
                    </MenuItem>
                  )}

                  {isFacilitator && onSettings && (
                    <MenuItem onClick={() => { onSettings(); setShowMenu(false) }}>
                      ⚙️ {t('settings.title')}
                    </MenuItem>
                  )}

                  <MenuItem onClick={() => { i18n.changeLanguage(i18n.language === 'nl' ? 'en' : 'nl'); setShowMenu(false) }}>
                    {i18n.language === 'nl' ? '🇬🇧 EN' : '🇳🇱 NL'}
                  </MenuItem>

                  {onLogout && (
                    <div style={{ borderTop: '1px solid var(--color-sand)' }}>
                      <MenuItem onClick={() => { onLogout(); setShowMenu(false) }} danger>
                        {t('home.logout')}
                      </MenuItem>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <LanguageSwitcher />
          )}
        </div>
      </div>
    </header>
  )
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function HeaderLogo({ src }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <Link to="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      <img
        src={src}
        alt="logo"
        style={{ height: 32, maxWidth: 100, objectFit: 'contain' }}
        onError={() => setFailed(true)}
      />
    </Link>
  )
}

function MenuItem({ onClick, children, danger = false }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        padding: '10px 16px', border: 'none', cursor: 'pointer',
        fontSize: '0.88rem', fontFamily: 'Inter, sans-serif',
        background: hover ? 'var(--color-cream)' : 'white',
        color: danger ? 'var(--color-red)' : 'var(--color-charcoal)',
      }}
    >
      {children}
    </button>
  )
}
