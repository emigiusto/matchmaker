import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Phone, MapPin, Building2, Loader2, Swords } from "lucide-react"
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

  const [step, setStep] = useState(1)
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
    try {
      await usersService.completeOnboarding(user.id)
      await refreshUser()
      navigate("/dashboard", { replace: true })
    } catch {
      toast.error(t("error.somethingWentWrong"))
    }
  }

  async function handleStep1(skip = false) {
    if (!user) return
    setSaving(true)
    try {
      if (!skip && phone.trim()) {
        await usersService.update(user.id, { phone: phone.trim() })
      }
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
          <div className="space-y-2 text-center">
            <StepIndicator current={step} />
            <p className="text-xs text-muted-foreground">
              {t("onboarding.stepOf", { current: step, total: TOTAL_STEPS })}
            </p>
          </div>

          {step === 1 && (
            <StepCard
              icon={<Phone className="h-5 w-5 text-primary" />}
              title={t("onboarding.step1.title")}
              description={t("onboarding.step1.description")}
            >
              <div className="space-y-1.5">
                <Label>{t("onboarding.step1.phoneLabel")}</Label>
                <PhoneInput value={phone} onChange={setPhone} />
              </div>
              <StepActions
                onContinue={() => handleStep1(false)}
                onSkip={() => handleStep1(true)}
                loading={saving}
                continueLabel={t("onboarding.continue")}
                skipLabel={t("onboarding.skip")}
                continueDisabled={!phone.trim()}
              />
            </StepCard>
          )}

          {step === 2 && (
            <StepCard
              icon={<MapPin className="h-5 w-5 text-primary" />}
              title={t("onboarding.step2.title")}
              description={t("onboarding.step2.description")}
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

          {step === 3 && (
            <StepCard
              icon={<Building2 className="h-5 w-5 text-primary" />}
              title={t("onboarding.step3.title")}
              description={t("onboarding.step3.description")}
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
        </div>
      </main>
    </div>
  )
}

function StepCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-6">
      <div className="space-y-1">
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
