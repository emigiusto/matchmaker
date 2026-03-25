import { useState, useEffect } from "react"
import {
  Phone,
  Mail,
  Globe,
  User as UserIcon,
  Settings,
  Loader2,
  Save,
  MapPin,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  Wifi,
  Eye,
  EyeOff,
  Pencil,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/page-header"
import { PhoneInput } from "@/components/phone-input"
import { useLanguage } from "@/lib/i18n/language-context"
import { toE164, validatePhoneE164 } from "@/lib/phone.utils"
import { useTranslation } from "@/lib/i18n/use-translation"
import { useLocation } from "react-router-dom"
import { getCurrentUserId } from "@/lib/current-user"
import { usersService, type User } from "@/lib/services/users.service"
import { playersService } from "@/lib/services/players.service"
import { bookingService, SUPPORTED_CLUBS, type ClubMembershipDTO } from "@/lib/services/booking.service"
import { toast } from "sonner"
import type { PlayerStats } from "@/lib/types"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { format, parseISO } from "date-fns"

export default function ProfilePage() {
  const currentUserId = getCurrentUserId()
  const { hash } = useLocation()
  const { language, setLanguage } = useLanguage()
  const { t } = useTranslation()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: "", phone: "" })
  const [player, setPlayer] = useState<{ id: string; preferredClub?: string; defaultCity?: string } | null>(null)
  const [locationForm, setLocationForm] = useState({ preferredClub: "", defaultCity: "" })
  const [savingLocation, setSavingLocation] = useState(false)

  // Club connections state
  const [memberships, setMemberships] = useState<ClubMembershipDTO[]>([])
  const [clubForm, setClubForm] = useState<{ clubSlug: string; socioNumber: string; password: string }>({
    clubSlug: SUPPORTED_CLUBS[0].clubSlug,
    socioNumber: "",
    password: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [savingClub, setSavingClub] = useState(false)
  const [testingClub, setTestingClub] = useState<string | null>(null)
  const [editingClub, setEditingClub] = useState<string | null>(null)
  const [stats, setStats] = useState<PlayerStats | null>(null)

  async function fetchMemberships() {
    try {
      const list = await bookingService.listMemberships(currentUserId)
      setMemberships(list)
    } catch {
      // non-critical
    }
  }

  async function refetchProfile() {
    try {
      const profile = await usersService.getProfile(currentUserId)
      setUser(profile.user)
      setForm({
        name: profile.user.name ?? "",
        phone: profile.user.phone ?? "",
      })
      if (profile.player) {
        setPlayer(profile.player)
        setLocationForm({
          preferredClub: profile.player.preferredClub ?? "",
          defaultCity: profile.player.defaultCity ?? "",
        })
      } else {
        setPlayer(null)
        setLocationForm({ preferredClub: "", defaultCity: "" })
      }
    } catch {
      setUser(null)
      setPlayer(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    usersService
      .getProfile(currentUserId)
      .then((profile) => {
        if (!cancelled) {
          setUser(profile.user)
          setForm({
            name: profile.user.name ?? "",
            phone: profile.user.phone ?? "",
          })
          if (profile.player) {
            setPlayer(profile.player)
            setLocationForm({
              preferredClub: profile.player.preferredClub ?? "",
              defaultCity: profile.player.defaultCity ?? "",
            })
            playersService.getStats(profile.player.id).then((s) => {
              if (!cancelled) setStats(s)
            }).catch(() => {})
          } else {
            setPlayer(null)
            setLocationForm({ preferredClub: "", defaultCity: "" })
          }
        }
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [currentUserId])

  useEffect(() => {
    fetchMemberships()
  }, [currentUserId])

  const [highlightedHash, setHighlightedHash] = useState<string | null>(null)
  useEffect(() => {
    if (!hash) return
    const el = document.querySelector(hash)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
      setHighlightedHash(hash)
      const t = setTimeout(() => setHighlightedHash(null), 1800)
      return () => clearTimeout(t)
    }
  }, [hash])

  async function handleSaveLocation(e: React.FormEvent) {
    e.preventDefault()
    setSavingLocation(true)
    try {
      const preferredClub = locationForm.preferredClub.trim() || undefined
      const defaultCity = locationForm.defaultCity.trim() || undefined
      if (player) {
        await playersService.update(player.id, { preferredClub, defaultCity })
      } else {
        const created = await playersService.create(currentUserId, {
          preferredClub,
          defaultCity,
        })
        setPlayer(created)
      }
      toast.success(t("success.saved"))
      await refetchProfile()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("profilePage.toast.saveFailed")
      toast.error(msg)
    } finally {
      setSavingLocation(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    let phoneToSave: string | null | undefined = form.phone?.trim() ? form.phone.trim() : null
    if (phoneToSave) {
      const normalized = phoneToSave.startsWith("+") ? phoneToSave : toE164(phoneToSave, "34")
      const validation = validatePhoneE164(normalized)
      if (!validation.valid) {
        toast.error(validation.error)
        return
      }
      phoneToSave = normalized
    }
    setSaving(true)
    setSaveError(null)
    try {
      await usersService.update(currentUserId, {
        name: form.name || undefined,
        phone: phoneToSave,
      })
      toast.success(t("success.saved"))
      await refetchProfile()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("profilePage.toast.saveFailed")
      setSaveError(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveClub(e: React.FormEvent) {
    e.preventDefault()
    setSavingClub(true)
    try {
      const club = SUPPORTED_CLUBS.find((c) => c.clubSlug === clubForm.clubSlug)!
      await bookingService.upsertMembership({
        userId: currentUserId,
        clubSlug: clubForm.clubSlug,
        adapterType: club.adapterType,
        socioNumber: clubForm.socioNumber.trim(),
        password: clubForm.password.trim() || undefined,
      })
      toast.success(t("profilePage.toast.connectionSaved"))
      setClubForm((p) => ({ ...p, socioNumber: "", password: "" }))
      setEditingClub(null)
      await fetchMemberships()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profilePage.toast.connectionFailed"))
    } finally {
      setSavingClub(false)
    }
  }

  async function handleTestConnection(clubSlug: string) {
    setTestingClub(clubSlug)
    try {
      const ok = await bookingService.testConnection(currentUserId, clubSlug)
      if (ok) {
        toast.success(t("profilePage.toast.connectionVerified"))
      } else {
        toast.error(t("profilePage.toast.invalidCredentials"))
      }
      await fetchMemberships()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profilePage.toast.connectionTestFailed"))
    } finally {
      setTestingClub(null)
    }
  }

  async function handleDeleteMembership(clubSlug: string) {
    try {
      await bookingService.deleteMembership(currentUserId, clubSlug)
      toast.success(t("profilePage.toast.connectionRemoved"))
      await fetchMemberships()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("profilePage.toast.removeFailed"))
    }
  }

  function handleEditMembership(m: ClubMembershipDTO) {
    setEditingClub(m.clubSlug)
    setClubForm({ clubSlug: m.clubSlug, socioNumber: m.socioNumber, password: "" })
  }

  if (loading) {
    return (
      <>
        <PageHeader title={t("profile.myProfile")} description="" />
        <div className="flex flex-1 items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  if (!user) {
    return (
      <>
        <PageHeader title={t("profile.myProfile")} description="" />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-12">
          <p className="text-muted-foreground">{t("profilePage.loadError")}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t("common.retry")}
          </Button>
        </div>
      </>
    )
  }

  const displayName = user?.name || form.name || t("profilePage.you")

  return (
    <>
      <PageHeader
        title={t("profile.myProfile")}
        description={t("profilePage.settings.description")}
      />
      <div className="flex flex-1 flex-col gap-6 p-5 lg:p-8">
        {/* Profile header - minimal */}
        <Card className="overflow-hidden">
          <div className="border-b border-border/30 bg-primary/5 px-6 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-bold text-primary">
                {displayName.split(" ").map((n) => n[0]).join("") || "?"}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold tracking-tight text-foreground">
                  {displayName}
                </h2>
                {user?.email && (
                  <p className="truncate mt-0.5 text-sm text-muted-foreground">{user.email}</p>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Personal settings - for scheduling service */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <Settings className="h-5 w-5 text-primary" />
              {t("profilePage.settings.title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("profilePage.settings.description")}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4" />
                  {t("profilePage.settings.displayName")}
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder={t("profilePage.settings.namePlaceholder")}
                  className="max-w-md"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  {t("profilePage.settings.phone")}
                </Label>
                <PhoneInput
                  id="phone"
                  value={form.phone}
                  onChange={(phone) => { setForm((p) => ({ ...p, phone })); setSaveError(null) }}
                  defaultCountryCode="34"
                  className="max-w-md"
                />
                <p className="text-xs text-muted-foreground">
                  {t("profilePage.settings.phoneHint")}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {t("profilePage.settings.email")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {user?.email || "—"}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  {t("profilePage.settings.preferredLanguage")}
                </Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as "en" | "es")}>
                  <SelectTrigger className="max-w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">{t("common.english")}</SelectItem>
                    <SelectItem value="es">{t("common.spanish")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {saveError && (
                <p className="text-sm text-destructive">{saveError}</p>
              )}
              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("profilePage.settings.saveChanges")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Location preferences — for I Want to Play wizard defaults */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <MapPin className="h-5 w-5 text-primary" />
              {t("profilePage.location.title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("profilePage.location.description")}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveLocation} className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="preferredClub">{t("profilePage.location.preferredClub")}</Label>
                <Input
                  id="preferredClub"
                  value={locationForm.preferredClub}
                  onChange={(e) =>
                    setLocationForm((p) => ({ ...p, preferredClub: e.target.value }))
                  }
                  placeholder={t("profilePage.location.clubPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultCity">{t("profilePage.location.defaultCity")}</Label>
                <Input
                  id="defaultCity"
                  value={locationForm.defaultCity}
                  onChange={(e) =>
                    setLocationForm((p) => ({ ...p, defaultCity: e.target.value }))
                  }
                  placeholder={t("profilePage.location.cityPlaceholder")}
                />
              </div>
              <Button type="submit" disabled={savingLocation} className="gap-2">
                {savingLocation ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("profilePage.location.save")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Club Connections */}
        <Card id="club-connections" className={`transition-all duration-700 ${highlightedHash === "#club-connections" ? "ring-2 ring-primary/60 bg-primary/5" : "ring-0 bg-transparent"}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <Building2 className="h-5 w-5 text-primary" />
              {t("profilePage.clubConnections.title")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("profilePage.clubConnections.description")}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {SUPPORTED_CLUBS.map((club) => {
              const membership = memberships.find((m) => m.clubSlug === club.clubSlug)
              const isEditing = editingClub === club.clubSlug

              return (
                <div key={club.clubSlug} className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
                  {/* Club header */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground">{club.label}</p>
                      {membership && !isEditing && (
                        <>
                          <p className="mt-0.5 text-sm text-muted-foreground">{t("profilePage.clubConnections.socio", { number: membership.socioNumber })}</p>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            {testingClub === club.clubSlug ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{t("profilePage.clubConnections.testing")}</span>
                              </>
                            ) : membership.status === "active" ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                <span className="text-xs text-green-600 dark:text-green-400">{t("profilePage.clubConnections.verified")}</span>
                              </>
                            ) : membership.status === "invalid_credentials" ? (
                              <>
                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                                <span className="text-xs text-destructive">{t("profilePage.clubConnections.invalidCredentials")}</span>
                              </>
                            ) : (
                              <>
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{t("profilePage.clubConnections.notVerified")}</span>
                              </>
                            )}
                            {membership.lastVerifiedAt && testingClub !== club.clubSlug && (
                              <span className="text-xs text-muted-foreground/60">
                                · {new Date(membership.lastVerifiedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}{" "}
                                {new Date(membership.lastVerifiedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                        </>
                      )}
                      {!membership && !isEditing && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{t("profilePage.clubConnections.notConnected")}</p>
                      )}
                    </div>
                    {membership && !isEditing && (
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={testingClub === club.clubSlug}
                          onClick={() => handleTestConnection(club.clubSlug)}
                        >
                          {testingClub === club.clubSlug ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wifi className="h-3.5 w-3.5" />
                          )}
                          {testingClub === club.clubSlug ? t("profilePage.clubConnections.testing") : t("profilePage.clubConnections.test")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => handleEditMembership(membership)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t("form.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteMembership(club.clubSlug)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    {!membership && !isEditing && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingClub(club.clubSlug)
                          setClubForm({ clubSlug: club.clubSlug, socioNumber: "", password: "" })
                        }}
                      >
                        {t("profilePage.clubConnections.connect")}
                      </Button>
                    )}
                  </div>

                  {/* Inline form — shown when adding or editing */}
                  {isEditing && (
                    <form
                      onSubmit={handleSaveClub}
                      className="space-y-3 border-t border-border/40 pt-4"
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor={`socioNumber-${club.clubSlug}`}>{t("profilePage.clubConnections.socioNumber")}</Label>
                        <Input
                          id={`socioNumber-${club.clubSlug}`}
                          value={clubForm.socioNumber}
                          onChange={(e) => setClubForm((p) => ({ ...p, socioNumber: e.target.value }))}
                          placeholder={t("profilePage.clubConnections.socioPlaceholder")}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`clubPassword-${club.clubSlug}`}>
                          {t("profilePage.clubConnections.password")}{" "}
                          <span className="font-normal text-muted-foreground">{t("profilePage.clubConnections.passwordNote")}</span>
                        </Label>
                        <div className="relative">
                          <Input
                            id={`clubPassword-${club.clubSlug}`}
                            type={showPassword ? "text" : "password"}
                            value={clubForm.password}
                            onChange={(e) => setClubForm((p) => ({ ...p, password: e.target.value }))}
                            placeholder={membership ? t("profilePage.clubConnections.passwordKeepBlank") : t("profilePage.clubConnections.passwordPlaceholder")}
                            className="pr-10"
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            onClick={() => setShowPassword((v) => !v)}
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("profilePage.clubConnections.securityNote")}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" disabled={savingClub} className="gap-2">
                          {savingClub ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {membership ? t("profilePage.clubConnections.update") : t("profilePage.clubConnections.saveConnection")}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setEditingClub(null)
                            setClubForm({ clubSlug: SUPPORTED_CLUBS[0].clubSlug, socioNumber: "", password: "" })
                          }}
                        >
                          {t("form.cancel")}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>


        {/* ── Player Analytics ── */}
        {player && (
          <>
            {/* Stat tiles */}
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
              <Card>
                <CardContent className="pt-5 pb-4 text-center">
                  <p className="text-2xl font-bold">{stats?.totalMatches ?? "—"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Matches played</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4 text-center">
                  <p className="text-2xl font-bold">
                    {stats ? `${Math.round(stats.winRate * 100)}%` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Win rate</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4 text-center">
                  <p className="text-2xl font-bold">
                    {stats ? `${stats.wins}W · ${stats.losses}L` : "—"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Competitive W/L</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 pb-4 text-center flex flex-col items-center justify-center gap-1">
                  {stats && stats.currentStreak > 0 ? (
                    <>
                      <div className="flex items-center gap-1">
                        {stats.streakType === "win" ? (
                          <TrendingUp className="h-5 w-5 text-green-500" />
                        ) : stats.streakType === "loss" ? (
                          <TrendingDown className="h-5 w-5 text-red-500" />
                        ) : (
                          <Minus className="h-5 w-5 text-muted-foreground" />
                        )}
                        <span className="text-2xl font-bold">{stats.currentStreak}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {stats.streakType === "win" ? "Win streak" : "Loss streak"}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold">—</p>
                      <p className="text-xs text-muted-foreground">Streak</p>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Rating trend chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold tracking-tight">Rating history</CardTitle>
              </CardHeader>
              <CardContent>
                {stats && stats.ratingHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={stats.ratingHistory} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d) => format(parseISO(d), "MMM d")}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={40}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        formatter={(value: number, _name: string, props: any) => {
                          const delta = props?.payload?.delta
                          const sign = delta >= 0 ? "+" : ""
                          return [`${value.toFixed(2)} (${sign}${delta?.toFixed(2)})`, "Rating"]
                        }}
                        labelFormatter={(d) => format(parseISO(d as string), "PPP")}
                      />
                      <ReferenceLine
                        y={stats.ratingHistory[0]?.rating}
                        stroke="hsl(var(--border))"
                        strokeDasharray="4 4"
                      />
                      <Line
                        type="monotone"
                        dataKey="rating"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No rating history yet — complete a competitive match to start tracking.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Avg opponent level */}
            {stats && stats.averageOpponentLevel !== null && (
              <Card>
                <CardContent className="pt-5 pb-4 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Average opponent level</span>
                  <span className="font-semibold">{stats.averageOpponentLevel.toFixed(2)}</span>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  )
}
