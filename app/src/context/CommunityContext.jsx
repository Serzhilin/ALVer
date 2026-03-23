import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import * as api from '../api/client'
import { useUser } from './UserContext'

const TITLE_FONTS = [
  'Playfair Display',
  'Lora',
  'Merriweather',
  'Libre Baskerville',
  'Inter',
  'Nunito',
  'Poppins',
]

function applyTheme(community) {
  if (!community) return
  const root = document.documentElement
  const color = community.primary_color || '#C4622D'
  root.style.setProperty('--color-terracotta', color)
  // derive a slightly darker hover shade
  root.style.setProperty('--color-amber', color + 'CC')

  const font = community.title_font || 'Playfair Display'
  // inject Google Fonts link if not already present
  const linkId = `gfont-${font.replace(/\s+/g, '-')}`
  if (!document.getElementById(linkId)) {
    const link = document.createElement('link')
    link.id = linkId
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:wght@400;600;700&display=swap`
    document.head.appendChild(link)
  }
  root.style.setProperty('--font-title', `"${font}", serif`)
}

export { TITLE_FONTS }

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
      applyTheme(c)
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
    applyTheme(updated)
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
