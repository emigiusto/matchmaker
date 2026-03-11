import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { LanguageProvider } from '@/lib/i18n/language-context'
import { Toaster } from '@/components/ui/sonner'
import { DashboardLayout } from '@/layouts/DashboardLayout'
import Dashboard from '@/pages/Dashboard/Dashboard'
import Play from '@/pages/Play/Play'
import Profile from '@/pages/Profile/Profile'
import Notifications from '@/pages/Notifications/Notifications'
import InviteConfirm from '@/pages/InviteConfirm/InviteConfirm'
import MatchesUpcoming from '@/pages/MatchesUpcoming/MatchesUpcoming'
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
        <BrowserRouter>
          <Routes>
            {/* Root redirects to dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* Public invite page (no sidebar) */}
            <Route path="/invite/:token" element={<InviteConfirm />} />

            {/* Dashboard layout (with sidebar) - v1: Dashboard, My Invites, Profile, Notifications */}
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/play" element={<Play />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/matches" element={<MatchesUpcoming />} />
              {/* Disabled for v1 - components kept for future use */}
              {/* <Route path="/suggested" element={<Suggested />} /> */}
              {/* <Route path="/matches/past" element={<MatchesPast />} /> */}
              <Route path="/matches/:id" element={<MatchDetails />} />
              {/* <Route path="/rankings" element={<Rankings />} /> */}
              <Route path="/profile/:userId" element={<ProfileView />} />
              {/* <Route path="/reminders" element={<Reminders />} /> */}
              {/* <Route path="/ai-coach/companion" element={<AiCoachCompanion />} /> */}
              {/* <Route path="/ai-coach/insights" element={<AiCoachInsights />} /> */}
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </LanguageProvider>
    </ThemeProvider>
  )
}

export default App
