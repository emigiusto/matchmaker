import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Phone, MapPin, Building2, Users, X, Loader2, Swords, ArrowLeft, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { PhoneInput } from "@/components/phone-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth/AuthContext"
import { useTranslation } from "@/lib/i18n"
import { usersService } from "@/lib/services/users.service"
import { playersService } from "@/lib/services/players.service"
import { bookingService, SUPPORTED_CLUBS } from "@/lib/services/booking.service"
import { contactsService } from "@/lib/services/contacts.service"
import { track } from "@/lib/analytics/analytics"
import { toast } from "sonner"
import { Link, useSearchParams } from "react-router-dom"

const TOTAL_STEPS = 4

// step 0 = welcome, steps 1-4 = data, step 5 = success
function StepIndicator({ current, onBack }: { current: number; onBack?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
          aria-label={t("onboarding.back")}
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      ) : (
        <div className="w-7 shrink-0" />
      )}
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
    </div>
  )
}

export default function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const redirectAfter = searchParams.get("redirect") ?? "/"

  // If onboarding is already completed (e.g. done on another device), skip to destination
  useEffect(() => {
    if (user?.onboardingCompleted) {
      navigate(redirectAfter, { replace: true })
    }
  }, [user?.onboardingCompleted, navigate, redirectAfter])

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [mergedMatchCount, setMergedMatchCount] = useState(0)

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

  // Step 4: Contacts
  const [contactDrafts, setContactDrafts] = useState<Array<{ name: string; phone: string }>>([])
  const [draftName, setDraftName] = useState("")
  const [draftPhone, setDraftPhone] = useState("")

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
    setSaving(true)
    try {
      track('onboarding.completed')
      setStep(5)
    } finally {
      setSaving(false)
    }
  }

  async function handleStep1() {
    if (!user) return
    setSaving(true)
    try {
      const result = await usersService.update(user.id, { phone: phone.trim() })
      if (result.mergedMatchCount) setMergedMatchCount(result.mergedMatchCount)
      await usersService.completeOnboarding(user.id)
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
      setStep(4)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.somethingWentWrong"))
    } finally {
      setSaving(false)
    }
  }

  function addContactDraft() {
    if (!draftName.trim() || !draftPhone.trim()) return
    setContactDrafts((prev) => [...prev, { name: draftName.trim(), phone: draftPhone.trim() }])
    setDraftName("")
    setDraftPhone("")
  }

  async function handleStep4(skip = false) {
    if (!user) return
    setSaving(true)
    try {
      if (!skip && contactDrafts.length > 0) {
        await Promise.allSettled(
          contactDrafts.map((c) => contactsService.create(user.id, c.name, c.phone))
        )
      }
      await finish()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("error.somethingWentWrong"))
    } finally {
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

          {/* Step indicator — only for data steps 1–4 */}
          {step >= 1 && step <= 4 && (
            <div className="space-y-1">
              <StepIndicator
                current={step}
                onBack={() => setStep(step - 1)}
              />
              <p className="text-xs text-muted-foreground pl-10">
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
              optional
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
                skipProminent
              />
            </StepCard>
          )}

          {/* Step 4: Contacts */}
          {step === 4 && (
            <StepCard
              icon={<Users className="h-5 w-5 text-primary" />}
              title={t("onboarding.step4.title")}
              description={t("onboarding.step4.description")}
              optional
            >
              {/* Add contact form */}
              <div className="flex gap-2">
                <Input
                  placeholder={t("onboarding.step4.namePlaceholder")}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addContactDraft() } }}
                />
                <Input
                  placeholder={t("onboarding.step4.phonePlaceholder")}
                  value={draftPhone}
                  onChange={(e) => setDraftPhone(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addContactDraft() } }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addContactDraft}
                  disabled={!draftName.trim() || !draftPhone.trim()}
                >
                  {t("onboarding.step4.addButton")}
                </Button>
              </div>

              {/* Added contacts list */}
              {contactDrafts.length > 0 && (
                <div className="space-y-1.5">
                  {contactDrafts.map((c, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                      <span className="font-medium">{c.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{c.phone}</span>
                        <button
                          type="button"
                          onClick={() => setContactDrafts((prev) => prev.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <StepActions
                onContinue={() => handleStep4(false)}
                onSkip={() => handleStep4(true)}
                loading={saving}
                continueLabel={contactDrafts.length > 0 ? t("onboarding.step4.continue") : t("onboarding.skip")}
                skipLabel={t("onboarding.step4.skipLabel")}
                continueDisabled={false}
                skipProminent={contactDrafts.length === 0}
              />
            </StepCard>
          )}

          {/* Step 5: Success */}
          {step === 5 && (
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
              {mergedMatchCount > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm space-y-1">
                  <p className="font-medium text-primary">
                    {mergedMatchCount === 1
                      ? t("onboarding.done.matchesFound_one")
                      : t("onboarding.done.matchesFound_other", { count: mergedMatchCount })}
                  </p>
                  <Link to="/matches/past" className="text-primary underline underline-offset-2">
                    {t("onboarding.done.viewMatches")}
                  </Link>
                </div>
              )}
              <Button className="w-full" onClick={() => navigate(redirectAfter, { replace: true })}>
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
  optional,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  optional?: boolean
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-6 shadow-sm space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            {icon}
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {optional && (
              <Badge variant="secondary" className="text-xs font-normal">
                {t("onboarding.optional")}
              </Badge>
            )}
          </div>
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
  skipProminent,
}: {
  onContinue: () => void
  onSkip: () => void
  loading: boolean
  continueLabel: string
  skipLabel: string
  continueDisabled: boolean
  skipProminent?: boolean
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
      {skipProminent ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onSkip}
          disabled={loading}
        >
          {skipLabel}
        </Button>
      ) : (
        <button
          type="button"
          onClick={onSkip}
          disabled={loading}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {skipLabel}
        </button>
      )}
    </div>
  )
}
