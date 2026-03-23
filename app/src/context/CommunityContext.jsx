import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import * as api from '../api/client'
import { useUser } from './UserContext'

const CommunityContext = createContext(null)

export function CommunityProvider({ children }) {
  const { user } = useUser()
  const [community, setCommunity] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const c = await api.getCommunity()
      setCommunity(c)
      setMembers(c.members || [])
    } catch {
      // non-facilitator users won't have a community — that's fine
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  async function updateCommunity(data) {
    const updated = await api.updateCommunity(data)
    setCommunity(updated)
    return updated
  }

  async function createMember(data) {
    const member = await api.createCommunityMember(data)
    setMembers(prev => [...prev, member].sort((a, b) => a.name.localeCompare(b.name)))
    return member
  }

  async function updateMember(id, data) {
    const member = await api.updateCommunityMember(id, data)
    setMembers(prev => prev.map(m => m.id === id ? member : m))
    return member
  }

  async function deleteMember(id) {
    await api.deleteCommunityMember(id)
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  return (
    <CommunityContext.Provider value={{
      community,
      members,
      loading,
      reload: load,
      updateCommunity,
      createMember,
      updateMember,
      deleteMember,
    }}>
      {children}
    </CommunityContext.Provider>
  )
}

export function useCommunity() {
  return useContext(CommunityContext)
}
