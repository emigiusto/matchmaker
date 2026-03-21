import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Phone, MapPin, Building2, Loader2, Swords, ArrowLeft, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PhoneInput } from "@/components/phone-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth/AuthContext"
import { useTranslation } from "@/lib/i18n"
import { usersService } from "@/lib/services/users.service"
import { playersService } from "@/lib/services/players.service"
import { bookingService, SUPPORTED_CLUBS } from "@/lib/services/booking.service"
import { toast } from "sonner"
import { Link } from "react-router-dom"

const TOTAL_STEPS = 3

// step 0 = welcome, steps 1-3 = data, step 4 = success
function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${
            i + 1 === current
              ? "w-6 bg-primary"
              : i + 1 < current
              ? "w-2 bg-primary/40"
              : "w-2 bg-muted-foreground/20"
          }`}
        />
      ))}
    </div>
  )
}

export default function Onboarding() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Step 1: Phone
  const [phone, setPhone] = useState("")

  // Step 2: Location
  const [preferredClub, setPreferredClub] = useState("")
  const [defaultCity, setDefaultCity] = useState("")
  const [playerId, setPlayerId] = useState<string | null>(null)

  // Step 3: Club connection
  const [clubSlug, setClubSlug] = useState<string>(SUPPORTED_CLUBS[0].clubSlug)
  const [socioNumber, setSocioNumber] = useState("")
  const [password, setPassword] = useState("")

  // Pre-fill with existing data in case the user returns to onboarding
  useEffect(() => {
    if (!user) return
    usersService.getProfile(user.id)
      .then(({ user: u, player }) => {
        if (u.phone) setPhone(u.phone)
        if (player) {
          setPlayerId(player.id)
          if (player.preferredClub) setPreferredClub(player.preferredClub)
          if (player.defaultCity) setDefaultCity(player.defaultCity)
        }
      })
      .catch(() => {})
      .finally(() => setLoadingProfile(false))
  }, [user])

  async function finish() {
    if (!user) return
    setSaving(true)
    try {
      await usersService.completeOnboarding(user.id)
      await refreshUser()
      setStep(4)
    } catch {
      toast.error(t("error.somethingWentWrong"))
    } finally {
      setSaving(false)
    }
  }

  async function handleStep1() {
    if (!user) return
    setSaving(true)
    try {
      await usersService.update(user.id, { phone: phone.trim() })
      setStep(2)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.somethingWentWrong"))
    } finally {
      setSaving(false)
    }
  }

  async function handleStep2(skip = false) {
    if (!user) return
    setSaving(true)
    try {
      if (!skip && (preferredClub.trim() || defaultCity.trim())) {
        if (playerId) {
          await playersService.update(playerId, {
            preferredClub: preferredClub.trim() || undefined,
            defaultCity: defaultCity.trim() || undefined,
          })
        } else {
          const p = await playersService.create(user.id, {
            preferredClub: preferredClub.trim() || undefined,
            defaultCity: defaultCity.trim() || undefined,
          })
          setPlayerId(p.id)
        }
      }
      setStep(3)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.somethingWentWrong"))
    } finally {
      setSaving(false)
    }
  }

  async function handleStep3(skip = false) {
    if (!user) return
    setSaving(true)
    try {
      if (!skip && socioNumber.trim()) {
        const club = SUPPORTED_CLUBS.find((c) => c.clubSlug === clubSlug)!
        await bookingService.upsertMembership({
          userId: user.id,
          clubSlug,
          adapterType: club.adapterType,
          socioNumber: socioNumber.trim(),
          password: password.trim() || undefined,
        })
      }
      await finish()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.somethingWentWrong"))
      setSaving(false)
    }
  }

  if (loadingProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-16 shrink-0 items-center border-b border-border/40 bg-card/50 px-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary">
            <Swords className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">{t("common.appName")}</span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">

          {/* Step indicator — only for data steps 1–3 */}
          {step >= 1 && step <= 3 && (
            <div className="space-y-2 text-center">
              <StepIndicator current={step} />
              <p className="text-xs text-muted-foreground">
                {t("onboarding.stepOf", { current: step, total: TOTAL_STEPS })}
              </p>
            </div>
          )}

          {/* Step 0: Welcome */}
          {step === 0 && (
            <StepCard
              icon={<Swords className="h-5 w-5 text-primary" />}
              title={t("onboarding.welcome.title")}
              description={t("onboarding.welcome.description")}
            >
              <Button className="w-full" onClick={() => setStep(1)}>
                {t("onboarding.welcome.getStarted")}
              </Button>
            </StepCard>
          )}

          {/* Step 1: Phone (required — no skip) */}
          {step === 1 && (
            <StepCard
              icon={<Phone className="h-5 w-5 text-primary" />}
              title={t("onboarding.step1.title")}
              description={t("onboarding.step1.description")}
              onBack={() => setStep(0)}
            >
              <div className="space-y-1.5">
                <Label>{t("onboarding.step1.phoneLabel")}</Label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>
              <div className="flex flex-col items-center gap-3 pt-2">
                <Button
                  className="w-full"
                  onClick={handleStep1}
                  disabled={saving || !phone.trim()}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("onboarding.continue")}
                </Button>
              </div>
            </StepCard>
          )}

          {/* Step 2: Location */}
          {step === 2 && (
            <StepCard
              icon={<MapPin className="h-5 w-5 text-primary" />}
              title={t("onboarding.step2.title")}
              description={t("onboarding.step2.description")}
              onBack={() => setStep(1)}
            >
              <div className="space-y-1.5">
                <Label>{t("onboarding.step2.clubLabel")}</Label>
                <Input
                  placeholder={t("onboarding.step2.clubPlaceholder")}
                  value={preferredClub}
                  onChange={(e) => setPreferredClub(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("onboarding.step2.cityLabel")}</Label>
                <Input
                  placeholder={t("onboarding.step2.cityPlaceholder")}
                  value={defaultCity}
                  onChange={(e) => setDefaultCity(e.target.value)}
                />
              </div>
              <StepActions
                onContinue={() => handleStep2(false)}
                onSkip={() => handleStep2(true)}
                loading={saving}
                continueLabel={t("onboarding.continue")}
                skipLabel={t("onboarding.skip")}
                continueDisabled={!preferredClub.trim() && !defaultCity.trim()}
              />
            </StepCard>
          )}

          {/* Step 3: Club connection */}
          {step === 3 && (
            <StepCard
              icon={<Building2 className="h-5 w-5 text-primary" />}
              title={t("onboarding.step3.title")}
              description={t("onboarding.step3.description")}
              onBack={() => setStep(2)}
            >
              <div className="space-y-1.5">
                <Label>{t("onboarding.step3.clubLabel")}</Label>
                <Select value={clubSlug} onValueChange={setClubSlug}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_CLUBS.map((c) => (
                      <SelectItem key={c.clubSlug} value={c.clubSlug}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("onboarding.step3.socioLabel")}</Label>
                <Input
                  placeholder={t("onboarding.step3.socioPlaceholder")}
                  value={socioNumber}
                  onChange={(e) => setSocioNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t("onboarding.step3.passwordLabel")}</Label>
                <Input
                  type="password"
                  placeholder={t("onboarding.step3.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">{t("onboarding.step3.passwordNote")}</p>
              </div>
              <StepActions
                onContinue={() => handleStep3(false)}
                onSkip={() => handleStep3(true)}
                loading={saving}
                continueLabel={t("onboarding.step3.connect")}
                skipLabel={t("onboarding.step3.skipLabel")}
                continueDisabled={!socioNumber.trim()}
              />
            </StepCard>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div className="rounded-2xl border border-border/60 bg-card p-8 shadow-sm text-center space-y-6">
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle2 className="h-8 w-8 text-primary" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold tracking-tight">{t("onboarding.done.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("onboarding.done.description")}</p>
              </div>
              <Button className="w-full" onClick={() => navigate("/dashboard", { replace: true })}>
                {t("onboarding.done.button")}
              </Button>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

function StepCard({
  icon,
  title,
  description,
  onBack,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onBack?: () => void
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-6">
      <div className="space-y-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t("onboarding.back")}
          </button>
        )}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            {icon}
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        </div>
        <p className="text-sm text-muted-foreground pl-11">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

function StepActions({
  onContinue,
  onSkip,
  loading,
  continueLabel,
  skipLabel,
  continueDisabled,
}: {
  onContinue: () => void
  onSkip: () => void
  loading: boolean
  continueLabel: string
  skipLabel: string
  continueDisabled: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-3 pt-2">
      <Button
        className="w-full"
        onClick={onContinue}
        disabled={loading || continueDisabled}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {continueLabel}
      </Button>
      <button
        type="button"
        onClick={onSkip}
        disabled={loading}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {skipLabel}
      </button>
    </div>
  )
}
