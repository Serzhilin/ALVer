import { useState } from 'react'
import AppHeader from './AppHeader'
import SettingsModal from './SettingsModal'
import MembersModal from './MembersModal'
import { useCommunity } from '../context/CommunityContext'
import { useUser } from '../context/UserContext'

/**
 * Header for all facilitator screens.
 * Auto-injects: logo, user, isFacilitator, Settings + Members dropdown, logout.
 *
 * Props:
 *   backTo        — passed through to AppHeader (path or -1)
 *   title         — override title; defaults to community-aware "ALVer [— name]"
 *   liveIndicator — green pulse dot
 *   right         — extra right-side slot (phase badge, display link, etc.)
 */
export default function FacilitatorHeader({ backTo, title, liveIndicator, right }) {
  const { community } = useCommunity()
  const { user, logout, communities, switchCommunity } = useUser()
  const [showSettings, setShowSettings] = useState(false)
  const [showMembers, setShowMembers] = useState(false)

  // When there's a community logo, both logos speak for themselves.
  // When there's no community logo, show the community name as text.
  const defaultTitle = community?.logo_url
    ? undefined
    : (community?.name ?? undefined)

  return (
    <>
      <AppHeader
        appLogo="/logo.png"
        logo={community?.logo_url}
        centerLogo
        backTo={backTo}
        title={title ?? defaultTitle}
        liveIndicator={liveIndicator}
        user={user}
        isFacilitator
        onMembers={() => setShowMembers(true)}
        onSettings={() => setShowSettings(true)}
        onLogout={logout}
        onSwitchCommunity={communities.length > 1 ? switchCommunity : undefined}
        right={right}
      />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showMembers && <MembersModal onClose={() => setShowMembers(false)} />}
    </>
  )
}
