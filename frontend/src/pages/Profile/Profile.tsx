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

  useEffect(() => {
    let cancelled = false
    usersService
      .getById(currentUserId)
      .then((u) => {
        if (!cancelled) {
          setUser(u)
          setForm({
            name: u.name ?? "",
            phone: u.phone ?? "",
          })
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
    let cancelled = false
    playersService
      .getByUser(currentUserId)
      .then((p) => {
        if (!cancelled) {
          setPlayer(p)
          setLocationForm({
            preferredClub: (p as { preferredClub?: string }).preferredClub ?? "",
            defaultCity: (p as { defaultCity?: string }).defaultCity ?? "",
          })
        }
      })
      .catch(() => {
        if (!cancelled) setPlayer(null)
      })
    return () => { cancelled = true }
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save"
      toast.error(msg)
    } finally {
      setSavingLocation(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    let phoneToSave: string | undefined = form.phone || undefined
    if (phoneToSave) {
      const normalized = phoneToSave.trim().startsWith("+") ? phoneToSave : toE164(phoneToSave, "34")
      const validation = validatePhoneE164(normalized)
      if (!validation.valid) {
        toast.error(validation.error)
        return
      }
      phoneToSave = normalized
    }
    setSaving(true)
    try {
      const updated = await usersService.update(currentUserId, {
        name: form.name || undefined,
        phone: phoneToSave,
      })
      setUser(updated)
      toast.success(t("success.saved"))
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save"
      toast.error(msg)
    } finally {
      setSaving(false)
    }
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
