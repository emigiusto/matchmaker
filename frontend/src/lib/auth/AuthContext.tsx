import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { authService, type AuthUser } from "@/lib/services/auth.service"

const ADMIN_USER_IDS = new Set(
  (import.meta.env.VITE_ADMIN_USER_IDS ?? "").split(",").map((s: string) => s.trim()).filter(Boolean)
)

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
    authService.logout()
    setUser(null)
  }, [])

  const value: AuthContextValue = {
    user,
    isAdmin: !!user && ADMIN_USER_IDS.has(user.id),
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
