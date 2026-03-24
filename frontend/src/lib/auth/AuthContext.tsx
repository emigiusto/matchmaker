import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { authService, type AuthUser } from "@/lib/services/auth.service"
import { track, flush } from "@/lib/analytics/analytics"


interface AuthContextValue {
  user: AuthUser | null
  isAdmin: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  signup: (name: string, email: string, password: string) => Promise<AuthUser>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const u = await authService.me()
    setUser(u)
    return
  }, [])

  useEffect(() => {
    authService
      .me()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const res = await authService.login(email, password)
    setUser(res.user)
    return res.user
  }, [])

  const signup = useCallback(async (name: string, email: string, password: string): Promise<AuthUser> => {
    const res = await authService.signup(name, email, password)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(() => {
    track('auth.logout')
    void flush()
    authService.logout()
    setUser(null)
  }, [])

  const value: AuthContextValue = {
    user,
    isAdmin: !!user?.isAdmin,
    loading,
    login,
    signup,
    logout,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return ctx
}
