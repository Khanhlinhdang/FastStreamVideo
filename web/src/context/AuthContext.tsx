import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api } from '../api'
import { getAccessToken, setAccessToken, tryRefresh } from '../api/client'
import type { User } from '../api/types'

type AuthContextValue = {
  user: User | null
  loading: boolean
  isAuthenticated: boolean
  /** Admin panel access (admin or editor) */
  isAdmin: boolean
  /** Full admin only — purge, disk, security */
  isFullAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    let token = getAccessToken()
    if (!token) {
      token = await tryRefresh()
    }
    if (!token) {
      setUser(null)
      return
    }
    const me = await api.me()
    setUser(me)
    if (!me) setAccessToken(null)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await refreshUser()
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password })
    setAccessToken(res.accessToken)
    setUser(res.user)
  }, [])

  const register = useCallback(
    async (email: string, password: string, displayName: string) => {
      const res = await api.register({ email, password, displayName })
      setAccessToken(res.accessToken)
      setUser(res.user)
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      /* ignore */
    }
    setAccessToken(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'admin' || user?.role === 'editor',
      isFullAdmin: user?.role === 'admin',
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, loading, login, register, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
