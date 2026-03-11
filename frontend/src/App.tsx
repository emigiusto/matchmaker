import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { LanguageProvider } from '@/lib/i18n/language-context'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/lib/auth/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import Dashboard from '@/pages/Dashboard/Dashboard'
import Play from '@/pages/Play/Play'
import Profile from '@/pages/Profile/Profile'
import Notifications from '@/pages/Notifications/Notifications'
import InviteConfirm from '@/pages/InviteConfirm/InviteConfirm'
import MatchesUpcoming from '@/pages/MatchesUpcoming/MatchesUpcoming'
import Login from '@/pages/Login/Login'
import Signup from '@/pages/Signup/Signup'
// Disabled for v1 - components kept for future use
// import Suggested from '@/pages/Suggested/Suggested'
// import MatchesPast from '@/pages/MatchesPast/MatchesPast'
import MatchDetails from '@/pages/MatchDetails/MatchDetails'
// import Rankings from '@/pages/Rankings/Rankings'
import ProfileView from '@/pages/ProfileView/ProfileView'
// import Reminders from '@/pages/Reminders/Reminders'
// import AiCoachCompanion from '@/pages/AiCoachCompanion/AiCoachCompanion'
// import AiCoachInsights from '@/pages/AiCoachInsights/AiCoachInsights'

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="matchmaker-theme">
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Root redirects to dashboard */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              {/* Public: Login and Signup */}
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />

              {/* Public invite page (no sidebar) */}
              <Route path="/invite/:token" element={<InviteConfirm />} />

              {/* Protected: Dashboard layout (with sidebar) */}
              <Route
                element={
                  <ProtectedRoute>
                    <DashboardLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/play" element={<Play />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/matches" element={<MatchesUpcoming />} />
                <Route path="/matches/:id" element={<MatchDetails />} />
                <Route path="/profile/:userId" element={<ProfileView />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
        <Toaster />
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App
