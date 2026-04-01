import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
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

const Dashboard = lazy(() => import('@/pages/Dashboard/Dashboard'))
const Play = lazy(() => import('@/pages/Play/Play'))
const Profile = lazy(() => import('@/pages/Profile/Profile'))
const Notifications = lazy(() => import('@/pages/Notifications/Notifications'))
const JoinRequest = lazy(() => import('@/pages/JoinRequest/JoinRequest'))
const MatchesUpcoming = lazy(() => import('@/pages/MatchesUpcoming/MatchesUpcoming'))
const Login = lazy(() => import('@/pages/Login/Login'))
const Signup = lazy(() => import('@/pages/Signup/Signup'))
const Onboarding = lazy(() => import('@/pages/Onboarding/Onboarding'))
const MatchDetailsGate = lazy(() => import('@/pages/MatchDetails/MatchDetailsGate'))
const InviteDetails = lazy(() => import('@/pages/InviteDetails/InviteDetails'))
const ProfileView = lazy(() => import('@/pages/ProfileView/ProfileView'))
const Contacts = lazy(() => import('@/pages/Contacts/Contacts'))
const NotFound = lazy(() => import('@/pages/NotFound/NotFound'))
const AdminDashboard = lazy(() => import('@/pages/Admin/AdminDashboard'))

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

function App() {
  useEffect(() => {
    initAnalytics()
  }, [])

  return (
    <ThemeProvider defaultTheme="system" storageKey="matchmaker-theme">
      <LanguageProvider>
        <AuthProvider>
          <HashRouter>
            <AnalyticsInit />
            <ImpersonationBanner />
            <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
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
            </Suspense>
          </HashRouter>
        </AuthProvider>
        <Toaster />
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App
