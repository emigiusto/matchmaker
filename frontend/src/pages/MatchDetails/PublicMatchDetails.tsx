import { useState, useEffect } from "react"
import { useParams, Link } from "react-router-dom"
import { Calendar, Clock, MapPin, Loader2, Users, Zap, BarChart2, CalendarCheck } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { SportFormatBadge } from "@/components/sport-format-badge"
import { matchesService } from "@/lib/services/matches.service"
import { useTranslation } from "@/lib/i18n"
import type { Match } from "@/lib/types"

function TennisBallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 3.5C9.5 6 9.5 18 6 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18 3.5C14.5 6 14.5 18 18 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const FEATURES = [
  { key: "scheduling", icon: CalendarCheck },
  { key: "matchmaking", icon: Zap },
  { key: "tracking", icon: BarChart2 },
] as const

export default function PublicMatchDetails() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const [match, setMatch] = useState<Match | null>(null)
  const [state, setState] = useState<"loading" | "found" | "not-found">("loading")

  useEffect(() => {
    if (!token) { setState("not-found"); return }
    matchesService
      .getByPublicToken(token)
      .then((m) => { setMatch(m); setState("found") })
      .catch(() => setState("not-found"))
  }, [token])

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <TennisBallIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">Matchmaker</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">{t("login.submit")}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/signup">{t("publicMatch.signUp")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-5 py-8 flex flex-col gap-10">
        {/* Loading */}
        {state === "loading" && (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Not found */}
        {state === "not-found" && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <p className="text-lg font-semibold text-foreground">{t("matchDetails.notFound")}</p>
            <p className="text-sm text-muted-foreground">{t("publicMatch.notFoundDesc")}</p>
          </div>
        )}

        {/* Match found */}
        {state === "found" && match && (
          <>
            {/* Match card */}
            <div className="flex flex-col gap-4">
              <div className="text-center">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {t("publicMatch.title")}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("publicMatch.subtitle")}</p>
              </div>

              <Card className="border-border/40">
                <CardContent className="flex flex-col gap-4 pt-6 text-sm">
                  {(match.sport || match.format) && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("matches.matchType")}</span>
                      <SportFormatBadge sport={match.sport ?? "tennis"} format={match.format ?? "singles"} />
                    </div>
                  )}

                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span className="font-medium text-foreground">{match.date}</span>
                  </div>

                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span className="font-medium text-foreground">
                      {match.time}{match.endTime ? ` – ${match.endTime}` : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="font-medium text-foreground">{match.location || t("common.tbd")}</span>
                  </div>

                  {match.participants && match.participants.length > 0 && (
                    <div className="flex items-start gap-2.5 text-muted-foreground">
                      <Users className="mt-0.5 h-4 w-4 shrink-0" />
                      <span className="font-medium text-foreground">
                        {match.participants.map((p) => p.userName ?? t("common.unknown")).join(" · ")}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Divider */}
            <div className="border-t border-border/40" />

            {/* Marketing section */}
            <MarketingSection t={t} />
          </>
        )}

        {/* Marketing section shown on not-found too */}
        {state === "not-found" && (
          <>
            <div className="border-t border-border/40" />
            <MarketingSection t={t} />
          </>
        )}
      </main>

      <footer className="border-t border-border/40 bg-card/50 px-5 py-4 text-center">
        <p className="text-xs text-muted-foreground">{t("footer.tagline")}</p>
      </footer>
    </div>
  )
}

function MarketingSection({ t }: { t: (key: string, params?: Record<string, unknown>) => string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          {t("publicMatch.marketing.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          {t("publicMatch.marketing.description")}
        </p>
      </div>

      <div className="grid gap-3">
        {FEATURES.map(({ key, icon: Icon }) => (
          <div key={key} className="flex items-start gap-3 rounded-xl border border-border/40 bg-card p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t(`publicMatch.marketing.features.${key}.title`)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t(`publicMatch.marketing.features.${key}.desc`)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <Button size="lg" className="w-full font-semibold" asChild>
          <Link to="/signup">{t("publicMatch.marketing.cta")}</Link>
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t("publicMatch.marketing.alreadyHaveAccount")}{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t("login.submit")}
          </Link>
        </p>
      </div>
    </div>
  )
}
