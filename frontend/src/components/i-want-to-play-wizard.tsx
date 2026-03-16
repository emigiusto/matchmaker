import { useState, useCallback, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { format, startOfDay, isBefore } from "date-fns"
import { es as esLocale } from "date-fns/locale"
import {
  Calendar as CalendarIcon,
  MapPin,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  GripVertical,
  X,
  Zap,
  Clock,
  Users,
  CircleDot,
  Swords,
  Target,
  Building2,
  Copy,
  Check,
  Loader2,
  UserPlus,
  List,
  UserCircle,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PhoneInput } from "@/components/phone-input"
import { SportFormatBadge } from "@/components/sport-format-badge"
import { toast } from "sonner"
import { validatePhoneE164 } from "@/lib/phone.utils"
import { cn } from "@/lib/utils"
import { schedulingService } from "@/lib/services/scheduling.service"
import { usersService } from "@/lib/services/users.service"
import { playersService } from "@/lib/services/players.service"
import { groupsService } from "@/lib/services/groups.service"
import { friendshipsService } from "@/lib/services/friendships.service"
import { guestContactsService } from "@/lib/services/guest-contacts.service"
import { bookingService, SUPPORTED_CLUBS, type ClubMembershipDTO } from "@/lib/services/booking.service"
import { getCurrentUserId } from "@/lib/current-user"
import { useTranslation } from "@/lib/i18n"

interface WizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hostUserId?: string
  onSuccess?: () => void
}

type Step = 1 | 2 | 3 | 4

// Generate time slots at :00 only (06:00 – 22:00)
const TIME_SLOTS: string[] = []
for (let h = 6; h <= 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`)
}

function addOneHour(time: string): string {
  if (!time) return ""
  const [h] = time.split(":").map(Number)
  const newH = Math.min(h + 1, 22)
  return `${String(newH).padStart(2, "0")}:00`
}

type LocationType = "place" | "city"

interface Contact {
  id: string
  name: string
}

/** User or GuestContact for the "All contacts" picker */
type AvailableContact =
  | { id: string; name: string; type: "user" }
  | { id: string; name: string; type: "guestContact"; phone: string; socioNumber?: string }

function SortableContactItem({
  contact,
  index,
  onRemove,
  dragLabel = "Drag to reorder",
}: {
  contact: Contact
  index: number
  onRemove: (id: string) => void
  dragLabel?: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: contact.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-colors",
        isDragging ? "border-primary bg-primary/5 shadow-md opacity-80" : "border-border/40 hover:border-primary/30"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        aria-label={dragLabel}
      >
        <GripVertical className="h-4 w-4 shrink-0" />
      </button>
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
        {index + 1}
      </div>
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {contact.name[0]}
      </div>
      <span className="flex-1 text-sm font-medium">{contact.name}</span>
      <button
        onClick={() => onRemove(contact.id)}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function IWantToPlayWizard({ open, onOpenChange, hostUserId: hostUserIdProp, onSuccess }: WizardProps) {
  const hostUserId = hostUserIdProp ?? getCurrentUserId()
  const navigate = useNavigate()
  const { t, language } = useTranslation()
  const dateLocale = language === "es" ? esLocale : undefined
  const [step, setStep] = useState<Step>(1)
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [locationType, setLocationType] = useState<LocationType>("place")
  const [specificPlace, setSpecificPlace] = useState("")
  const [cityValue, setCityValue] = useState("")
  
  // Step 2: Match type + format + sport (v1: always practice; competitive/practice hidden)
  const [matchType, setMatchType] = useState<"competitive" | "practice">("practice")
  const [matchFormat, setMatchFormat] = useState<"singles" | "doubles">("singles")
  const [sport, setSport] = useState<"tennis" | "padel">("tennis")
  
  // Step 3: Contact priority list
  const [priorityList, setPriorityList] = useState<Contact[]>([])
  // 10 sec default for local testing; 60 min for production
  const defaultResponseWindow = typeof import.meta !== "undefined" && import.meta.env?.DEV
    ? 10 / 60 // 10 seconds
    : 60
  const [responseWindow, setResponseWindow] = useState<number>(defaultResponseWindow) // minutes (can be fractional)
  const [maxParallelCandidates, setMaxParallelCandidates] = useState(1) // 1–3 contacts reached out at once
  const [availableContacts, setAvailableContacts] = useState<AvailableContact[]>([])
  const [groupsWithMembers, setGroupsWithMembers] = useState<import("@/lib/services/groups.service").GroupWithMembersDTO[]>([])
  const [friends, setFriends] = useState<import("@/lib/services/friendships.service").Friend[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [bookingEnabled, setBookingEnabled] = useState(false)
  const [clubMemberships, setClubMemberships] = useState<ClubMembershipDTO[]>([])
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null)
  // Maps userId → { gcId, socioNumber } for guest contacts in the priority list
  const [gcMeta, setGcMeta] = useState<Record<string, { gcId: string; socioNumber: string }>>({})
  const [socioEdits, setSocioEdits] = useState<Record<string, string>>({})
  const [savingSocio, setSavingSocio] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [manualName, setManualName] = useState("")
  const [manualPhone, setManualPhone] = useState("")
  const [manualSocio, setManualSocio] = useState("")
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [searchFromList, setSearchFromList] = useState("")
  const [searchFriends, setSearchFriends] = useState("")
  const [searchAllContacts, setSearchAllContacts] = useState("")

  function resetWizard() {
    setStep(1)
    setDate(undefined)
    setStartTime("")
    setEndTime("")
    setLocationType("place")
    setSpecificPlace("")
    setCityValue("")
    setMatchType("practice")
    setMatchFormat("singles")
    setSport("tennis")
    setResponseWindow(defaultResponseWindow)
    setMaxParallelCandidates(1)
    setPriorityList([])
    setBookingEnabled(false)
    setSelectedMembershipId(null)
    setShowManualAdd(false)
  }

  // Fetch player preferences (preferredClub, defaultCity) for location defaults
  useEffect(() => {
    if (!open || !hostUserId) return
    playersService.getByUser(hostUserId).catch(() => null).then((player) => {
      if (player && typeof player === "object") {
        const p = player as { preferredClub?: string; defaultCity?: string }
        setSpecificPlace((prev) => prev || (p.preferredClub ?? ""))
        setCityValue((prev) => prev || (p.defaultCity ?? ""))
      }
    })
  }, [open, hostUserId])

  // Fetch club memberships to determine if booking is available
  useEffect(() => {
    if (!open || !hostUserId) return
    bookingService.listMemberships(hostUserId).then((memberships) => {
      setClubMemberships(memberships)
      if (memberships.length > 0) setSelectedMembershipId(memberships[0].id)
    }).catch(() => setClubMemberships([]))
  }, [open, hostUserId])

  // Fetch contacts for step 3: users, groups, friends, guest contacts
  useEffect(() => {
    if (!open || !hostUserId) return
    setContactsLoading(true)
    Promise.all([
      usersService.getAll(),
      groupsService.listWithMembers(hostUserId).catch(() => []),
      friendshipsService.listFriends(hostUserId).catch(() => []),
      guestContactsService.listByOwner(hostUserId).catch(() => []),
    ])
      .then(([users, groups, friendsList, guestContacts]) => {
        const withPhone = users.filter(
          (u) => u.phone && u.id !== hostUserId && (u.name || u.email || u.id)
        )
        const userPhones = new Set(withPhone.map((u) => u.phone).filter(Boolean))
        const userContacts: AvailableContact[] = withPhone.map((u) => ({
          id: u.id,
          name: u.name || u.email || "Unknown",
          type: "user" as const,
        }))
        const gcContacts: AvailableContact[] = guestContacts
          .filter((c) => !userPhones.has(c.phone))
          .map((c) => ({
            id: c.id,
            name: c.name,
            type: "guestContact" as const,
            phone: c.phone,
            socioNumber: c.socioNumber,
          }))
        setAvailableContacts([...userContacts, ...gcContacts])
        setGroupsWithMembers(groups)
        setFriends(friendsList)

        // Pre-populate gcMeta for guest contacts that already have a registered user account.
        // These appear as type "user" in the picker (phone matched), so addAvailableContact
        // won't populate gcMeta for them. Cross-reference by phone number here.
        const phoneToUserId = new Map(withPhone.map((u) => [u.phone, u.id]))
        const preloaded: Record<string, { gcId: string; socioNumber: string }> = {}
        const preloadedEdits: Record<string, string> = {}
        for (const gc of guestContacts) {
          const userId = phoneToUserId.get(gc.phone)
          if (userId) {
            preloaded[userId] = { gcId: gc.id, socioNumber: gc.socioNumber ?? "" }
            preloadedEdits[userId] = gc.socioNumber ?? ""
          }
        }
        if (Object.keys(preloaded).length > 0) {
          setGcMeta((prev) => ({ ...prev, ...preloaded }))
          setSocioEdits((prev) => ({ ...prev, ...preloadedEdits }))
        }
      })
      .catch(() => {
        setAvailableContacts([])
        setGroupsWithMembers([])
        setFriends([])
        toast.error(t("wizard.toast.loadContactsFailed"))
      })
      .finally(() => setContactsLoading(false))
  }, [open, hostUserId])

  function handleClose(val: boolean) {
    if (!val) resetWizard()
    onOpenChange(val)
  }

  function handleStartTimeChange(val: string) {
    setStartTime(val)
    setEndTime(addOneHour(val))
  }

  const canProceedStep1 = date && startTime
  const spotsNeeded = matchFormat === "doubles" ? 3 : 1 // doubles: host+partner+3 others; singles: host+1
  const canProceedStep3 = priorityList.length >= spotsNeeded
  const displayTime = startTime && endTime ? `${startTime} - ${endTime}` : ""
  const locationText = locationType === "place" ? specificPlace : cityValue
  const displayLocation = locationText.trim() || t("wizard.toBeDecided")


  function addContact(contact: Contact) {
    if (priorityList.some((c) => c.id === contact.id)) return
    setPriorityList((prev) => [...prev, contact])
  }

  async function addAvailableContact(ac: AvailableContact) {
    if (ac.type === "user") {
      addContact({ id: ac.id, name: ac.name })
      return
    }
    try {
      const { user } = await guestContactsService.ensureUserByPhone(ac.phone, ac.name)
      addContact({ id: user.id, name: user.name || ac.name })
      setGcMeta((prev) => ({ ...prev, [user.id]: { gcId: ac.id, socioNumber: ac.socioNumber ?? "" } }))
      setSocioEdits((prev) => ({ ...prev, [user.id]: ac.socioNumber ?? "" }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("wizard.toast.contactFailed"))
    }
  }

  function addGroupMembers(group: import("@/lib/services/groups.service").GroupWithMembersDTO) {
    const toAdd = group.members.filter(
      (m) => m.id !== hostUserId && m.phone && !priorityList.some((c) => c.id === m.id)
    )
    if (toAdd.length === 0) {
      toast.info(t("wizard.toast.allMembersAdded"))
      return
    }
    setPriorityList((prev) => [
      ...prev,
      ...toAdd.map((m) => ({ id: m.id, name: m.name })),
    ])
    toast.success(`Added ${toAdd.length} from ${group.name}`)
  }

  async function handleSaveSocio(userId: string) {
    const meta = gcMeta[userId]
    if (!meta) return
    const value = (socioEdits[userId] ?? "").trim()
    setSavingSocio(userId)
    try {
      await guestContactsService.updateSocioNumber(meta.gcId, hostUserId, value)
      setGcMeta((prev) => ({ ...prev, [userId]: { ...prev[userId], socioNumber: value } }))
      toast.success(t("wizard.toast.socioSaved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("wizard.toast.saveFailed"))
    } finally {
      setSavingSocio(null)
    }
  }

  function addFriend(friend: import("@/lib/services/friendships.service").Friend) {
    if (friend.id === hostUserId) return
    addContact({ id: friend.id, name: friend.name })
  }

  async function handleAddManualContact() {
    const name = manualName.trim()
    const phone = manualPhone.trim()
    if (!name || !phone) {
      toast.error(t("wizard.toast.enterNamePhone"))
      return
    }
    const phoneValidation = validatePhoneE164(phone)
    if (!phoneValidation.valid) {
      toast.error(phoneValidation.error)
      return
    }
    try {
      const socio = manualSocio.trim()
      const { guestContact, user } = await guestContactsService.create(hostUserId, name, phone, socio || undefined)
      setManualName("")
      setManualPhone("")
      setManualSocio("")
      addContact({ id: user.id, name: user.name || name })
      setGcMeta((prev) => ({ ...prev, [user.id]: { gcId: guestContact.id, socioNumber: socio } }))
      setSocioEdits((prev) => ({ ...prev, [user.id]: socio }))
      toast.success(t("wizard.toast.contactSaved"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("wizard.toast.contactFailed"))
    }
  }

  // Remove contact from priority list
  function removeContact(id: string) {
    setPriorityList(prev => prev.filter(c => c.id !== id))
  }

  // Drag and drop sensors (mouse + touch)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setPriorityList(prev => {
        const oldIndex = prev.findIndex(c => c.id === active.id)
        const newIndex = prev.findIndex(c => c.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }, [])

  const [linkCopied, setLinkCopied] = useState(false)

  function handleCopyInviteLink() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/invite/tok-${Date.now()}` : ""
    navigator.clipboard.writeText(url)
    setLinkCopied(true)
    toast.success(t("wizard.toast.linkCopied"))
    setTimeout(() => setLinkCopied(false), 2000)
  }

  async function handleStartScheduling() {
    if (!date || !startTime || !endTime || !hostUserId || priorityList.length === 0) return
    setSubmitting(true)
    try {
      const dateStr = format(date, "yyyy-MM-dd")
      const [startH, startM] = startTime.split(":").map(Number)
      const [endH, endM] = endTime.split(":").map(Number)
      const startDateTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startH, startM)
      const endDateTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), endH, endM)
      const req = await schedulingService.create({
        hostUserId,
        sportType: sport,
        format: matchFormat,
        matchType,
        date: dateStr,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        locationText: (locationType === "place" ? specificPlace : cityValue).trim(),
        radiusKm: null,
        responseWindowMinutes: responseWindow,
        maxParallelCandidates,
        hostPartnerUserId: null,
        candidateUserIds: priorityList.map((c) => c.id),
        bookingEnabled,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      await schedulingService.start(req.id)
      toast.success(t("wizard.toast.schedulingStarted"), {
        description: `First contacting ${priorityList[0]?.name}...`
      })
      onSuccess?.()
      handleClose(false)
      navigate(`/play/${req.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("wizard.toast.schedulingFailed"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">
            {step === 1 && t("wizard.steps.whenWhere")}
            {step === 2 && t("wizard.steps.formatSport")}
            {step === 3 && t("wizard.steps.whoToInvite")}
            {step === 4 && t("wizard.steps.startScheduling")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {step === 1 && t("wizard.stepDesc.whenWhere")}
            {step === 2 && t("wizard.stepDesc.formatSport")}
            {step === 3 && t("wizard.stepDesc.whoToInvite")}
            {step === 4 && t("wizard.stepDesc.startScheduling")}
          </DialogDescription>
          {/* Step indicator */}
          <div className="flex items-center gap-2 pt-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  s <= step ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
        </DialogHeader>

        {/* Step 1: When & Where */}
        {step === 1 && (
          <div className="space-y-5 pt-2">
            {/* Date */}
            <div className="space-y-2">
              <Label className="text-base font-medium">{t("wizard.date")}</Label>
              <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left text-base",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-5 w-5" />
                    {date ? format(date, "EEEE, MMMM d, yyyy", { locale: dateLocale }) : t("wizard.pickDate")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => { setDate(d); setDatePickerOpen(false); }}
                    disabled={(d) => isBefore(startOfDay(d), startOfDay(new Date()))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time */}
            <div className="space-y-2">
              <Label className="text-base font-medium">{t("wizard.time")}</Label>
              <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-muted/30 p-1">
                <div className="flex flex-1 flex-col items-center rounded-lg bg-background px-3 py-1.5 shadow-sm">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("wizard.timeStart")}</span>
                  <Select value={startTime} onValueChange={handleStartTimeChange}>
                    <SelectTrigger className="h-auto w-full justify-center border-0 bg-transparent p-0 text-sm font-semibold shadow-none focus:ring-0 [&>svg]:hidden">
                      <SelectValue placeholder="--:--" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="flex flex-1 flex-col items-center rounded-lg bg-background px-3 py-1.5 shadow-sm opacity-60">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("wizard.timeEnd")}</span>
                  <span className="text-sm font-semibold">{endTime || "--:--"}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t("wizard.durationFixed")}</p>
            </div>

            {/* Location — optional: Place (court/club) or City, defaults to user's preferred club */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">
                  {t("wizard.location")} <span className="text-muted-foreground font-normal">{t("wizard.locationOptional")}</span>
                </Label>
                <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setLocationType("place")}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition-all",
                      locationType === "place"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t("wizard.locationPlace")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationType("city")}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition-all",
                      locationType === "city"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t("wizard.locationCity")}
                  </button>
                </div>
              </div>

              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                {locationType === "place" ? (
                  <Input
                    value={specificPlace}
                    onChange={(e) => setSpecificPlace(e.target.value)}
                    placeholder={t("wizard.courtPlaceholder")}
                    className="pl-11 text-base"
                  />
                ) : (
                  <Input
                    value={cityValue}
                    onChange={(e) => setCityValue(e.target.value)}
                    placeholder={t("wizard.cityPlaceholder")}
                    className="pl-11 text-base"
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("wizard.locationHint")}</p>
            </div>

            {/* Court booking */}
            {clubMemberships.length > 0 ? (
              <div className="rounded-xl border border-border/40 bg-card px-4 py-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{t("wizard.autoBook")}</p>
                    <p className="text-xs text-muted-foreground">{t("wizard.autoBookHint")}</p>
                  </div>
                  <Switch
                    checked={bookingEnabled}
                    onCheckedChange={setBookingEnabled}
                    aria-label={t("wizard.autoBook")}
                  />
                </div>
                {bookingEnabled && clubMemberships.length > 1 && (
                  <div className="space-y-1.5 border-t border-border/40 pt-3">
                    <p className="text-xs font-medium text-muted-foreground">{t("wizard.clubConnection")}</p>
                    <div className="space-y-2">
                      {clubMemberships.map((m) => {
                        const clubLabel = SUPPORTED_CLUBS.find((c) => c.clubSlug === m.clubSlug)?.label ?? m.clubSlug
                        const isSelected = selectedMembershipId === m.id
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setSelectedMembershipId(m.id)}
                            className={cn(
                              "w-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all",
                              isSelected
                                ? "border-primary bg-primary/5"
                                : "border-border/50 hover:border-primary/30"
                            )}
                          >
                            <Building2 className={cn("h-5 w-5 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-sm font-medium leading-tight", isSelected ? "text-primary" : "text-foreground")}>
                                {clubLabel}
                              </p>
                              <p className="text-xs text-muted-foreground">Socio {m.socioNumber}</p>
                            </div>
                            <span className={cn(
                              "shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full",
                              m.status === "active"
                                ? "bg-green-500/10 text-green-600"
                                : m.status === "invalid_credentials"
                                ? "bg-red-500/10 text-red-500"
                                : "bg-muted text-muted-foreground"
                            )}>
                              {m.status === "active" ? t("wizard.membershipActive") : m.status === "invalid_credentials" ? t("wizard.membershipError") : t("wizard.membershipUnverified")}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                {bookingEnabled && clubMemberships.length === 1 && (() => {
                  const m = clubMemberships[0]
                  const clubLabel = SUPPORTED_CLUBS.find((c) => c.clubSlug === m.clubSlug)?.label ?? m.clubSlug
                  return (
                    <div className="flex items-center gap-3 border-t border-border/40 pt-3">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">{clubLabel}</p>
                        <p className="text-xs text-muted-foreground">Socio {m.socioNumber}</p>
                      </div>
                      <span className={cn(
                        "shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full",
                        m.status === "active"
                          ? "bg-green-500/10 text-green-600"
                          : m.status === "invalid_credentials"
                          ? "bg-red-500/10 text-red-500"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {m.status === "active" ? t("wizard.membershipActive") : m.status === "invalid_credentials" ? t("wizard.membershipError") : t("wizard.membershipUnverified")}
                      </span>
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div className="rounded-xl border border-border/40 bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t("wizard.autoBook")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("wizard.autoBookProfileLinkBefore")}{" "}
                      <Link
                        to="/profile"
                        className="underline underline-offset-2 hover:text-foreground"
                        onClick={() => handleClose(false)}
                      >
                        {t("wizard.autoBookProfileLinkText")}
                      </Link>{" "}
                      {t("wizard.autoBookProfileLinkAfter")}
                    </p>
                  </div>
                  <Switch disabled aria-label={t("wizard.autoBook")} />
                </div>
              </div>
            )}

            <Button
              size="xl"
              className="w-full"
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
            >
              {t("wizard.continue")}
              <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
          </div>
        )}

        {/* Step 2: Match Type */}
        {step === 2 && (
          <div className="space-y-5 pt-2">

            {/* Sport first */}
            <div className="space-y-2">
              <Label className="text-base font-medium">{t("wizard.sport")}</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSport("tennis")}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-medium transition-all",
                    sport === "tennis"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border/50 text-foreground hover:border-primary/30"
                  )}
                >
                  {t("sportFormat.tennis")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSport("padel")
                    // Padel is doubles-only — force doubles
                    setMatchFormat("doubles")
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-medium transition-all",
                    sport === "padel"
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border/50 text-foreground hover:border-primary/30"
                  )}
                >
                  {t("sportFormat.padel")}
                </button>
              </div>
              {sport === "padel" && (
                <p className="text-xs text-muted-foreground">{t("wizard.padelAlwaysDoubles")}</p>
              )}
            </div>

            {/* Format: Singles / Doubles — padel locks to doubles */}
            <div className="space-y-2">
              <Label className="text-base font-medium">{t("wizard.format")}</Label>
              <div className="grid grid-cols-2 gap-3">
                {(["singles", "doubles"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    disabled={sport === "padel" && fmt === "singles"}
                    onClick={() => {
                      setMatchFormat(fmt)
                      if (fmt === "singles") setSport("tennis")
                    }}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border-2 py-3 text-sm font-medium transition-all",
                      sport === "padel" && fmt === "singles"
                        ? "cursor-not-allowed border-border/30 text-muted-foreground/40"
                        : matchFormat === fmt
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border/50 text-foreground hover:border-primary/30"
                    )}
                  >
                    <Users className={cn("h-4 w-4", matchFormat === fmt && !(sport === "padel" && fmt === "singles") ? "text-primary" : "text-muted-foreground")} />
                    {fmt === "singles" ? t("wizard.singles") : t("wizard.doubles")}
                  </button>
                ))}
              </div>
              {matchFormat === "doubles" && sport === "tennis" && (
                <p className="text-xs text-muted-foreground">{t("wizard.doublesNote4")}</p>
              )}
            </div>

            {/* Match type: Practice / Competitive */}
            <div className="space-y-2">
              <Label className="text-base font-medium">{t("wizard.mode")}</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMatchType("practice")}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                    matchType === "practice"
                      ? "border-[#22c55e] bg-[#22c55e]/5"
                      : "border-border/50 hover:border-[#22c55e]/30"
                  )}
                >
                  <Target className={cn("h-6 w-6", matchType === "practice" ? "text-[#22c55e]" : "text-muted-foreground")} />
                  <div className="text-center">
                    <p className="text-sm font-semibold">{t("wizard.practice")}</p>
                    <p className="text-xs text-muted-foreground">{t("wizard.practiceDesc")}</p>
                  </div>
                </button>
                <button
                  type="button"
                  disabled
                  className="flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all cursor-not-allowed border-border/30 opacity-40"
                >
                  <Swords className="h-6 w-6 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-semibold">{t("wizard.competitive")}</p>
                    <p className="text-xs text-muted-foreground">{t("wizard.competitiveDesc")}</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setStep(1)}>
                <ChevronLeft className="mr-1 h-5 w-5" />
                {t("form.back")}
              </Button>
              <Button size="lg" className="flex-1" onClick={() => setStep(3)}>
                {t("wizard.continue")}
                <ChevronRight className="ml-1 h-5 w-5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Who to Invite */}
        {step === 3 && (
          <div className="space-y-4 pt-2">

            <div className="space-y-3">
              <Label className="text-base font-medium">{t("wizard.addContactsLabel")}</Label>
              {contactsLoading ? (
                <div className="flex items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {/* Add from lists (groups) */}
                  {groupsWithMembers.length > 0 && (
                    <Popover onOpenChange={(open) => !open && setSearchFromList("")}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <List className="h-4 w-4" />
                          {t("wizard.fromList")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <div className="relative mb-2">
                          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder={t("wizard.searchLists")}
                            value={searchFromList}
                            onChange={(e) => setSearchFromList(e.target.value)}
                            className="h-8 pl-8"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-0.5">
                          {groupsWithMembers
                            .filter((g) => !searchFromList.trim() || g.name.toLowerCase().includes(searchFromList.trim().toLowerCase()))
                            .map((g) => (
                              <button
                                key={g.id}
                                onClick={() => addGroupMembers(g)}
                                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted"
                              >
                                <span>{g.name}</span>
                                <span className="text-xs text-muted-foreground">{g.members.length}</span>
                              </button>
                            ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  {/* Add friends */}
                  {friends.filter((f) => f.type === "user" && !priorityList.some((p) => p.id === f.id)).length > 0 && (
                    <Popover onOpenChange={(open) => !open && setSearchFriends("")}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <UserPlus className="h-4 w-4" />
                          {t("wizard.friends")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <div className="relative mb-2">
                          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder={t("wizard.searchFriends")}
                            value={searchFriends}
                            onChange={(e) => setSearchFriends(e.target.value)}
                            className="h-8 pl-8"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-0.5">
                          {friends
                            .filter((f) => f.type === "user" && !priorityList.some((p) => p.id === f.id))
                            .filter((f) => !searchFriends.trim() || f.name.toLowerCase().includes(searchFriends.trim().toLowerCase()))
                            .map((f) => (
                              <button
                                key={f.id}
                                onClick={() => addFriend(f)}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                              >
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                                  {f.name[0] ?? "?"}
                                </div>
                                <span className="flex-1 text-left">{f.name}</span>
                              </button>
                            ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  {/* Add from all users */}
                  <Popover onOpenChange={(open) => !open && setSearchAllContacts("")}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-1.5" disabled={availableContacts.length === 0}>
                        <UserCircle className="h-4 w-4" />
                        {t("wizard.allContacts")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2" align="start">
                      <div className="relative mb-2">
                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          placeholder={t("wizard.searchContacts")}
                          value={searchAllContacts}
                          onChange={(e) => setSearchAllContacts(e.target.value)}
                          className="h-8 pl-8"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-0.5">
                      {availableContacts
                        .filter((ac) => ac.type === "user" ? !priorityList.some((p) => p.id === ac.id) : true)
                        .filter((ac) => !searchAllContacts.trim() || ac.name.toLowerCase().includes(searchAllContacts.trim().toLowerCase()))
                        .map((ac) => (
                          <button
                            key={ac.type === "user" ? ac.id : `gc-${ac.id}`}
                            onClick={() => addAvailableContact(ac)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                          >
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                              {ac.name[0] ?? "?"}
                            </div>
                            {ac.name}
                          </button>
                        ))}
                      </div>
                      {availableContacts.filter((ac) => ac.type === "user" ? !priorityList.some((p) => p.id === ac.id) : true).filter((ac) => !searchAllContacts.trim() || ac.name.toLowerCase().includes(searchAllContacts.trim().toLowerCase())).length === 0 && (
                        <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                          {availableContacts.filter((ac) => ac.type === "user" ? !priorityList.some((p) => p.id === ac.id) : true).length === 0 ? t("wizard.allAdded") : t("wizard.noMatches")}
                        </p>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>

            {/* Manual add: name + phone (saves as GuestContact) */}
            {showManualAdd ? (
              <div className="space-y-2 rounded-xl border border-dashed border-border/60 bg-muted/10 px-3 py-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{t("wizard.addManuallyLabel")}</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto gap-1 py-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowManualAdd(false)}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    {t("wizard.hide")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("wizard.addManuallyHint")}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(120px,1fr)_minmax(200px,2fr)_90px_auto] sm:items-end">
                  <Input
                    placeholder={t("wizard.namePlaceholder")}
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    className="w-full"
                  />
                  <div className="min-w-0">
                    <PhoneInput
                      value={manualPhone}
                      onChange={setManualPhone}
                      defaultCountryCode="34"
                    />
                  </div>
                  <Input
                    placeholder={t("wizard.socioPlaceholder")}
                    value={manualSocio}
                    onChange={(e) => setManualSocio(e.target.value)}
                    className="w-full"
                  />
                  <Button variant="secondary" size="sm" className="shrink-0 sm:self-end" onClick={handleAddManualContact} disabled={!manualName.trim() || !manualPhone.trim()}>
                    {t("wizard.addButton")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center gap-2 border-dashed py-5 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                onClick={() => setShowManualAdd(true)}
              >
                <UserPlus className="h-4 w-4" />
                {t("wizard.addManualContactsButton")}
              </Button>
            )}

            {/* Priority list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">
                  {t("wizard.priorityOrder")}
                  {priorityList.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {priorityList.length}
                    </span>
                  )}
                </Label>
                {priorityList.length > 0 && (
                  <span className="text-xs text-muted-foreground">{t("wizard.dragToReorder")}</span>
                )}
              </div>

              {priorityList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center">
                  <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">{t("wizard.noContactsYet")}</p>
                  <p className="text-xs text-muted-foreground/70">
                    {matchFormat === "doubles"
                      ? t("wizard.doublesMinContacts")
                      : t("wizard.addFromList")}
                  </p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={priorityList.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                      {priorityList.map((contact, index) => (
                        <SortableContactItem
                          key={contact.id}
                          contact={contact}
                          index={index}
                          onRemove={removeContact}
                          dragLabel={t("wizard.dragToReorder")}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            {/* Socio numbers — shown for all contacts when booking is enabled */}
            {priorityList.length > 0 && (
              <div className="space-y-2">
                <Label className="text-base font-medium">{t("wizard.socioNumbers")}</Label>
                <p className="text-xs text-muted-foreground">{t("wizard.socioNumbersHint")}</p>
                <div className="space-y-2">
                  {priorityList.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {c.name[0]}
                      </div>
                      <span className="min-w-0 flex-1 text-sm font-medium truncate">{c.name}</span>
                      <Input
                        className="h-8 w-28 text-sm"
                        placeholder={t("wizard.socioPlaceholder")}
                        value={socioEdits[c.id] ?? gcMeta[c.id]?.socioNumber ?? ""}
                        onChange={(e) => setSocioEdits((p) => ({ ...p, [c.id]: e.target.value }))}
                        onBlur={() => { if (gcMeta[c.id]) handleSaveSocio(c.id) }}
                        onKeyDown={(e) => { if (e.key === "Enter" && gcMeta[c.id]) handleSaveSocio(c.id) }}
                      />
                      {savingSocio === c.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Response window */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">{t("wizard.responseWindowLabel")}</Label>
                <span className="text-sm font-semibold text-primary">
                  {responseWindow < 1
                    ? t("wizard.responseWindowSec", { n: Math.round(responseWindow * 60) })
                    : responseWindow < 60
                    ? t("wizard.responseWindowMinutes", { n: responseWindow })
                    : responseWindow === 60
                    ? t("wizard.responseWindowOneHour")
                    : t("wizard.responseWindowHours", { n: responseWindow / 60 })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t("wizard.responseWindowHint")}</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  ...(typeof import.meta !== "undefined" && import.meta.env?.DEV
                    ? [{ value: 10 / 60, label: "10s" }]
                    : []),
                  { value: 15, label: "15m" },
                  { value: 30, label: "30m" },
                  { value: 60, label: "1h" },
                  { value: 120, label: "2h" },
                  { value: 240, label: "4h" },
                  { value: 720, label: "12h" },
                  { value: 1440, label: "24h" },
                  { value: 4320, label: "72h" },
                ].map(({ value, label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setResponseWindow(value)}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-xs font-medium transition-all",
                      Math.abs(responseWindow - value) < 0.01
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Parallel candidates */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">{t("wizard.contactAtOnceLabel")}</Label>
                <span className="text-sm font-semibold text-primary">
                  {maxParallelCandidates === 1
                    ? t("wizard.contactAtOncePerson", { n: maxParallelCandidates })
                    : t("wizard.contactAtOncePeople", { n: maxParallelCandidates })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t("wizard.contactAtOnceHint")}</p>
              <div className="flex gap-1.5">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxParallelCandidates(n)}
                    className={cn(
                      "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all",
                      maxParallelCandidates === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setStep(2)}>
                <ChevronLeft className="mr-1 h-5 w-5" />
                {t("form.back")}
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={!canProceedStep3}
                onClick={() => setStep(4)}
                title={!canProceedStep3 ? t("wizard.addAtLeastContacts", { n: spotsNeeded }) : undefined}
              >
                {t("wizard.continue")}
                <ChevronRight className="ml-1 h-5 w-5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Review & Start */}
        {step === 4 && (
          <div className="space-y-4 pt-2">
            {/* Match summary */}
            <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t("wizard.matchDetailsSummary")}
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <CalendarIcon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-medium">{date ? format(date, "EEEE, MMMM d", { locale: dateLocale }) : ""}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 shrink-0 text-primary" />
                  <span>{displayTime}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <span>{displayLocation}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <SportFormatBadge sport={sport} format={matchFormat} />
                </div>
              </div>
            </div>

            {/* Invite sequence preview */}
            <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t("wizard.inviteSequenceLabel")}
              </h3>
              <div className="space-y-2">
                {priorityList.slice(0, 5).map((contact, index) => (
                  <div key={contact.id} className="flex items-center gap-3">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {index + 1}
                    </div>
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {contact.name[0]}
                    </div>
                    <span className="flex-1 text-sm">{contact.name}</span>
                    {index === 0 && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {t("wizard.inviteSequenceFirst")}
                      </span>
                    )}
                  </div>
                ))}
                {priorityList.length > 5 && (
                  <p className="pl-8 text-xs text-muted-foreground">
                    {t("wizard.inviteSequenceMore", { n: priorityList.length - 5 })}
                  </p>
                )}
              </div>
            </div>

            {/* How it works */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                <Zap className="h-4 w-4" />
                {t("wizard.howItWorksTitle")}
              </h3>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  {t("wizard.howItWorks1", { n: maxParallelCandidates })}
                </li>
                <li className="flex items-start gap-2">
                  <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  {t("wizard.howItWorks2")}
                </li>
                <li className="flex items-start gap-2">
                  <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  {t("wizard.howItWorks3", {
                    window: responseWindow < 1
                      ? t("wizard.responseWindowSec", { n: Math.round(responseWindow * 60) })
                      : responseWindow < 60
                      ? t("wizard.responseWindowMinutes", { n: responseWindow })
                      : responseWindow === 60
                      ? t("wizard.responseWindowOneHour")
                      : t("wizard.responseWindowHours", { n: responseWindow / 60 })
                  })}
                </li>
                <li className="flex items-start gap-2">
                  <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  {t("wizard.howItWorks4")}
                </li>
              </ul>
            </div>

            {/* Copy invite link */}
            <div className="rounded-xl border border-border/40 bg-card px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{t("wizard.shareInviteLink")}</p>
                  <p className="text-xs text-muted-foreground">{t("wizard.shareInviteLinkHint")}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={handleCopyInviteLink}
                >
                  {linkCopied ? (
                    <><Check className="h-3.5 w-3.5" />{t("wizard.copied")}</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" />{t("wizard.copyLink")}</>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setStep(3)}
              >
                <ChevronLeft className="mr-1 h-5 w-5" />
                {t("form.back")}
              </Button>
              <Button
                size="lg"
                className="flex-1 bg-[#25D366] text-white hover:bg-[#25D366]/90"
                onClick={handleStartScheduling}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Zap className="mr-2 h-5 w-5" />
                )}
                {t("wizard.startSchedulingButton")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
