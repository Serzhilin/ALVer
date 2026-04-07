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

  // After a valid token exists, resolve which community to use
  const resolveSession = useCallback(async () => {
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
      setIsFacilitator(me.isFacilitator ?? false)
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
    resolveSession()
  }, [resolveSession])

  // Regular login (attendee or eID)
  const login = useCallback((newToken) => {
    localStorage.setItem('alver_token', newToken)
    setToken(newToken)
    resolveSession()
  }, [resolveSession])

  // Facilitator login — same flow, resolveSession sets isFacilitator from getMe
  const loginAsFacilitator = useCallback((newToken) => {
    localStorage.setItem('alver_token', newToken)
    setToken(newToken)
    resolveSession()
  }, [resolveSession])

  // User picks a community from the picker
  const selectCommunity = useCallback((id) => {
    localStorage.setItem('alver_community_id', id)
    setCommunityId(id)
    getMe(id).then(me => {
      setUser(me)
      setIsFacilitator(me.isFacilitator ?? false)
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
