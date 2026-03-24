import { apiClient, AUTH_TOKEN_KEY } from "./api-client"

export interface AuthUser {
  id: string
  name?: string
  email?: string
  phone?: string
  isGuest: boolean
  isAdmin: boolean
  onboardingCompleted: boolean
}

export interface AuthResponse {
  user: AuthUser
  token: string
}

export const authService = {
  async signup(name: string, email: string, password: string): Promise<AuthResponse> {
    const locale = navigator.language?.toLowerCase().startsWith("en") ? "en" : "es"
    const res = await apiClient.post<AuthResponse>("/auth/signup", { name, email, password, locale })
    if (res?.token) {
      localStorage.setItem(AUTH_TOKEN_KEY, res.token)
    }
    return res
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>("/auth/login", { email, password })
    if (res?.token) {
      localStorage.setItem(AUTH_TOKEN_KEY, res.token)
    }
    return res
  },

  async me(): Promise<AuthUser | null> {
    const token = localStorage.getItem(AUTH_TOKEN_KEY)
    if (!token) return null
    try {
      const user = await apiClient.get<AuthUser>("/auth/me")
      return user ?? null
    } catch {
      localStorage.removeItem(AUTH_TOKEN_KEY)
      return null
    }
  },

  getToken(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  },

  logout(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY)
  },
}
