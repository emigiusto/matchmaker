import { useState, useEffect } from "react"
import { UserPlus, List, Search, Loader2, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { contactsService, type ContactDTO, type ContactListDTO } from "@/lib/services/contacts.service"
import { schedulingService } from "@/lib/services/scheduling.service"
import { deviceContactsService } from "@/lib/services/device-contacts.service"
import { useTranslation } from "@/lib/i18n"

interface AddContactsToInviteProps {
  requestId: string
  existingContactIds: string[]
  hostUserId: string
  onSuccess: () => void
  disabled?: boolean
}

export function AddContactsToInvite({
  requestId,
  existingContactIds,
  hostUserId,
  onSuccess,
  disabled,
}: AddContactsToInviteProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [contacts, setContacts] = useState<ContactDTO[]>([])
  const [lists, setLists] = useState<ContactListDTO[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [importingDevice, setImportingDevice] = useState(false)

  useEffect(() => {
    if (!open || !hostUserId) return
    setLoading(true)
    setSearch("")
    setSelectedIds(new Set())
    Promise.all([
      contactsService.list(hostUserId).catch(() => [] as ContactDTO[]),
      contactsService.listLists(hostUserId).catch(() => [] as ContactListDTO[]),
    ])
      .then(([cs, ls]) => {
        setContacts(cs.filter((c) => c.linkedUserId !== hostUserId))
        setLists(ls)
      })
      .catch(() => {
        setContacts([])
        setLists([])
        toast.error(t("wizard.toast.loadContactsFailed"))
      })
      .finally(() => setLoading(false))
  }, [open, hostUserId])

  // Resolve contact to userId (linkedUserId if available, else contactId as fallback key)
  const resolveId = (c: ContactDTO) => c.linkedUserId ?? c.id

  const filtered = contacts
    .filter((c) => !existingContactIds.includes(resolveId(c)))
    .filter((c) => !search.trim() || c.name.toLowerCase().includes(search.trim().toLowerCase()))

  async function handleAdd() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      toast.info(t("invites.selectAtLeastOne"))
      return
    }
    setAdding(true)
    try {
      await schedulingService.addCandidates(requestId, ids, hostUserId)
      toast.success(`${ids.length} contact(s) added`)
      setOpen(false)
      onSuccess()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("invites.failedToAddContacts"))
    } finally {
      setAdding(false)
    }
  }

  async function handleImportDeviceContacts() {
    setImportingDevice(true)
    try {
      const permission = await deviceContactsService.requestPermission()
      if (permission !== "granted") {
        toast.error(t("wizard.toast.contactPermissionDenied") || "Contact permission is required")
        return
      }
      const deviceContacts = await deviceContactsService.getContacts()
      if (deviceContacts.length === 0) {
        toast.info("No contacts with phone numbers found")
        return
      }
      let imported = 0
      for (const dc of deviceContacts) {
        const phone = dc.phones[0]
        if (!phone) continue
        try {
          const { user } = await contactsService.create(hostUserId, dc.name, phone)
          const userId = user.id
          if (userId === hostUserId || existingContactIds.includes(userId)) continue
          setSelectedIds((prev) => new Set(prev).add(userId))
          imported++
        } catch {
          // skip contacts that fail
        }
      }
      if (imported > 0) {
        toast.success(`Imported ${imported} contact${imported !== 1 ? "s" : ""}`)
        // Refresh contacts list to include newly created ones
        const cs = await contactsService.list(hostUserId).catch(() => [] as ContactDTO[])
        setContacts(cs.filter((c) => c.linkedUserId !== hostUserId))
      } else {
        toast.info("All device contacts are already added")
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to import device contacts")
    } finally {
      setImportingDevice(false)
    }
  }

  function toggleListMembers(list: ContactListDTO) {
    const toAdd = list.members
      .map(resolveId)
      .filter((id) => id !== hostUserId && !existingContactIds.includes(id))
    if (toAdd.length === 0) {
      toast.info(t("invites.allMembersAdded"))
      return
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      toAdd.forEach((id) => next.add(id))
      return next
    })
  }

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" disabled={disabled}>
          <UserPlus className="h-3.5 w-3.5" />
          {t("invites.addContacts")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <p className="mb-3 text-sm font-medium">{t("invites.addContactsToInvite")}</p>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {lists.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t("invites.fromList")}</p>
                <div className="flex flex-wrap gap-1">
                  {lists.map((l) => (
                    <Button
                      key={l.id}
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => toggleListMembers(l)}
                    >
                      <List className="mr-1 h-3 w-3" />
                      {l.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {/* Import from device contacts (native only) */}
            {deviceContactsService.isNative() && (
              <div className="mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-full gap-1.5 text-xs"
                  disabled={importingDevice}
                  onClick={handleImportDeviceContacts}
                >
                  {importingDevice ? <Loader2 className="h-3 w-3 animate-spin" /> : <Smartphone className="h-3 w-3" />}
                  {t("wizard.importFromDevice") || "Import from device"}
                </Button>
              </div>
            )}
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("invites.search")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8"
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-0.5 rounded border p-1">
              {filtered.slice(0, 50).map((c) => {
                const id = resolveId(c)
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleSelection(id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                      selectedIds.has(id) && "bg-primary/10"
                    )}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border">
                      {selectedIds.has(id) ? "✓" : ""}
                    </span>
                    <span className="flex-1">{c.name}</span>
                    {c.linkedUserId && (
                      <span className="text-[10px] text-muted-foreground">✓</span>
                    )}
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  {t("invites.noContactsToAdd")}
                </p>
              )}
            </div>
            <Button
              className="mt-3 w-full"
              size="sm"
              onClick={handleAdd}
              disabled={selectedIds.size === 0 || adding}
            >
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Add {selectedIds.size} contact{selectedIds.size !== 1 ? "s" : ""}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  )
}
