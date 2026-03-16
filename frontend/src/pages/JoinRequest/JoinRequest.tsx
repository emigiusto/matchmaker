import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { format } from "date-fns"
import {
  Calendar,
  Clock,
  MapPin,
  CheckCircle,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useTranslation } from "@/lib/i18n"
import {
  schedulingService,
  type PublicSchedulingInviteDTO,
} from "@/lib/services/scheduling.service"

function TennisBallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 3.5C9.5 6 9.5 18 6 20.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M18 3.5C14.5 6 14.5 18 18 20.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

type PageState = "loading" | "not-found" | "cancelled" | "match-full" | "form" | "success"

function getSportFormatKey(sportType: string, format: string): string {
  if (sportType === "padel") return "sportFormat.padel"
  if (format === "doubles") return "sportFormat.tennisDoubles"
  return "sportFormat.tennisSingles"
}

function formatDateNice(isoStr: string): string {
  try {
    return format(new Date(isoStr), "EEEE, MMM d")
  } catch {
    return isoStr
  }
}

function formatTimeNice(isoStr: string): string {
  try {
    return format(new Date(isoStr), "HH:mm")
  } catch {
    return isoStr
  }
}

export default function JoinRequest() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()

  const [pageState, setPageState] = useState<PageState>("loading")
  const [invite, setInvite] = useState<PublicSchedulingInviteDTO | null>(null)

  // Form state
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [socioNumber, setSocioNumber] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) {
      setPageState("not-found")
      return
    }
    schedulingService
      .getForJoin(token)
      .then((data) => {
        if (!data) {
          setPageState("not-found")
          return
        }
        setInvite(data)
        if (data.status === "cancelled") {
          setPageState("cancelled")
        } else if (data.status === "completed" && data.matchId) {
          setPageState("match-full")
        } else {
          setPageState("form")
        }
      })
      .catch(() => setPageState("not-found"))
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !name.trim() || !phone.trim()) return
    setSubmitting(true)
    try {
      const result = await schedulingService.acceptViaLink(token, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        socioNumber: socioNumber.trim() || undefined,
      })
      if (result.status === "already_filled") {
        setPageState("match-full")
      } else {
        setPageState("success")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("joinRequest.states.notFound"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
              <TennisBallIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              {t("common.appName")}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 py-8">
        {/* Loading */}
        {pageState === "loading" && (
          <div className="flex flex-col items-center justify-center gap-4 py-24">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t("joinRequest.states.loading")}</p>
          </div>
        )}

        {/* Not Found */}
        {pageState === "not-found" && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <p className="text-lg font-semibold text-foreground">{t("joinRequest.states.notFound")}</p>
          </div>
        )}

        {/* Cancelled */}
        {pageState === "cancelled" && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <p className="text-lg font-semibold text-foreground">{t("joinRequest.states.cancelled")}</p>
          </div>
        )}

        {/* Match Full */}
        {pageState === "match-full" && (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <p className="text-lg font-semibold text-foreground">{t("joinRequest.states.alreadyFilled")}</p>
            <p className="text-sm text-muted-foreground">{t("joinRequest.states.alreadyFilledDesc")}</p>
          </div>
        )}

        {/* Success */}
        {pageState === "success" && invite && (
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-8 text-center">
              <CheckCircle className="mx-auto mb-4 h-12 w-12 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">{t("joinRequest.states.successTitle")}</h1>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {t("joinRequest.states.successDesc")}
              </p>
            </div>

            {/* Match summary */}
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("joinRequest.matchDetails")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>{formatDateNice(invite.date)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>{formatTimeNice(invite.startTime)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>{invite.locationText || t("common.tbd")}</span>
                </div>
              </CardContent>
            </Card>

            <p className="text-center text-sm text-muted-foreground">
              {t("joinRequest.subtitle", { hostName: invite.hostName })}
            </p>
          </div>
        )}

        {/* Form */}
        {pageState === "form" && invite && (
          <div className="flex flex-col gap-6">
            {/* Title */}
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {t("joinRequest.title")}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("joinRequest.subtitle", { hostName: invite.hostName })}
              </p>
            </div>

            {/* Match details card */}
            <Card className="border-border/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t("joinRequest.matchDetails")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("matches.sport") ?? "Sport"}</span>
                  <span className="font-medium">{t(getSportFormatKey(invite.sportType, invite.format))}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>{formatDateNice(invite.date)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>{formatTimeNice(invite.startTime)}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span>{invite.locationText || t("common.tbd")}</span>
                </div>
              </CardContent>
            </Card>

            {/* Accept form */}
            <Card className="border-border/40">
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  {/* Name */}
                  <div>
                    <Label htmlFor="join-name" className="text-sm font-medium">
                      {t("joinRequest.form.name")} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="join-name"
                      placeholder={t("joinRequest.form.namePlaceholder")}
                      className="mt-1.5"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <Label htmlFor="join-phone" className="text-sm font-medium">
                      {t("joinRequest.form.phone")} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="join-phone"
                      type="tel"
                      placeholder={t("joinRequest.form.phonePlaceholder")}
                      className="mt-1.5"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>

                  {/* Email (optional) */}
                  <div>
                    <Label htmlFor="join-email" className="text-sm font-medium">
                      {t("joinRequest.form.email")}
                    </Label>
                    <Input
                      id="join-email"
                      type="email"
                      placeholder={t("joinRequest.form.emailPlaceholder")}
                      className="mt-1.5"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  {/* Socio # (only when bookingEnabled) */}
                  {invite.bookingEnabled && (
                    <div>
                      <Label htmlFor="join-socio" className="text-sm font-medium">
                        {t("joinRequest.form.socioNumber")}
                      </Label>
                      <Input
                        id="join-socio"
                        placeholder={t("wizard.socioPlaceholder")}
                        className="mt-1.5"
                        value={socioNumber}
                        onChange={(e) => setSocioNumber(e.target.value)}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("joinRequest.form.socioNumberHint")}
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full gap-2 text-base font-semibold"
                    disabled={submitting || !name.trim() || !phone.trim()}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t("joinRequest.form.submitting")}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        {t("joinRequest.form.submit")}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
