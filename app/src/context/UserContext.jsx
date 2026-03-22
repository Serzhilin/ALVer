import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getMe } from '../api/client'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)       // { id, ename, firstName, lastName, displayName }
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)  // true while validating stored token

  // On mount: restore session from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('alver_token')
    if (!stored) { setLoading(false); return }
    setToken(stored)
    getMe()
      .then(u => { setUser(u) })
      .catch(() => {
        localStorage.removeItem('alver_token')
        setToken(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback((newToken, newUser) => {
    localStorage.setItem('alver_token', newToken)
    setToken(newToken)
    setUser(newUser)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('alver_token')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <UserContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
