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
import { getCurrentUserId } from "@/lib/current-user"
import { usersService, type User } from "@/lib/services/users.service"
import { playersService } from "@/lib/services/players.service"
import { bookingService, SUPPORTED_CLUBS, type ClubMembershipDTO } from "@/lib/services/booking.service"
import { toast } from "sonner"

export default function ProfilePage() {
  const currentUserId = getCurrentUserId()
  const { language, setLanguage } = useLanguage()
  const { t } = useTranslation()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
          displayName: user?.name ?? "Player",
          preferredClub,
          defaultCity,
        })
        setPlayer(created)
      }
      toast.success(t("success.saved"))
      await refetchProfile()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save"
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
    try {
      await usersService.update(currentUserId, {
        name: form.name || undefined,
        phone: phoneToSave,
      })
      toast.success(t("success.saved"))
      await refetchProfile()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save"
      toast.error(msg)
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
      toast.success("Club connection saved")
      setClubForm((p) => ({ ...p, socioNumber: "", password: "" }))
      setEditingClub(null)
      await fetchMemberships()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save club connection")
    } finally {
      setSavingClub(false)
    }
  }

  async function handleTestConnection(clubSlug: string) {
    setTestingClub(clubSlug)
    try {
      const ok = await bookingService.testConnection(currentUserId, clubSlug)
      if (ok) {
        toast.success("Connection verified successfully")
      } else {
        toast.error("Invalid credentials — check your socio number and password")
      }
      await fetchMemberships()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connection test failed")
    } finally {
      setTestingClub(null)
    }
  }

  async function handleDeleteMembership(clubSlug: string) {
    try {
      await bookingService.deleteMembership(currentUserId, clubSlug)
      toast.success("Club connection removed")
      await fetchMemberships()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove connection")
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
          <p className="text-muted-foreground">Could not load your profile.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </>
    )
  }

  const displayName = user?.name || form.name || "You"

  return (
    <>
      <PageHeader
        title={t("profile.myProfile")}
        description="Your personal settings and preferences for scheduling"
      />
      <div className="flex flex-1 flex-col gap-6 p-5 lg:p-8">
        {/* Profile header - minimal */}
        <Card className="overflow-hidden">
          <div className="border-b border-border/30 bg-primary/5 px-6 py-6">
            <div className="flex items-center gap-6">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-2xl font-bold text-primary">
                {displayName.split(" ").map((n) => n[0]).join("") || "?"}
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {displayName}
                </h2>
                {user?.email && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{user.email}</p>
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
              Personal Settings
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              These details are used for scheduling, WhatsApp invites, and reminders.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <UserIcon className="h-4 w-4" />
                  Display name
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Your name"
                  className="max-w-md"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone number
                </Label>
                <PhoneInput
                  id="phone"
                  value={form.phone}
                  onChange={(phone) => setForm((p) => ({ ...p, phone }))}
                  defaultCountryCode="34"
                  className="max-w-md"
                />
                <p className="text-xs text-muted-foreground">
                  Required for WhatsApp invites and match reminders. Include country code (e.g. +34).
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </Label>
                <p className="text-sm text-muted-foreground">
                  {user?.email || "—"}
                </p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Preferred language
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

              <Button type="submit" disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Location preferences — for I Want to Play wizard defaults */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <MapPin className="h-5 w-5 text-primary" />
              Location preferences
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Default location for &quot;I Want to Play&quot; — your preferred club and city.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveLocation} className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="preferredClub">Preferred club / court</Label>
                <Input
                  id="preferredClub"
                  value={locationForm.preferredClub}
                  onChange={(e) =>
                    setLocationForm((p) => ({ ...p, preferredClub: e.target.value }))
                  }
                  placeholder="e.g. Club Tennis Barcelona"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultCity">Default city</Label>
                <Input
                  id="defaultCity"
                  value={locationForm.defaultCity}
                  onChange={(e) =>
                    setLocationForm((p) => ({ ...p, defaultCity: e.target.value }))
                  }
                  placeholder="e.g. Barcelona"
                />
              </div>
              <Button type="submit" disabled={savingLocation} className="gap-2">
                {savingLocation ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save location
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Club Connections */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <Building2 className="h-5 w-5 text-primary" />
              Club Connections
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Connect your club membership to enable automatic court booking when matches are confirmed.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Existing memberships */}
            {memberships.length > 0 && (
              <div className="space-y-3">
                {memberships.map((m) => {
                  const club = SUPPORTED_CLUBS.find((c) => c.clubSlug === m.clubSlug)
                  return (
                    <div key={m.clubSlug} className="rounded-xl border border-border/60 bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-foreground">{club?.label ?? m.clubSlug}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">Socio #{m.socioNumber}</p>
                          <div className="mt-1.5 flex items-center gap-1.5">
                            {m.status === "active" ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                <span className="text-xs text-green-600 dark:text-green-400">Verified</span>
                              </>
                            ) : m.status === "invalid_credentials" ? (
                              <>
                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                                <span className="text-xs text-destructive">Invalid credentials</span>
                              </>
                            ) : (
                              <>
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">Not verified</span>
                              </>
                            )}
                            {m.lastVerifiedAt && (
                              <span className="text-xs text-muted-foreground/60">
                                · {new Date(m.lastVerifiedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5"
                            disabled={testingClub === m.clubSlug}
                            onClick={() => handleTestConnection(m.clubSlug)}
                          >
                            {testingClub === m.clubSlug ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Wifi className="h-3.5 w-3.5" />
                            )}
                            Test
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditMembership(m)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteMembership(m.clubSlug)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add / Edit form */}
            {(memberships.length === 0 || editingClub !== null) && (
              <form onSubmit={handleSaveClub} className="space-y-4 max-w-md">
                {editingClub !== null && (
                  <p className="text-sm font-medium text-muted-foreground">
                    Editing connection
                  </p>
                )}
                <div className="space-y-2">
                  <Label htmlFor="clubSlug">Club</Label>
                  <Select
                    value={clubForm.clubSlug}
                    onValueChange={(v) => setClubForm((p) => ({ ...p, clubSlug: v }))}
                    disabled={editingClub !== null}
                  >
                    <SelectTrigger id="clubSlug">
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
                <div className="space-y-2">
                  <Label htmlFor="socioNumber">Socio number</Label>
                  <Input
                    id="socioNumber"
                    value={clubForm.socioNumber}
                    onChange={(e) => setClubForm((p) => ({ ...p, socioNumber: e.target.value }))}
                    placeholder="e.g. 12345"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clubPassword">
                    Password{" "}
                    <span className="font-normal text-muted-foreground">(required for automatic booking)</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="clubPassword"
                      type={showPassword ? "text" : "password"}
                      value={clubForm.password}
                      onChange={(e) => setClubForm((p) => ({ ...p, password: e.target.value }))}
                      placeholder={editingClub ? "Leave blank to keep existing" : "Your club portal password"}
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
                    Stored encrypted. Only used to log in to the club portal on your behalf.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={savingClub} className="gap-2">
                    {savingClub ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {editingClub ? "Update connection" : "Save connection"}
                  </Button>
                  {editingClub && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditingClub(null)
                        setClubForm({ clubSlug: SUPPORTED_CLUBS[0].clubSlug, socioNumber: "", password: "" })
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            )}

            {/* Add new button when memberships exist and not editing */}
            {memberships.length > 0 && editingClub === null && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setEditingClub("")}
              >
                + Add another club
              </Button>
            )}
          </CardContent>
        </Card>

        {/* ==== COMMENTED OUT FOR V1 - Personal progress, stats, rivals, insights, level history, match history ==== */}
        {/*
        <Card>
          <CardHeader>
            <CardTitle>Personal Progress</CardTitle>
          </CardHeader>
          <CardContent>...</CardContent>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>Stats...</Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Top Rivals</CardTitle>
          </CardHeader>
          <CardContent>...</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Performance Insights</CardTitle>
          </CardHeader>
          <CardContent>...</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Level History</CardTitle>
          </CardHeader>
          <CardContent>...</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Match History</CardTitle>
          </CardHeader>
          <CardContent>...</CardContent>
        </Card>
        */}
      </div>
    </>
  )
}
