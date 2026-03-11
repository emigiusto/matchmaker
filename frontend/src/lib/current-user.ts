const AUTH_TOKEN_KEY = "matchmaker_auth_token"

function getUserIdFromToken(): string | null {
  if (typeof window === "undefined") return null
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  if (!token) return null
  try {
    const payload = token.split(".")[1]
    if (!payload) return null
    const decoded = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))
    return decoded.userId ?? null
  } catch {
    return null
  }
}

/**
 * Returns the current user ID from the auth token.
 * Used by API calls. When not logged in, falls back to VITE_CURRENT_USER_ID for dev.
 */
export function getCurrentUserId(): string {
  const fromToken = getUserIdFromToken()
  if (fromToken) return fromToken
  return import.meta.env.VITE_CURRENT_USER_ID ?? "user-001"
}
