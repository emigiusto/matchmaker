import { useParams } from "react-router-dom"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import { AppFooter } from "@/components/app-footer"
import { useAuth } from "@/lib/auth/AuthContext"
import MatchDetailPage from "./MatchDetails"
import PublicMatchDetails from "./PublicMatchDetails"

export default function MatchDetailsGate() {
  const { user, loading } = useAuth()
  const { id } = useParams<{ id: string }>()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    return <PublicMatchDetails matchId={id ?? ""} />
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          <MatchDetailPage />
        </div>
        <AppFooter />
      </SidebarInset>
    </SidebarProvider>
  )
}
