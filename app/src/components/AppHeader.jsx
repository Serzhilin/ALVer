import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Panel, MenuItem } from '@ecommons/ui'
import { LanguageSwitcher } from './LanguageSwitcher'
import styles from './AppHeader.module.css'

function CommunityLogo({ src }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      src={src}
      alt="community logo"
      onError={() => setFailed(true)}
      className={styles.communityLogo}
    />
  )
}

function AppLogo() {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <span className={styles.appLogoFallback}>
        ALVer
      </span>
    )
  }
  return (
    <img
      src="/logo.png"
      alt="ALVer"
      onError={() => setFailed(true)}
      className={styles.appLogo}
    />
  )
}

/**
 * App-wide header — matches CORE's TopBar layout.
 *
 * Props:
 *   logo          — community logo URL; shows as 48px image after "for"
 *   title         — text shown after logo (or instead of logo if no logo); bold when standalone
 *   liveIndicator — green pulse dot before title
 *   user          — { displayName } — shows 51px avatar + dropdown; falls back to LanguageSwitcher
 *   isFacilitator — gates Members + Settings in the dropdown; colors avatar terracotta
 *   onSettings    — called when Settings clicked (facilitator only)
 *   onMembers     — called when Members clicked (facilitator only)
 *   onLogout      — called when Log out clicked
 *   onSwitchCommunity — called when Switch community clicked (only shown when truthy)
 *   right         — ReactNode slot before the avatar (phase badge, display link, etc.)
 */
export default function AppHeader({
  logo,
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
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
    }
    if (showMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  const initial = (user?.firstName || user?.ename || '?')[0].toUpperCase()
  const hasCommunity = !!(logo || title)

  return (
    <header className={styles.header}>
      <div className={styles.inner}>

        {/* Left: ALVer  for  [community logo / name]  [· meeting title] */}
        <div className={styles.left}>
          <Link to="/" className={styles.appLink}>
            <AppLogo />
          </Link>

          {hasCommunity && (
            <span className={styles.forLabel}>for</span>
          )}

          {logo && <CommunityLogo src={logo} />}

          {title && (
            <>
              {logo && (
                <span className={styles.dot}>·</span>
              )}
              <span
                className={styles.titleRow}
                style={{
                  fontFamily: logo ? 'var(--font-sans)' : 'var(--font-title)',
                  fontWeight: logo ? 400 : 700,
                }}
              >
                {liveIndicator && (
                  <span className={`animate-pulse-soft ${styles.liveDot}`} />
                )}
                {title}
              </span>
            </>
          )}
        </div>

        {/* Right: extra slot + avatar + dropdown */}
        <div className={styles.right}>
          {right}

          {user ? (
            <div ref={menuRef} className={styles.menuWrap}>
              <button
                className={styles.avatarBtn}
                onClick={() => setShowMenu(v => !v)}
                title={user.displayName}
              >
                <Avatar
                  src={user.avatarUrl}
                  size={51}
                  background={isFacilitator ? 'var(--color-terracotta)' : 'var(--color-sand-dark)'}
                  fontSize="1.3rem"
                  fontWeight={600}
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {initial}
                </Avatar>
              </button>

              {showMenu && (
                <Panel className={styles.dropdown}>
                  <div className={styles.dropdownUser}>{user.displayName}</div>

                  {onSwitchCommunity && (
                    <MenuItem onClick={() => { onSwitchCommunity(); setShowMenu(false) }}>
                      {t('community_picker.switch_btn')}
                    </MenuItem>
                  )}

                  {isFacilitator && onMembers && (
                    <MenuItem onClick={() => { onMembers(); setShowMenu(false) }}>
                      {t('settings.members_label')}
                    </MenuItem>
                  )}

                  {isFacilitator && onSettings && (
                    <MenuItem onClick={() => { onSettings(); setShowMenu(false) }}>
                      {t('settings.title')}
                    </MenuItem>
                  )}

                  <MenuItem onClick={() => { i18n.changeLanguage(i18n.language === 'nl' ? 'en' : 'nl'); setShowMenu(false) }}>
                    {i18n.language === 'nl' ? 'EN' : 'NL'}
                  </MenuItem>

                  {onLogout && (
                    <div className={styles.dropdownFooter}>
                      <MenuItem onClick={() => { onLogout(); setShowMenu(false) }} danger>
                        {t('home.logout')}
                      </MenuItem>
                    </div>
                  )}
                </Panel>
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
