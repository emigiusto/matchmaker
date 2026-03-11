import { Link } from "react-router-dom"
import { Swords } from "lucide-react"
import { useTranslation } from "@/lib/i18n/use-translation"

export function AppFooter() {
  const { t } = useTranslation()

  return (
    <footer className="mt-auto shrink-0 border-t border-border/60 bg-muted/30 px-5 py-3 lg:px-8">
      <div className="flex flex-col items-center justify-between gap-2 sm:flex-row sm:gap-4">
        <Link
          to="/dashboard"
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Swords className="h-3.5 w-3.5 text-primary" />
          {t("common.appName")}
        </Link>
        <span className="text-xs text-muted-foreground">
          {t("footer.tagline")}
        </span>
      </div>
    </footer>
  )
}
