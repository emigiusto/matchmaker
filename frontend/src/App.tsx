import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { initAnalytics } from '@/lib/analytics/analytics'
import { usePageTracking } from '@/lib/analytics/usePageTracking'
import { getImpersonationState, stopImpersonation } from '@/lib/auth/impersonation'
import { useAuth } from '@/lib/auth/AuthContext'
import { ThemeProvider } from '@/components/theme-provider'
import { LanguageProvider } from '@/lib/i18n/language-context'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/lib/auth/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import { WifiOff } from 'lucide-react'
import Dashboard from '@/pages/Dashboard/Dashboard'
import Play from '@/pages/Play/Play'
import Profile from '@/pages/Profile/Profile'
import Notifications from '@/pages/Notifications/Notifications'
import JoinRequest from '@/pages/JoinRequest/JoinRequest'
import MatchesUpcoming from '@/pages/MatchesUpcoming/MatchesUpcoming'
import Login from '@/pages/Login/Login'
import Signup from '@/pages/Signup/Signup'
// Disabled for v1 - components kept for future use
// import Suggested from '@/pages/Suggested/Suggested'
// import MatchesPast from '@/pages/MatchesPast/MatchesPast'
import Onboarding from '@/pages/Onboarding/Onboarding'
import MatchDetailsGate from '@/pages/MatchDetails/MatchDetailsGate'
import InviteDetails from '@/pages/InviteDetails/InviteDetails'
// import Rankings from '@/pages/Rankings/Rankings'
import ProfileView from '@/pages/ProfileView/ProfileView'
import Contacts from '@/pages/Contacts/Contacts'
import NotFound from '@/pages/NotFound/NotFound'
import AdminDashboard from '@/pages/Admin/AdminDashboard'
// import Reminders from '@/pages/Reminders/Reminders'
// import AiCoachCompanion from '@/pages/AiCoachCompanion/AiCoachCompanion'
// import AiCoachInsights from '@/pages/AiCoachInsights/AiCoachInsights'

function AnalyticsInit() {
  usePageTracking()
  return null
}

function ImpersonationBanner() {
  const state = getImpersonationState()
  const { refreshUser } = useAuth()
  const navigate = useNavigate()

  if (!state.active) return null

  async function handleStop() {
    stopImpersonation()
    await refreshUser()
    navigate('/admin')
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 flex items-center justify-between gap-4 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950 shadow-lg">
      <span>👤 Viewing as <strong>{state.targetName}</strong></span>
      <button
        onClick={handleStop}
        className="rounded-md bg-amber-950/15 px-3 py-1 hover:bg-amber-950/25 transition-colors whitespace-nowrap"
      >
        Return to admin
      </button>
    </div>
  )
}

function ServiceUnavailable() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
      <WifiOff className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Service Unavailable</h1>
      <p className="text-sm text-muted-foreground max-w-xs">
        We're having trouble connecting to the server. Please try again in a few minutes.
      </p>
    </div>
  )
}

function App() {
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    initAnalytics()
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const available = (e as CustomEvent<{ available: boolean }>).detail.available
      setApiAvailable(available)
    }
    window.addEventListener('api:status', handler)
    return () => window.removeEventListener('api:status', handler)
  }, [])

  if (apiAvailable === false) return <ServiceUnavailable />

  return (
    <ThemeProvider defaultTheme="system" storageKey="matchmaker-theme">
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter>
            <AnalyticsInit />
            <ImpersonationBanner />
            <Routes>
              {/* Public: Login and Signup */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />

              {/* Public join page (no sidebar) */}
              <Route path="/join/:token" element={<JoinRequest />} />
              {/* Match details: public view if not logged in, full view if logged in */}
              <Route path="/matches/:id" element={<MatchDetailsGate />} />

              {/* Onboarding — requires auth, no sidebar */}
              <Route
                path="/onboarding"
                element={
                  <ProtectedRoute>
                    <Onboarding />
                  </ProtectedRoute>
                }
              />

              {/* Protected: Dashboard layout (with sidebar) */}
              <Route
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="/play" element={<Play />} />
                <Route path="/play/:requestId" element={<InviteDetails />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/matches" element={<MatchesUpcoming />} />
                <Route path="/profile/:userId" element={<ProfileView />} />
                <Route path="/contacts" element={<Contacts />} />
              </Route>
              {/* Admin dashboard */}
              <Route path="/admin" element={<AdminDashboard />} />

              {/* 404 catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
        <Toaster />
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App
