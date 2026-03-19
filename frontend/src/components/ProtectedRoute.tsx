import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/lib/auth/AuthContext"

interface ProtectedRouteProps {
  children: React.ReactNode
  /** When true, skips the onboarding redirect (used for the /onboarding route itself). */
  skipOnboardingCheck?: boolean
}

export function ProtectedRoute({ children, skipOnboardingCheck = false }: ProtectedRouteProps) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  if (!skipOnboardingCheck && !user.onboardingCompleted) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
