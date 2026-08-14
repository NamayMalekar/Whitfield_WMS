import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, TOKEN_KEY } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      setLoading(false)
      return
    }
    Promise.all([authApi.me(), authApi.permissions()])
      .then(([me, perms]) => {
        setUser(me.data)
        setPermissions(perms.data)
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const { data } = await authApi.login(username, password)
    localStorage.setItem(TOKEN_KEY, data.access_token)
    setUser(data.user)
    setPermissions(data.permissions)
    return data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
    setPermissions([])
  }, [])

  const can = useCallback((permission) => permissions.includes(permission), [permissions])

  const value = useMemo(
    () => ({ user, permissions, loading, login, logout, can }),
    [user, permissions, loading, login, logout, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
