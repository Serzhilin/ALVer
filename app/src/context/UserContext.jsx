import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getMe } from '../api/client'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)       // { id, ename, firstName, lastName, displayName }
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)  // true while validating stored token
  const [isFacilitator, setIsFacilitator] = useState(false)

  // On mount: restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('alver_token')
    const facilitatorMode = localStorage.getItem('alver_facilitator_mode') === 'true'
    if (!stored) { setLoading(false); return }
    setToken(stored)
    setIsFacilitator(facilitatorMode)
    getMe()
      .then(u => { setUser(u) })
      .catch(() => {
        localStorage.removeItem('alver_token')
        localStorage.removeItem('alver_facilitator_mode')
        setToken(null)
        setIsFacilitator(false)
      })
      .finally(() => setLoading(false))
  }, [])

  // Regular attendee login — never grants facilitator role
  const login = useCallback((newToken, newUser) => {
    localStorage.setItem('alver_token', newToken)
    setToken(newToken)
    setUser(newUser)
  }, [])

  // Facilitator login — only called from /facilitator-login after ename check
  const loginAsFacilitator = useCallback((newToken, newUser) => {
    localStorage.setItem('alver_token', newToken)
    localStorage.setItem('alver_facilitator_mode', 'true')
    setToken(newToken)
    setUser(newUser)
    setIsFacilitator(true)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('alver_token')
    localStorage.removeItem('alver_my_name')
    localStorage.removeItem('alver_facilitator_mode')
    setToken(null)
    setUser(null)
    setIsFacilitator(false)
  }, [])

  return (
    <UserContext.Provider value={{ user, token, loading, isFacilitator, login, loginAsFacilitator, logout }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
