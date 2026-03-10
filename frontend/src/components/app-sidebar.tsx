import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  LayoutDashboard,
  Swords,
  Trophy,
  User,
  Users,
  Bell,
  Clock,
  CirclePlay,
  Zap,
  BrainCircuit,
  BarChart3,
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

export function AppSidebar() {
  const { pathname } = useLocation()
  const [wizardOpen, setWizardOpen] = useState(false)
  const { t } = useTranslation()

  const mainNav = [
    { title: t("navigation.dashboard"), href: "/dashboard", icon: LayoutDashboard },
    { title: t("navigation.myInvites"), href: "/play", icon: CirclePlay },
    { title: t("navigation.suggested"), href: "/suggested", icon: Users },
  ]

  const matchNav = [
    { title: t("navigation.upcoming"), href: "/matches/upcoming", icon: Swords },
    { title: t("navigation.past"), href: "/matches/past", icon: Clock },
    { title: t("navigation.rankings"), href: "/rankings", icon: Trophy },
  ]

  const aiCoachNav = [
    { title: t("navigation.matchCompanion"), href: "/ai-coach/companion", icon: BrainCircuit },
    { title: t("navigation.playerInsights"), href: "/ai-coach/insights", icon: BarChart3 },
  ]

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
              {t("navigation.matches")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {matchNav.map((item) => (
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
              {t("navigation.aiCoach")}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {aiCoachNav.map((item) => (
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
          <div className="flex items-center justify-between gap-2">
            <Link
              to="/profile"
              className="flex flex-1 items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sidebar-accent"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                AR
              </div>
              <div className="flex flex-col">
                <span className="text-base font-medium text-sidebar-foreground">Alex Rivera</span>
                <span className="font-mono text-sm text-muted-foreground">Level 5.2</span>
              </div>
            </Link>
            <LanguageSwitcher />
          </div>
        </SidebarFooter>
      </Sidebar>

      <IWantToPlayWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  )
}
