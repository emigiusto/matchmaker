import { useState, useCallback } from "react"
import { format } from "date-fns"
import {
  Calendar as CalendarIcon,
  MapPin,
  ChevronRight,
  ChevronLeft,
  GripVertical,
  Plus,
  X,
  Zap,
  Clock,
  Users,
  CircleDot,
  Swords,
  Target,
  Copy,
  Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface WizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 1 | 2 | 3 | 4

// Generate time slots at :00 and :30 only (06:00 – 22:30)
const TIME_SLOTS: string[] = []
for (let h = 6; h <= 22; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, "0")}:00`)
  if (h < 22) TIME_SLOTS.push(`${String(h).padStart(2, "0")}:30`)
}
TIME_SLOTS.push("22:30")

function addOneHour(time: string): string {
  if (!time) return ""
  const [h, m] = time.split(":").map(Number)
  const totalMinutes = h * 60 + m + 60
  const newH = Math.floor(totalMinutes / 60)
  const newM = totalMinutes % 60
  if (newH > 22 || (newH === 22 && newM > 30)) return "22:30"
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`
}

// Radius stops for area-based location
const RADIUS_STOPS = [2, 5, 8, 10, 15, 50] as const
type LocationType = "area" | "specific"

// Mock contact lists
const CONTACT_LISTS = [
  { id: "cl-1", name: "Tennis Regulars", contacts: ["Carlos", "Pablo", "Marc", "Luis", "Ana", "Sofia"] },
  { id: "cl-2", name: "Club Members", contacts: ["Jorge", "Maria", "Pedro", "Elena", "Raul", "Carmen", "David", "Laura"] },
  { id: "cl-3", name: "Padel Group", contacts: ["Miguel", "Rosa", "Alberto", "Lucia"] },
]

// Mock all contacts (for "Import contacts" simulation)
const ALL_CONTACTS = [
  "Carlos", "Pablo", "Marc", "Luis", "Ana", "Sofia",
  "Jorge", "Maria", "Pedro", "Elena", "Raul", "Carmen",
  "David", "Laura", "Miguel", "Rosa", "Alberto", "Lucia",
  "Fernando", "Isabel", "Roberto", "Teresa"
]

interface Contact {
  id: string
  name: string
}

export function IWantToPlayWizard({ open, onOpenChange }: WizardProps) {
  const [step, setStep] = useState<Step>(1)
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [locationType, setLocationType] = useState<LocationType>("area")
  const [location, setLocation] = useState("My current location")
  const [radius, setRadius] = useState(10)
  const [specificPlace, setSpecificPlace] = useState("")
  
  // Step 2: Match type + format + sport
  const [matchType, setMatchType] = useState<"competitive" | "practice">("competitive")
  const [matchFormat, setMatchFormat] = useState<"singles" | "doubles">("singles")
  const [sport, setSport] = useState<"tennis" | "padel">("tennis")
  
  // Step 3: Contact priority list
  const [priorityList, setPriorityList] = useState<Contact[]>([])
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [responseWindow, setResponseWindow] = useState<number>(60) // minutes

  function resetWizard() {
    setStep(1)
    setDate(undefined)
    setStartTime("")
    setEndTime("")
    setLocationType("area")
    setLocation("My current location")
    setRadius(10)
    setSpecificPlace("")
    setMatchType("competitive")
    setMatchFormat("singles")
    setSport("tennis")
    setPriorityList([])
    setDraggedIndex(null)
    setResponseWindow(60)
  }

  function handleClose(val: boolean) {
    if (!val) resetWizard()
    onOpenChange(val)
  }

  function handleStartTimeChange(val: string) {
    setStartTime(val)
    setEndTime(addOneHour(val))
  }

  const locationValid = locationType === "area" ? !!location : !!specificPlace
  const canProceedStep1 = date && startTime && endTime && locationValid && startTime < endTime
  const spotsNeeded = matchFormat === "doubles" ? 3 : 1 // contacts needed (user fills 1 spot)
  const canProceedStep2 = priorityList.length >= spotsNeeded
  const displayTime = startTime && endTime ? `${startTime} - ${endTime}` : ""
  const displayLocation = locationType === "area" ? `${location} (${radius} km)` : specificPlace

  const endTimeSlots = startTime
    ? TIME_SLOTS.filter((t) => t > startTime)
    : TIME_SLOTS

  // Add all contacts from a list (merge, no duplicates)
  function addContactsFromList(listId: string) {
    const list = CONTACT_LISTS.find(l => l.id === listId)
    if (!list) return
    setPriorityList(prev => {
      const existingNames = new Set(prev.map(c => c.name))
      const newContacts: Contact[] = list.contacts
        .filter(name => !existingNames.has(name))
        .map((name, idx) => ({ id: `${listId}-${idx}-${Date.now()}`, name }))
      return [...prev, ...newContacts]
    })
  }

  // Remove all contacts sourced from a list
  function removeContactsFromList(listId: string) {
    const list = CONTACT_LISTS.find(l => l.id === listId)
    if (!list) return
    const listNames = new Set(list.contacts)
    setPriorityList(prev => prev.filter(c => !listNames.has(c.name)))
  }

  // Check if all contacts from a list are already in the priority list
  function isListFullyAdded(listId: string) {
    const list = CONTACT_LISTS.find(l => l.id === listId)
    if (!list) return false
    return list.contacts.every(name => priorityList.some(c => c.name === name))
  }

  // Add a single contact to priority list
  function addContact(name: string) {
    if (priorityList.some(c => c.name === name)) return
    setPriorityList(prev => [...prev, { id: `contact-${Date.now()}`, name }])
  }

  // Remove contact from priority list
  function removeContact(id: string) {
    setPriorityList(prev => prev.filter(c => c.id !== id))
  }

  // Drag and drop handlers
  const handleDragStart = useCallback((index: number) => {
    setDraggedIndex(index)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    
    setPriorityList(prev => {
      const newList = [...prev]
      const [removed] = newList.splice(draggedIndex, 1)
      newList.splice(index, 0, removed)
      return newList
    })
    setDraggedIndex(index)
  }, [draggedIndex])

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null)
  }, [])

  const [linkCopied, setLinkCopied] = useState(false)

  function handleCopyInviteLink() {
    const url = typeof window !== "undefined" ? `${window.location.origin}/invite/tok-${Date.now()}` : ""
    navigator.clipboard.writeText(url)
    setLinkCopied(true)
    toast.success("Invite link copied to clipboard")
    setTimeout(() => setLinkCopied(false), 2000)
  }

  function handleStartScheduling() {
    toast.success("Scheduling started! Invites will be sent via WhatsApp.", {
      description: `First contacting ${priorityList[0]?.name}...`
    })
    handleClose(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">
            {step === 1 && "When & Where"}
            {step === 2 && "Match Type"}
            {step === 3 && "Who to Invite"}
            {step === 4 && "Start Scheduling"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {step === 1 && "Set the date, time, and location for your match"}
            {step === 2 && "Choose competitive or practice match"}
            {step === 3 && "Select and prioritize contacts to invite"}
            {step === 4 && "Review and start the automated invite sequence"}
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
              <Label className="text-base font-medium">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left text-base",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-5 w-5" />
                    {date ? format(date, "EEEE, MMMM d, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(d) => d < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Time */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Time</Label>
              <div className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-muted/30 p-1">
                <div className="flex flex-1 flex-col items-center rounded-lg bg-background px-3 py-1.5 shadow-sm">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Start</span>
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
                <div className="flex flex-1 flex-col items-center rounded-lg bg-background px-3 py-1.5 shadow-sm">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">End</span>
                  <Select
                    value={endTime}
                    onValueChange={setEndTime}
                    disabled={!startTime}
                  >
                    <SelectTrigger className="h-auto w-full justify-center border-0 bg-transparent p-0 text-sm font-semibold shadow-none focus:ring-0 [&>svg]:hidden">
                      <SelectValue placeholder="--:--" />
                    </SelectTrigger>
                    <SelectContent>
                      {endTimeSlots.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">
                  Location <span className="text-destructive">*</span>
                </Label>
                <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setLocationType("area")}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition-all",
                      locationType === "area"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Area
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocationType("specific")}
                    className={cn(
                      "rounded-md px-2.5 py-1 font-medium transition-all",
                      locationType === "specific"
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Place
                  </button>
                </div>
              </div>

              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                {locationType === "area" ? (
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Your location or address"
                    className="pl-11 text-base"
                  />
                ) : (
                  <Input
                    value={specificPlace}
                    onChange={(e) => setSpecificPlace(e.target.value)}
                    placeholder="Club name, court, or venue"
                    className="pl-11 text-base"
                  />
                )}
              </div>

              {locationType === "area" && (
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 text-xs text-muted-foreground">Radius</span>
                  {RADIUS_STOPS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRadius(r)}
                      className={cn(
                        "flex-1 rounded-md py-1 text-xs font-medium transition-all",
                        radius === r
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {r} km
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              size="xl"
              className="w-full"
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
            >
              Continue
              <ChevronRight className="ml-1 h-5 w-5" />
            </Button>
          </div>
        )}

        {/* Step 2: Match Type */}
        {step === 2 && (
          <div className="space-y-5 pt-2">

            {/* Sport first */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Sport</Label>
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
                  Tennis
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
                  Padel
                </button>
              </div>
              {sport === "padel" && (
                <p className="text-xs text-muted-foreground">
                  Padel is always doubles — format is set automatically.
                </p>
              )}
            </div>

            {/* Format: Singles / Doubles — padel locks to doubles */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Format</Label>
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
                    {fmt === "singles" ? "Singles (1v1)" : "Doubles (2v2)"}
                  </button>
                ))}
              </div>
              {matchFormat === "doubles" && sport === "tennis" && (
                <p className="text-xs text-muted-foreground">
                  4 players total — you + 3 others.
                </p>
              )}
            </div>

            {/* Competitive / Practice */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Mode</Label>
              <div className="grid grid-cols-2 gap-3">
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
                    <p className="text-sm font-semibold">Competitive</p>
                    <p className="text-xs text-muted-foreground">Track score & stats</p>
                  </div>
                </button>
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
                    <p className="text-sm font-semibold">Practice</p>
                    <p className="text-xs text-muted-foreground">Casual, no tracking</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setStep(1)}>
                <ChevronLeft className="mr-1 h-5 w-5" />
                Back
              </Button>
              <Button size="lg" className="flex-1" onClick={() => setStep(3)}>
                Continue
                <ChevronRight className="ml-1 h-5 w-5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Who to Invite */}
        {step === 3 && (
          <div className="space-y-4 pt-2">

            {/* Contact lists — multi-select */}
            <div className="space-y-2">
              <Label className="text-base font-medium">Add from lists</Label>
              <div className="space-y-2">
                {CONTACT_LISTS.map((list) => {
                  const fullyAdded = isListFullyAdded(list.id)
                  return (
                    <div
                      key={list.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
                        fullyAdded ? "border-primary/40 bg-primary/5" : "border-border/40 bg-card"
                      )}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Users className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{list.name}</p>
                        <p className="text-xs text-muted-foreground">{list.contacts.length} contacts</p>
                      </div>
                      <Button
                        variant={fullyAdded ? "outline" : "secondary"}
                        size="sm"
                        className="shrink-0 text-xs"
                        onClick={() => fullyAdded ? removeContactsFromList(list.id) : addContactsFromList(list.id)}
                      >
                        {fullyAdded ? "Remove" : "Add all"}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Add individual contacts */}
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border/40" />
              <span className="text-xs text-muted-foreground">or add individually</span>
              <div className="h-px flex-1 bg-border/40" />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Contact
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="start">
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {ALL_CONTACTS.filter(c => !priorityList.some(p => p.name === c)).map((name) => (
                    <button
                      key={name}
                      onClick={() => addContact(name)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                        {name[0]}
                      </div>
                      {name}
                    </button>
                  ))}
                  {ALL_CONTACTS.filter(c => !priorityList.some(p => p.name === c)).length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">All contacts added</p>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Priority list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">
                  Priority order
                  {priorityList.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {priorityList.length}
                    </span>
                  )}
                </Label>
                {priorityList.length > 0 && (
                  <span className="text-xs text-muted-foreground">Drag to reorder</span>
                )}
              </div>

              {priorityList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center">
                  <Users className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">No contacts added yet</p>
                  <p className="text-xs text-muted-foreground/70">
                    {matchFormat === "doubles"
                      ? "Add at least 3 contacts for a doubles match"
                      : "Add from a list or individually above"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {priorityList.map((contact, index) => (
                    <div
                      key={contact.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-all",
                        draggedIndex === index
                          ? "border-primary bg-primary/5 shadow-md"
                          : "border-border/40 hover:border-primary/30"
                      )}
                    >
                      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing" />
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                        {index + 1}
                      </div>
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {contact.name[0]}
                      </div>
                      <span className="flex-1 text-sm font-medium">{contact.name}</span>
                      <button
                        onClick={() => removeContact(contact.id)}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Response window */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">Response window</Label>
                <span className="text-sm font-semibold text-primary">
                  {responseWindow < 60
                    ? `${responseWindow} min`
                    : responseWindow === 60
                    ? "1 hour"
                    : `${responseWindow / 60} hours`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                How long to wait before contacting the next person in line
              </p>
              <div className="flex gap-1.5">
                {[30, 60, 120, 240, 720, 1440].map((mins) => {
                  const label = mins < 60 ? `${mins}m` : mins === 60 ? "1h" : `${mins / 60}h`
                  return (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setResponseWindow(mins)}
                      className={cn(
                        "flex-1 rounded-md py-1.5 text-xs font-medium transition-all",
                        responseWindow === mins
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/50 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" size="lg" className="flex-1" onClick={() => setStep(2)}>
                <ChevronLeft className="mr-1 h-5 w-5" />
                Back
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={!canProceedStep2}
                onClick={() => setStep(4)}
                title={!canProceedStep2 ? `Add at least ${spotsNeeded} contact${spotsNeeded > 1 ? "s" : ""}` : undefined}
              >
                Continue
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
                Match Details
              </h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <CalendarIcon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="font-medium">{date ? format(date, "EEEE, MMMM d") : ""}</span>
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
                  <Users className="h-4 w-4 shrink-0 text-primary" />
                  <span className="capitalize">{sport}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="capitalize">{matchFormat}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="capitalize">{matchType}</span>
                </div>
              </div>
            </div>

            {/* Invite sequence preview */}
            <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-3">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Invite Sequence
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
                        First
                      </span>
                    )}
                  </div>
                ))}
                {priorityList.length > 5 && (
                  <p className="pl-8 text-xs text-muted-foreground">
                    +{priorityList.length - 5} more contacts
                  </p>
                )}
              </div>
            </div>

            {/* How it works */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                <Zap className="h-4 w-4" />
                How it works
              </h3>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  Invites are sent via WhatsApp, one at a time
                </li>
                <li className="flex items-start gap-2">
                  <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  You can run up to <strong>3 scheduling requests</strong> simultaneously
                </li>
                <li className="flex items-start gap-2">
                  <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  If someone declines or doesn&apos;t respond within{" "}
                  <strong>
                    {responseWindow < 60
                      ? `${responseWindow} min`
                      : responseWindow === 60
                      ? "1 hour"
                      : `${responseWindow / 60} hours`}
                  </strong>
                  , the next person is contacted
                </li>
                <li className="flex items-start gap-2">
                  <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                  Once accepted, a match is created and a WhatsApp group is set up
                </li>
              </ul>
            </div>

            {/* Copy invite link */}
            <div className="rounded-xl border border-border/40 bg-card px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Share invite link</p>
                  <p className="text-xs text-muted-foreground">
                    Anyone who accepts this link will override the ongoing scheduling
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={handleCopyInviteLink}
                >
                  {linkCopied ? (
                    <><Check className="h-3.5 w-3.5" />Copied</>
                  ) : (
                    <><Copy className="h-3.5 w-3.5" />Copy Link</>
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
                Back
              </Button>
              <Button
                size="lg"
                className="flex-1 bg-[#25D366] text-white hover:bg-[#25D366]/90"
                onClick={handleStartScheduling}
              >
                <Zap className="mr-2 h-5 w-5" />
                Start Scheduling
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
