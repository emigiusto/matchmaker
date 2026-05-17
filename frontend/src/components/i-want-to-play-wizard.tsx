import { useState, useCallback, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { format, startOfDay, isBefore } from "date-fns"
import { es as esLocale, ca as caLocale } from "date-fns/locale"
import {
  Calendar as CalendarIcon,
  MapPin,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  X,
  Zap,
  Users,
  CircleDot,
  Swords,
  Target,
  Building2,
  Loader2,
  UserPlus,
  List,
  UserCircle,
  Search,
  Smartphone,
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { PhoneInput } from "@/components/phone-input"
import { SportFormatBadge } from "@/components/sport-format-badge"
import { toast } from "sonner"
import { validatePhoneE164 } from "@/lib/phone.utils"
import { cn } from "@/lib/utils"
import { schedulingService, type AdditionalDateEntry } from "@/lib/services/scheduling.service"
import { playersService } from "@/lib/services/players.service"
import { contactsService, type ContactDTO, type ContactListDTO } from "@/lib/services/contacts.service"
import { deviceContactsService, type DeviceContact } from "@/lib/services/device-contacts.service"
import { bookingService, SUPPORTED_CLUBS, type ClubMembershipDTO, type CourtAvailabilityResult } from "@/lib/services/booking.service"
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

/** Returns every HH:00 slot in [startTime, endTime) as an array of "HH:MM" strings */
function slotsInRange(startTime: string, endTime: string): string[] {
  if (!startTime || !endTime) return []
  const [sh] = startTime.split(":").map(Number)
  const [eh] = endTime.split(":").map(Number)
  const slots: string[] = []
  for (let h = sh; h < eh; h++) slots.push(`${String(h).padStart(2, "0")}:00`)
  return slots
}

type LocationType = "place" | "city"

interface Contact {
  id: string
  name: string
  phone?: string
}

/** A contact from the user's address book, for the contacts picker */
type AvailableContact = {
  id: string        // contactId (not userId)
  name: string
  phone: string
  linkedUserId: string | null
  socioNumbers: Record<string, string>
}

function ContactItem({ contact, onRemove }: { contact: Contact; onRemove: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card px-3 py-2">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {contact.name[0]}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium leading-tight">{contact.name}</span>
        {contact.phone && <span className="text-xs text-muted-foreground">{contact.phone}</span>}
      </div>
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
  const dateLocale = language === "es" ? esLocale : language === "ca" ? caLocale : undefined
  const [step, setStep] = useState<Step>(1)
  const [dateEntries, setDateEntries] = useState<Array<{ date: Date; startTime: string; endTime: string }>>([])

  // Derived from dateEntries for backward-compat with downstream code
  const dates = dateEntries.map((e) => e.date)
  const startTime = dateEntries[0]?.startTime ?? ""
  const endTime = dateEntries[0]?.endTime ?? ""
  const [locationType, setLocationType] = useState<LocationType>("place")
  const [specificPlace, setSpecificPlace] = useState("")
  const [cityValue, setCityValue] = useState("")
  
  // Step 2: Match type + format + sport
  const [matchType, setMatchType] = useState<"competitive" | "practice">("competitive")
  const [matchFormat, setMatchFormat] = useState<"singles" | "doubles">("singles")
  const [sport, setSport] = useState<"tennis" | "padel">("tennis")

  // Step 3: Contact priority list
  const [priorityList, setPriorityList] = useState<Contact[]>([])
  const [availableContacts, setAvailableContacts] = useState<AvailableContact[]>([])
  const [contactLists, setContactLists] = useState<ContactListDTO[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [bookingEnabled, setBookingEnabled] = useState(false)
  const [clubMemberships, setClubMemberships] = useState<ClubMembershipDTO[]>([])
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null)
  const [courtAvailabilities, setCourtAvailabilities] = useState<Record<string, CourtAvailabilityResult>>({})
  const [courtAvailabilityLoading, setCourtAvailabilityLoading] = useState(false)
  const [courtAvailabilityError, setCourtAvailabilityError] = useState<string | null>(null)
  // Maps userId → { contactId, socioNumbers } for contacts in the priority list
  const [contactMeta, setContactMeta] = useState<Record<string, { contactId: string; socioNumbers: Record<string, string> }>>({})
  const [socioEdits, setSocioEdits] = useState<Record<string, string>>({})
  const [savingSocio, setSavingSocio] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [manualName, setManualName] = useState("")
  const [manualPhone, setManualPhone] = useState("")
  const [manualSocio, setManualSocio] = useState("")
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [searchFromList, setSearchFromList] = useState("")
  const [fromListOpen, setFromListOpen] = useState(false)
  const [searchAllContacts, setSearchAllContacts] = useState("")
  const [showAllContacts, setShowAllContacts] = useState(false)

  // Device contacts (native only)
  const isNative = deviceContactsService.isNative()
  const [showDevicePicker, setShowDevicePicker] = useState(false)
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([])
  const [deviceContactsLoading, setDeviceContactsLoading] = useState(false)
  const [deviceContactSearch, setDeviceContactSearch] = useState("")
  const [selectedDeviceContactIds, setSelectedDeviceContactIds] = useState<Set<string>>(new Set())
  const [addingDeviceContacts, setAddingDeviceContacts] = useState(false)

  function resetWizard() {
    setStep(1)
    setDateEntries([])
    setLocationType("place")
    setSpecificPlace("")
    setCityValue("")
    setMatchType("practice")
    setMatchFormat("singles")
    setSport("tennis")
    setPriorityList([])
    setBookingEnabled(false)
    setSelectedMembershipId(null)
    setCourtAvailabilities({})
    setCourtAvailabilityLoading(false)
    setCourtAvailabilityError(null)
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

  // Fetch full-day court availability when Auto-book is ON and date is set.
  // Keyed by date+sport+membership — changing the time picker reuses the cached result.
  // Disables the toggle if the check doesn't return within the timeout.
  useEffect(() => {
    if (!bookingEnabled || dates.length === 0) {
      setCourtAvailabilities({})
      setCourtAvailabilityError(null)
      return
    }
    const membership = selectedMembershipId
      ? clubMemberships.find((m) => m.id === selectedMembershipId)
      : clubMemberships[0]
    if (!membership) return

    setCourtAvailabilityLoading(true)
    setCourtAvailabilityError(null)
    setCourtAvailabilities({})

    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      setBookingEnabled(false)
      setCourtAvailabilityLoading(false)
      toast.error(t("wizard.courtAvailabilityServiceError"))
    }, 20_000)

    const dateKeys = dateEntries.map((e) => format(e.date, "yyyy-MM-dd"))
    Promise.all(
      dateKeys.map((dateKey) =>
        bookingService.checkAvailability({
          userId: hostUserId,
          clubSlug: membership.clubSlug,
          date: dateKey,
          sport,
        })
      )
    ).then((results) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      const map: Record<string, CourtAvailabilityResult> = {}
      results.forEach((r, i) => { map[dateKeys[i]] = r })
      setCourtAvailabilities(map)
      setCourtAvailabilityLoading(false)
    }).catch(() => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      setCourtAvailabilityError(t("wizard.courtAvailabilityServiceError"))
      setCourtAvailabilityLoading(false)
    })

    return () => {
      settled = true
      clearTimeout(timeout)
    }
  }, [bookingEnabled, dateEntries, sport, selectedMembershipId, clubMemberships, hostUserId])

  // Fetch contacts for step 3: contacts + lists (2 calls instead of 4)
  useEffect(() => {
    if (!open || !hostUserId) return
    setContactsLoading(true)
    Promise.all([
      contactsService.list(hostUserId).catch(() => [] as ContactDTO[]),
      contactsService.listLists(hostUserId).catch(() => [] as ContactListDTO[]),
    ])
      .then(([contacts, lists]) => {
        const ac: AvailableContact[] = contacts
          .filter((c) => c.linkedUserId !== hostUserId)
          .map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            linkedUserId: c.linkedUserId,
            socioNumbers: c.socioNumbers,
          }))
        setAvailableContacts(ac)
        setContactLists(lists)
      })
      .catch(() => {
        setAvailableContacts([])
        setContactLists([])
        toast.error(t("wizard.toast.loadContactsFailed"))
      })
      .finally(() => setContactsLoading(false))
  }, [open, hostUserId])

  function handleClose(val: boolean) {
    if (!val) resetWizard()
    onOpenChange(val)
  }

  function handleDatesSelect(selected: Date[] | undefined) {
    const newDates = selected ?? []
    setDateEntries((prev) => {
      const lastEntry = prev[prev.length - 1]
      const defaultStart = lastEntry?.startTime ?? ""
      const defaultEnd = lastEntry?.endTime ?? ""
      return newDates.map((d) => {
        const existing = prev.find((e) => e.date.toDateString() === d.toDateString())
        return existing ?? { date: d, startTime: defaultStart, endTime: defaultEnd }
      })
    })
  }

  function handleDateEntryStartTimeChange(dateKey: string, val: string) {
    setDateEntries((prev) =>
      prev.map((e) => {
        if (e.date.toDateString() !== dateKey) return e
        const [sh] = val.split(":").map(Number)
        const [eh] = (e.endTime || "").split(":").map(Number)
        const newEnd = !e.endTime || eh <= sh ? addOneHour(val) : e.endTime
        return { ...e, startTime: val, endTime: newEnd }
      })
    )
  }

  function handleDateEntryEndTimeChange(dateKey: string, val: string) {
    setDateEntries((prev) =>
      prev.map((e) => (e.date.toDateString() === dateKey ? { ...e, endTime: val } : e))
    )
  }

  const canProceedStep1 =
    dateEntries.length > 0 &&
    dateEntries.every((e) => e.startTime && e.endTime) &&
    !(bookingEnabled && courtAvailabilityLoading)
  const spotsNeeded = matchFormat === "doubles" ? 3 : 1 // doubles: host+partner+3 others; singles: host+1
  const canProceedStep3 = priorityList.length >= spotsNeeded
  const locationText = locationType === "place" ? specificPlace : cityValue
  const displayLocation = locationText.trim() || t("wizard.toBeDecided")


  function addContact(contact: Contact) {
    if (priorityList.some((c) => c.id === contact.id)) return
    setPriorityList((prev) => [...prev, contact])
  }

  async function addAvailableContact(ac: AvailableContact) {
    // Use linkedUserId if available, otherwise the contactId itself acts as a stable key
    const userId = ac.linkedUserId ?? ac.id
    if (priorityList.some((c) => c.id === userId)) return
    addContact({ id: userId, name: ac.name, phone: ac.phone })
    setContactMeta((prev) => ({
      ...prev,
      [userId]: { contactId: ac.id, socioNumbers: ac.socioNumbers },
    }))
    const activeClubSlug = selectedMembershipId
      ? clubMemberships.find((m) => m.id === selectedMembershipId)?.clubSlug
      : clubMemberships[0]?.clubSlug
    setSocioEdits((prev) => ({
      ...prev,
      [userId]: activeClubSlug ? (ac.socioNumbers[activeClubSlug] ?? "") : "",
    }))
  }

  function addListMembers(list: ContactListDTO) {
    const toAdd = list.members.filter(
      (m) => (m.linkedUserId ?? m.id) !== hostUserId &&
        !priorityList.some((c) => c.id === (m.linkedUserId ?? m.id))
    )
    if (toAdd.length === 0) {
      toast.info(t("wizard.toast.allMembersAdded"))
      return
    }
    const activeClubSlug = selectedMembershipId
      ? clubMemberships.find((m) => m.id === selectedMembershipId)?.clubSlug
      : clubMemberships[0]?.clubSlug
    for (const m of toAdd) {
      const userId = m.linkedUserId ?? m.id
      setContactMeta((prev) => ({
        ...prev,
        [userId]: { contactId: m.id, socioNumbers: m.socioNumbers },
      }))
      setSocioEdits((prev) => ({
        ...prev,
        [userId]: activeClubSlug ? (m.socioNumbers[activeClubSlug] ?? "") : "",
      }))
    }
    setPriorityList((prev) => [
      ...prev,
      ...toAdd.map((m) => ({ id: m.linkedUserId ?? m.id, name: m.name, phone: m.phone })),
    ])
    toast.success(`Added ${toAdd.length} from ${list.name}`)
  }

  async function handleSaveSocio(userId: string) {
    const meta = contactMeta[userId]
    if (!meta) return
    const value = (socioEdits[userId] ?? "").trim()
    const activeClubSlug = selectedMembershipId
      ? clubMemberships.find((m) => m.id === selectedMembershipId)?.clubSlug ?? "laieta"
      : clubMemberships[0]?.clubSlug ?? "laieta"
    setSavingSocio(userId)
    try {
      await contactsService.updateSocioNumber(
        meta.contactId,
        hostUserId,
        meta.socioNumbers,
        activeClubSlug,
        value,
      )
      setContactMeta((prev) => ({
        ...prev,
        [userId]: { ...prev[userId], socioNumbers: { ...prev[userId].socioNumbers, [activeClubSlug]: value } },
      }))
      toast.success(t("wizard.toast.socioSaved"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("wizard.toast.saveFailed"))
    } finally {
      setSavingSocio(null)
    }
  }

  async function handleOpenDevicePicker() {
    setDeviceContactsLoading(true)
    setDeviceContactSearch("")
    setSelectedDeviceContactIds(new Set())
    try {
      const permission = await deviceContactsService.requestPermission()
      if (permission !== 'granted') {
        toast.error("Contacts permission is required")
        return
      }
      const all = await deviceContactsService.getContacts()
      setDeviceContacts(all)
      setShowDevicePicker(true)
    } catch (e) {
      const msg = deviceContactsService.extractErrorMessage(e)
      console.error('[contacts] handleOpenDevicePicker error:', msg)
      toast.error(`Contacts error: ${msg}`)
    } finally {
      setDeviceContactsLoading(false)
    }
  }

  async function handleAddDeviceContacts() {
    const selected = deviceContacts.filter((c) => selectedDeviceContactIds.has(c.id))
    if (selected.length === 0) return
    setAddingDeviceContacts(true)
    try {
      for (const dc of selected) {
        const phone = dc.phones[0]
        const { contact, user } = await contactsService.create(hostUserId, dc.name, phone)
        const userId = user.id
        addContact({ id: userId, name: user.name || dc.name, phone })
        setContactMeta((prev) => ({
          ...prev,
          [userId]: { contactId: contact.id, socioNumbers: {} },
        }))
      }
      setShowDevicePicker(false)
      setSelectedDeviceContactIds(new Set())
      toast.success(`${selected.length} contact(s) added`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("wizard.toast.contactFailed"))
    } finally {
      setAddingDeviceContacts(false)
    }
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
      const { contact, user } = await contactsService.create(hostUserId, name, phone)
      const socio = manualSocio.trim()
      setManualName("")
      setManualPhone("")
      setManualSocio("")
      const userId = user.id
      addContact({ id: userId, name: user.name || name, phone })

      let savedSocioNumbers: Record<string, string> = {}
      if (socio && bookingEnabled) {
        const activeClubSlug = selectedMembershipId
          ? clubMemberships.find((m) => m.id === selectedMembershipId)?.clubSlug ?? "laieta"
          : clubMemberships[0]?.clubSlug ?? "laieta"
        try {
          await contactsService.updateSocioNumber(contact.id, hostUserId, {}, activeClubSlug, socio)
          savedSocioNumbers = { [activeClubSlug]: socio }
        } catch {
          // Socio save failed silently — user can edit later in the list
        }
      }

      setContactMeta((prev) => ({
        ...prev,
        [userId]: { contactId: contact.id, socioNumbers: savedSocioNumbers },
      }))
      setSocioEdits((prev) => ({ ...prev, [userId]: socio }))
      // Refresh available contacts list
      contactsService.list(hostUserId).then((cs) =>
        setAvailableContacts(cs.filter((c) => c.linkedUserId !== hostUserId).map((c) => ({
          id: c.id, name: c.name, phone: c.phone,
          linkedUserId: c.linkedUserId, socioNumbers: c.socioNumbers,
        })))
      ).catch(() => {})
      toast.success(t("wizard.toast.contactSaved"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("wizard.toast.contactFailed"))
    }
  }

  // Remove contact from priority list
  function removeContact(id: string) {
    setPriorityList(prev => prev.filter(c => c.id !== id))
  }



  async function handleStartScheduling() {
    if (dateEntries.length === 0 || !startTime || !endTime || !hostUserId || priorityList.length === 0) return
    setSubmitting(true)
    try {
      const sortedEntries = [...dateEntries].sort((a, b) => a.date.getTime() - b.date.getTime())
      const primary = sortedEntries[0]
      const dateStr = format(primary.date, "yyyy-MM-dd")
      const [startH, startM] = primary.startTime.split(":").map(Number)
      const [endH, endM] = primary.endTime.split(":").map(Number)
      const startDateTime = new Date(primary.date.getFullYear(), primary.date.getMonth(), primary.date.getDate(), startH, startM)
      const endDateTime = new Date(primary.date.getFullYear(), primary.date.getMonth(), primary.date.getDate(), endH, endM)
      const additionalDateEntries: AdditionalDateEntry[] = sortedEntries.slice(1).map((e) => ({
        date: format(e.date, "yyyy-MM-dd"),
        startTime: e.startTime,
        endTime: e.endTime,
      }))
      const req = await schedulingService.create({
        hostUserId,
        sportType: sport,
        format: matchFormat,
        matchType,
        date: dateStr,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        additionalDates: additionalDateEntries.length > 0 ? additionalDateEntries : undefined,
        locationText: (locationType === "place" ? specificPlace : cityValue).trim(),
        radiusKm: null,
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
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto overflow-x-hidden">
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
            {/* Sport */}
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
            </div>

            {/* Date + per-date time pickers */}
            <div className="space-y-2">
              <div>
                <Label className="text-base font-medium">{t("wizard.date")}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {language === "es"
                    ? "Puedes seleccionar varios días. Toca de nuevo para deseleccionar."
                    : "You can select multiple days. Tap again to deselect."}
                </p>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/10 flex justify-center">
                <Calendar
                  mode="multiple"
                  selected={dates}
                  onSelect={handleDatesSelect}
                  disabled={(d) => isBefore(startOfDay(d), startOfDay(new Date()))}
                  locale={dateLocale}
                />
              </div>

              {/* Per-date time pickers — appear below the calendar, no layout shift */}
              {dateEntries.length > 0 && (
                <div className="space-y-2 pt-1">
                  {[...dateEntries]
                    .sort((a, b) => a.date.getTime() - b.date.getTime())
                    .map((entry) => (
                      <div key={entry.date.toISOString()} className="flex items-center gap-2">
                        <span className="w-24 shrink-0 text-sm font-medium text-foreground">
                          {format(entry.date, "EEE d/M", { locale: dateLocale })}
                        </span>
                        <div className="flex flex-1 items-center gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">
                          <div className="flex flex-1 flex-col items-center rounded-lg bg-background px-2 py-1 shadow-sm">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("wizard.timeStart")}</span>
                            <Select value={entry.startTime} onValueChange={(v) => handleDateEntryStartTimeChange(entry.date.toDateString(), v)}>
                              <SelectTrigger className="h-auto w-full justify-center border-0 bg-transparent p-0 text-sm font-semibold shadow-none focus:ring-0 [&>svg]:hidden">
                                <SelectValue placeholder="--:--" />
                              </SelectTrigger>
                              <SelectContent>
                                {TIME_SLOTS.map((s) => (
                                  <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <div className="flex flex-1 flex-col items-center rounded-lg bg-background px-2 py-1 shadow-sm">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("wizard.timeEnd")}</span>
                            <Select
                              value={entry.endTime}
                              onValueChange={(v) => handleDateEntryEndTimeChange(entry.date.toDateString(), v)}
                              disabled={!entry.startTime}
                            >
                              <SelectTrigger className="h-auto w-full justify-center border-0 bg-transparent p-0 text-sm font-semibold shadow-none focus:ring-0 [&>svg]:hidden">
                                <SelectValue placeholder="--:--" />
                              </SelectTrigger>
                              <SelectContent>
                                {TIME_SLOTS.filter((s) => {
                                  const [sh] = (entry.startTime || "").split(":").map(Number)
                                  const [h] = s.split(":").map(Number)
                                  return h > sh
                                }).map((s) => (
                                  <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>

            {/* Location — optional: Place (court/club) or City, defaults to user's preferred club */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-base font-medium">
                  {t("wizard.location")} <span className="text-muted-foreground font-normal">{t("wizard.locationOptional")}</span>
                </Label>
                <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs shrink-0">
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
                {bookingEnabled && (
                  <div className="border-t border-border/40 pt-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t("wizard.courtAvailability")}</p>
                    {dates.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t("wizard.courtAvailabilityHint")}</p>
                    )}
                    {dates.length > 0 && courtAvailabilityLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {t("wizard.checkingCourts")}
                      </div>
                    )}
                    {dates.length > 0 && !courtAvailabilityLoading && courtAvailabilityError && (
                      <p className="text-xs text-muted-foreground">{courtAvailabilityError}</p>
                    )}
                    {dates.length > 0 && !courtAvailabilityLoading && !courtAvailabilityError && Object.keys(courtAvailabilities).length > 0 && (
                      <div className="space-y-3">
                        {[...dateEntries].sort((a, b) => a.date.getTime() - b.date.getTime()).map((entry) => {
                          const dateKey = format(entry.date, "yyyy-MM-dd")
                          const availability = courtAvailabilities[dateKey]
                          const slots = slotsInRange(entry.startTime, entry.endTime)
                          if (!availability || slots.length === 0) return null
                          return (
                            <div key={dateKey} className="space-y-1">
                              {dateEntries.length > 1 && (
                                <p className="text-xs font-medium text-muted-foreground">
                                  {format(entry.date, "EEE d/M", { locale: dateLocale })}
                                </p>
                              )}
                              {slots.map((slot) => {
                                const count = availability.availableCourts.filter((c) => c.time === slot).length
                                return (
                                  <div key={slot} className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-muted-foreground">{slot}</span>
                                    <span className={`text-xs font-medium ${count > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                                      {t("wizard.availableCourtsCount", { count })}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-border/40 bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t("wizard.autoBook")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("wizard.autoBookProfileLinkBefore")}{" "}
                      <Link
                        to="/profile#club-connections"
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
                  onClick={() => setMatchType("competitive")}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                    matchType === "competitive"
                      ? "border-primary bg-primary/5"
                      : "border-border/50 hover:border-primary/30"
                  )}
                >
                  <Swords className={cn("h-6 w-6", matchType === "competitive" ? "text-primary" : "text-muted-foreground")} />
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
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {/* Add from contact lists */}
                    {contactLists.length > 0 && (
                      <Popover open={fromListOpen} onOpenChange={(open) => { setFromListOpen(open); if (!open) setSearchFromList("") }}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1.5">
                            <List className="h-4 w-4" />
                            {t("wizard.fromList")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                          <div className="relative mb-2">
                            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              placeholder={t("wizard.searchLists")}
                              value={searchFromList}
                              onChange={(e) => setSearchFromList(e.target.value)}
                              className="h-8 pl-8"
                            />
                          </div>
                          <ScrollArea className="h-48">
                            <div className="space-y-0.5 pr-2">
                              {contactLists
                                .filter((l) => !searchFromList.trim() || l.name.toLowerCase().includes(searchFromList.trim().toLowerCase()))
                                .map((l) => (
                                  <button
                                    key={l.id}
                                    onClick={() => { addListMembers(l); setFromListOpen(false) }}
                                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted"
                                  >
                                    <span>{l.name}</span>
                                    <span className="text-xs text-muted-foreground">{l.members.length}</span>
                                  </button>
                                ))}
                            </div>
                          </ScrollArea>
                        </PopoverContent>
                      </Popover>
                    )}
                    {/* Add from all contacts */}
                    <Button
                      variant={showAllContacts ? "secondary" : "outline"}
                      size="sm"
                      className="gap-1.5"
                      disabled={availableContacts.length === 0}
                      onClick={() => { setShowAllContacts((v) => !v); setSearchAllContacts("") }}
                    >
                      <UserCircle className="h-4 w-4" />
                      {t("wizard.allContacts")}
                    </Button>
                  </div>
                  {/* Inline all-contacts panel */}
                  {showAllContacts && (
                    <div className="rounded-md border bg-popover p-2 shadow-sm">
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
                          .filter((ac) => !priorityList.some((p) => p.id === (ac.linkedUserId ?? ac.id)))
                          .filter((ac) => !searchAllContacts.trim() || ac.name.toLowerCase().includes(searchAllContacts.trim().toLowerCase()))
                          .map((ac) => (
                            <button
                              key={ac.id}
                              onClick={() => { addAvailableContact(ac); setShowAllContacts(false) }}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                            >
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                                {ac.name[0] ?? "?"}
                              </div>
                              <span className="flex-1 text-left">{ac.name}</span>
                              {ac.linkedUserId && (
                                <span className="text-[10px] text-muted-foreground">✓</span>
                              )}
                            </button>
                          ))}
                        {availableContacts.filter((ac) => !priorityList.some((p) => p.id === (ac.linkedUserId ?? ac.id))).length === 0 && (
                          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                            {availableContacts.length === 0 ? t("wizard.noContactsYet") : t("wizard.allAdded")}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
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
                <div className="flex flex-col gap-2">
                  <Input
                    placeholder={t("wizard.namePlaceholder")}
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                  />
                  <PhoneInput
                    value={manualPhone}
                    onChange={setManualPhone}
                    defaultCountryCode="34"
                  />
                  {bookingEnabled && (
                    <Input
                      placeholder={t("wizard.socioPlaceholder")}
                      value={manualSocio}
                      onChange={(e) => setManualSocio(e.target.value)}
                    />
                  )}
                  <Button variant="secondary" size="sm" onClick={handleAddManualContact} disabled={!manualName.trim() || !manualPhone.trim()}>
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

            {/* Device contacts picker (native only) */}
            {isNative && (
              showDevicePicker ? (
                <div className="space-y-2 rounded-xl border border-dashed border-border/60 bg-muted/10 px-3 py-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">From device contacts</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-auto gap-1 py-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setShowDevicePicker(false)}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                      {t("wizard.hide")}
                    </Button>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search…"
                      value={deviceContactSearch}
                      onChange={(e) => setDeviceContactSearch(e.target.value)}
                      className="h-8 pl-8"
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-0.5 rounded border p-1">
                    {deviceContacts
                      .filter((c) => !deviceContactSearch.trim() || c.name.toLowerCase().includes(deviceContactSearch.trim().toLowerCase()))
                      .slice(0, 50)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setSelectedDeviceContactIds((prev) => {
                              const next = new Set(prev)
                              next.has(c.id) ? next.delete(c.id) : next.add(c.id)
                              return next
                            })
                          }
                          className={cn(
                            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                            selectedDeviceContactIds.has(c.id) && "bg-primary/10"
                          )}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border">
                            {selectedDeviceContactIds.has(c.id) ? "✓" : ""}
                          </span>
                          <span className="flex-1">{c.name}</span>
                          <span className="text-[10px] text-muted-foreground">{c.phones[0]}</span>
                        </button>
                      ))}
                    {deviceContacts.length === 0 && (
                      <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                        No contacts with phone numbers found
                      </p>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={handleAddDeviceContacts}
                    disabled={selectedDeviceContactIds.size === 0 || addingDeviceContacts}
                  >
                    {addingDeviceContacts ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                    Add {selectedDeviceContactIds.size} contact{selectedDeviceContactIds.size !== 1 ? "s" : ""}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center gap-2 border-dashed py-5 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  onClick={handleOpenDevicePicker}
                  disabled={deviceContactsLoading}
                >
                  {deviceContactsLoading
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Smartphone className="h-4 w-4" />}
                  From device contacts
                </Button>
              )
            )}

            {/* Selected players list */}
            <div className="space-y-2">
              <Label className="text-base font-medium">
                {t("wizard.selectedPlayers")}
                {priorityList.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                    {priorityList.length}
                  </span>
                )}
              </Label>

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
                <div className="space-y-1.5">
                  {priorityList.map((contact) => (
                    <ContactItem key={contact.id} contact={contact} onRemove={removeContact} />
                  ))}
                </div>
              )}
            </div>

            {/* Socio numbers — only shown when automatic court booking is enabled */}
            {bookingEnabled && priorityList.length > 0 && (
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
                        value={socioEdits[c.id] ?? ""}
                        onChange={(e) => setSocioEdits((p) => ({ ...p, [c.id]: e.target.value }))}
                        onBlur={() => { if (contactMeta[c.id]) handleSaveSocio(c.id) }}
                        onKeyDown={(e) => { if (e.key === "Enter" && contactMeta[c.id]) handleSaveSocio(c.id) }}
                      />
                      {savingSocio === c.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    </div>
                  ))}
                </div>
              </div>
            )}


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
                <div className="flex items-start gap-3 text-sm">
                  <CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="space-y-0.5">
                    {[...dateEntries]
                      .sort((a, b) => a.date.getTime() - b.date.getTime())
                      .map((entry) => (
                        <div key={entry.date.toDateString()} className="flex items-center gap-2">
                          <span className="font-medium">
                            {format(entry.date, dateEntries.length === 1 ? "EEEE, MMMM d" : "EEE d/M", { locale: dateLocale })}
                          </span>
                          {entry.startTime && entry.endTime && (
                            <span className="text-muted-foreground">{entry.startTime} – {entry.endTime}</span>
                          )}
                        </div>
                      ))}
                  </div>
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
                  {t("wizard.howItWorks2")}
                </li>
                <li className="flex items-start gap-2">
                  <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  {t("wizard.howItWorks4")}
                </li>
              </ul>
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
