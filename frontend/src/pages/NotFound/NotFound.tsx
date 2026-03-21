import { Link } from "react-router-dom"
import { Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth/AuthContext"
import { useTranslation } from "@/lib/i18n/use-translation"

export default function NotFound() {
  const { user, loading } = useAuth()
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center border-b border-border/40 bg-card/50 px-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary">
            <Swords className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">{t("common.appName")}</span>
        </Link>
      </header>

      <div className="flex flex-1 items-center justify-center p-8">
        <div className="flex flex-col items-center text-center space-y-6 max-w-sm">
          {/* Court net illustration using the brand icon */}
          <div className="relative flex items-center justify-center">
            <span className="text-[7rem] font-black leading-none tracking-tighter text-muted-foreground/10 select-none">
              404
            </span>
            <div className="absolute flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Swords className="h-8 w-8 text-primary" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">{t("notFound.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("notFound.description")}</p>
          </div>

          <div className="flex flex-col gap-3 w-full">
            {!loading && user ? (
              <Button asChild className="w-full">
                <Link to="/dashboard">{t("notFound.backToDashboard")}</Link>
              </Button>
            ) : (
              <Button asChild className="w-full">
                <Link to="/login">{t("notFound.backToLogin")}</Link>
              </Button>
            )}
            <Button asChild variant="ghost" className="w-full text-muted-foreground">
              <Link to="/">{t("notFound.goHome")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
