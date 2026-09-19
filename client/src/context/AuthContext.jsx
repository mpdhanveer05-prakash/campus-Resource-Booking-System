import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api, ApiError, setCsrfToken } from '../api/client'

const AuthContext = createContext(null)

/**
 * Holds the current user restored from the server session.
 *
 * Identity always comes from GET /api/auth/me: nothing about the user is
 * persisted in the browser, so a refresh re-reads trusted server state.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    const controller = new AbortController()

    async function restore() {
      try {
        // The token must exist before any write, including login.
        await api.csrf()
      } catch {
        // A failed bootstrap is retried on the next write attempt.
      }

      try {
        const data = await api.me(controller.signal)
        setUser(data.user)
      } catch (error) {
        if (error.name === 'AbortError') return
        // 401 simply means "not signed in", which is a normal state.
        if (!(error instanceof ApiError) || error.status !== 401) {
          // Network or server problems leave the user signed out; the screens
          // surface their own errors when an action is attempted.
        }
        setUser(null)
      } finally {
        setStatus('ready')
      }
    }

    restore()
    return () => controller.abort()
  }, [])

  const login = useCallback(async (email, password) => {
    const data = await api.login({ email, password })
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
      setCsrfToken(null)
      // A fresh anonymous session needs a fresh token.
      await api.csrf().catch(() => {})
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: user !== null,
      isAdmin: user?.role === 'ADMIN',
      login,
      logout,
      setUser,
    }),
    [user, status, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
