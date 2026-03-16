import { useState, useEffect } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  Swords,
  User,
  Bell,
  CirclePlay,
  Zap,
  LogOut,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { IWantToPlayWizard } from "@/components/i-want-to-play-wizard"
import { LanguageSwitcher } from "@/components/language-switcher"
import { useTranslation } from "@/lib/i18n/use-translation"
import { useAuth } from "@/lib/auth/AuthContext"
import { getCurrentUserId } from "@/lib/current-user"
import { usersService } from "@/lib/services/users.service"

function getInitials(name: string | undefined): string {
  if (!name?.trim()) return "?"
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function AppSidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [userName, setUserName] = useState<string | null>(user?.name ?? null)
  const { t } = useTranslation()
  const currentUserId = getCurrentUserId()

  useEffect(() => {
    setUserName(user?.name ?? null)
  }, [user?.name])

  useEffect(() => {
    usersService
      .getById(currentUserId)
      .then((u) => setUserName(u.name ?? null))
      .catch(() => {})
  }, [currentUserId])

  // v1: Dashboard, My Invites, Matches
  const mainNav = [
    { title: t("navigation.dashboard"), href: "/dashboard", icon: LayoutDashboard },
    { title: t("navigation.myInvites"), href: "/play", icon: CirclePlay },
    { title: t("navigation.matches"), href: "/matches", icon: Swords },
  ]

  // Disabled for v1 - kept for future use
  // const matchNav = [
  //   { title: t("navigation.upcoming"), href: "/matches/upcoming", icon: Swords },
  //   { title: t("navigation.past"), href: "/matches/past", icon: Clock },
  //   { title: t("navigation.rankings"), href: "/rankings", icon: Trophy },
  // ]
  // const aiCoachNav = [
  //   { title: t("navigation.matchCompanion"), href: "/ai-coach/companion", icon: BrainCircuit },
  //   { title: t("navigation.playerInsights"), href: "/ai-coach/insights", icon: BarChart3 },
  // ]

  const personalNav = [
    { title: t("navigation.profile"), href: "/profile", icon: User },
    { title: t("navigation.notifications"), href: "/notifications", icon: Bell },
  ]

  return (
    <>
      <Sidebar>
        <SidebarHeader className="px-5 py-5">
          <Link to="/dashboard" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary">
              <Swords className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
              {t("common.appName")}
            </span>
          </Link>
        </SidebarHeader>

        {/* I Want to Play Button */}
        <div className="px-4 pb-3">
          <Button
            size="xl"
            className="w-full gap-2 shadow-lg shadow-primary/20"
            onClick={() => setWizardOpen(true)}
          >
            <Zap className="h-5 w-5" />
            {t("common.iWantToPlay")}
          </Button>
        </div>

        <Separator className="mx-4 w-auto" />
        <SidebarContent className="px-3 py-4">
          <SidebarGroup>
            <SidebarGroupLabel className="mb-1 px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              {t("navigation.overview")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNav.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                    >
                      <Link to={item.href}>
                        <item.icon className="h-5 w-5" />
                        <span className="text-base">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel className="mb-1 px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
              {t("navigation.personal")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {personalNav.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                    >
                      <Link to={item.href}>
                        <item.icon className="h-5 w-5" />
                        <span className="text-base">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <Link
                to="/profile"
                className="flex flex-1 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sidebar-accent min-w-0"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                  {getInitials(userName ?? user?.name ?? undefined)}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-base font-medium text-sidebar-foreground">
                    {userName ?? user?.name ?? t("navigation.profile")}
                  </span>
                </div>
              </Link>
              <LanguageSwitcher />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                logout()
                navigate("/login")
              }}
            >
              <LogOut className="h-4 w-4" />
              {t("common.logout")}
            </Button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <IWantToPlayWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  )
}
