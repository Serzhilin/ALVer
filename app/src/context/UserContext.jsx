import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getMe, getCommunities } from '../api/client'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isFacilitator, setIsFacilitator] = useState(false)
  const [communityId, setCommunityId] = useState(null)
  const [communities, setCommunities] = useState([])

  // After a valid token exists, resolve which community to use.
  // forceAttendee=true: always set isFacilitator=false (attendee login path)
  const resolveSession = useCallback(async (forceAttendee = false) => {
    try {
      const allCommunities = await getCommunities()
      setCommunities(allCommunities)

      const storedId = localStorage.getItem('alver_community_id')
      const validStored = allCommunities.find(c => c.id === storedId)

      let selectedId = null
      if (allCommunities.length === 1) {
        selectedId = allCommunities[0].id
        localStorage.setItem('alver_community_id', selectedId)
      } else if (validStored) {
        selectedId = storedId
      }
      // If length > 1 and no valid stored id: selectedId stays null → picker will show

      setCommunityId(selectedId)
      const me = await getMe(selectedId)
      setUser(me)
      setIsFacilitator(forceAttendee ? false : (me.isFacilitator ?? false))
    } catch {
      localStorage.removeItem('alver_token')
      localStorage.removeItem('alver_community_id')
      setToken(null)
      setUser(null)
      setCommunityId(null)
      setIsFacilitator(false)
      setCommunities([])
    } finally {
      setLoading(false)
    }
  }, [])

  // On mount: restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('alver_token')
    if (!stored) { setLoading(false); return }
    setToken(stored)
    // Restore facilitator mode only if it was explicitly saved
    const facilitatorMode = localStorage.getItem('alver_facilitator_mode') === 'true'
    resolveSession(!facilitatorMode)
  }, [resolveSession])

  // Attendee login — always non-facilitator regardless of community role
  const login = useCallback((newToken) => {
    localStorage.setItem('alver_token', newToken)
    localStorage.removeItem('alver_facilitator_mode')
    setToken(newToken)
    resolveSession(true)
  }, [resolveSession])

  // Facilitator login — sets facilitator mode explicitly
  const loginAsFacilitator = useCallback((newToken) => {
    localStorage.setItem('alver_token', newToken)
    localStorage.setItem('alver_facilitator_mode', 'true')
    setToken(newToken)
    resolveSession(false)
  }, [resolveSession])

  // User picks a community from the picker
  const selectCommunity = useCallback((id) => {
    localStorage.setItem('alver_community_id', id)
    setCommunityId(id)
    const facilitatorMode = localStorage.getItem('alver_facilitator_mode') === 'true'
    getMe(id).then(me => {
      setUser(me)
      setIsFacilitator(facilitatorMode ? (me.isFacilitator ?? false) : false)
    }).catch(console.error)
  }, [])

  // User wants to switch community — clears selection, shows picker again
  const switchCommunity = useCallback(() => {
    localStorage.removeItem('alver_community_id')
    setCommunityId(null)
    setIsFacilitator(false)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('alver_token')
    localStorage.removeItem('alver_community_id')
    localStorage.removeItem('alver_my_name')
    localStorage.removeItem('alver_facilitator_mode')
    setToken(null)
    setUser(null)
    setCommunityId(null)
    setIsFacilitator(false)
    setCommunities([])
  }, [])

  return (
    <UserContext.Provider value={{
      user, token, loading, isFacilitator,
      communityId, communities,
      login, loginAsFacilitator, logout,
      selectCommunity, switchCommunity,
    }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
