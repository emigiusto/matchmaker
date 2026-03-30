import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import {
  Plus, Pencil, Trash2, Search, Loader2, BookUser, Users, List, GripVertical, X,
} from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/page-header"
import { PhoneInput } from "@/components/phone-input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { useTranslation } from "@/lib/i18n/use-translation"
import { getCurrentUserId } from "@/lib/current-user"
import { contactsService, type ContactDTO, type ContactListDTO } from "@/lib/services/contacts.service"
import { bookingService, SUPPORTED_CLUBS, type ClubMembershipDTO } from "@/lib/services/booking.service"
import { validatePhoneE164 } from "@/lib/phone.utils"
import { apiClient } from "@/lib/services/api-client"

function clubLabel(clubSlug: string): string {
  return SUPPORTED_CLUBS.find((c) => c.clubSlug === clubSlug)?.label ?? clubSlug
}

// ─── Sortable list member row (inside Manage dialog) ─────────

function SortableListMemberRow({
  contact,
  index,
  onRemove,
}: {
  contact: ContactDTO
  index: number
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: contact.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 shadow-sm"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
        {index + 1}
      </span>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {contact.name[0]?.toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{contact.name}</p>
        <p className="truncate text-xs text-muted-foreground">{contact.phone}</p>
      </div>
      <Badge variant="outline" className="h-5 shrink-0 px-1.5 py-0 text-[10px] text-muted-foreground">
        {contact.communicationLanguage === "en" ? "EN" : "ES"}
      </Badge>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────

export default function Contacts() {
  const { t, language } = useTranslation()
  const currentUserId = getCurrentUserId()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  const [contacts, setContacts] = useState<ContactDTO[]>([])
  const [lists, setLists] = useState<ContactListDTO[]>([])
  const [memberships, setMemberships] = useState<ClubMembershipDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  // New contact dialog
  const [newContactOpen, setNewContactOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const [newCommLang, setNewCommLang] = useState<"es" | "en">("es")
  const [creatingContact, setCreatingContact] = useState(false)

  // New list dialog
  const [newListOpen, setNewListOpen] = useState(false)
  const [newListName, setNewListName] = useState("")
  const [creatingList, setCreatingList] = useState(false)

  // Edit contact dialog
  const [editingContact, setEditingContact] = useState<ContactDTO | null>(null)
  const [editName, setEditName] = useState("")
  const [editCommLang, setEditCommLang] = useState<"es" | "en">("es")
  const [editSocioInputs, setEditSocioInputs] = useState<Record<string, string>>({})
  const [editListIds, setEditListIds] = useState<Set<string>>(new Set())
  const [savingEdit, setSavingEdit] = useState(false)

  // Delete dialogs
  const [deletingContact, setDeletingContact] = useState<ContactDTO | null>(null)
  const [deletingList, setDeletingList] = useState<ContactListDTO | null>(null)

  // Manage list dialog
  const [managingList, setManagingList] = useState<ContactListDTO | null>(null)
  const [managedMembers, setManagedMembers] = useState<ContactDTO[]>([])
  const [managedListName, setManagedListName] = useState("")
  const [editingListName, setEditingListName] = useState(false)
  const [savingListName, setSavingListName] = useState(false)
  const [addMemberSearch, setAddMemberSearch] = useState("")
  const listNameInputRef = useRef<HTMLInputElement>(null)

  // ─── Data fetching ────────────────────────────────────────

  const refresh = useCallback(async () => {
    const [cs, ls] = await Promise.all([
      contactsService.list(currentUserId),
      contactsService.listLists(currentUserId),
    ])
    setContacts(cs)
    setLists(ls)
  }, [currentUserId])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      refresh(),
      bookingService.listMemberships(currentUserId).then(setMemberships).catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [refresh, currentUserId])

  // ─── Derived ──────────────────────────────────────────────

  const contactListMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const l of lists) {
      for (const m of l.members) {
        if (!map[m.id]) map[m.id] = []
        map[m.id].push(l.name)
      }
    }
    return map
  }, [lists])

  const filteredContacts = contacts.filter(
    (c) =>
      !search.trim() ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search),
  )

  // ─── Edit contact dialog ──────────────────────────────────

  function openEdit(c: ContactDTO) {
    setEditingContact(c)
    setEditName(c.name)
    setEditCommLang((c.communicationLanguage === "en" ? "en" : "es") as "es" | "en")
    setEditSocioInputs({ ...c.socioNumbers })
    setEditListIds(
      new Set(lists.filter((l) => l.members.some((m) => m.id === c.id)).map((l) => l.id)),
    )
  }

  async function handleSaveEdit() {
    if (!editingContact) return
    setSavingEdit(true)
    try {
      const nameChanged = editName.trim() !== editingContact.name
      const langChanged = editCommLang !== editingContact.communicationLanguage

      const newSocioNumbers: Record<string, string> = { ...editingContact.socioNumbers }
      for (const ms of memberships) {
        const val = (editSocioInputs[ms.clubSlug] ?? "").trim()
        if (val) {
          newSocioNumbers[ms.clubSlug] = val
        } else {
          delete newSocioNumbers[ms.clubSlug]
        }
      }
      const socioChanged =
        JSON.stringify(newSocioNumbers) !== JSON.stringify(editingContact.socioNumbers)

      if (nameChanged || socioChanged || langChanged) {
        const patch: Record<string, unknown> = { ownerUserId: currentUserId }
        if (nameChanged) patch.name = editName.trim()
        if (socioChanged) patch.socioNumbers = newSocioNumbers
        if (langChanged) patch.communicationLanguage = editCommLang
        await apiClient.patch(`/contacts/${editingContact.id}`, patch)
      }

      const originalListIds = new Set(
        lists.filter((l) => l.members.some((m) => m.id === editingContact.id)).map((l) => l.id),
      )
      const listOps: Promise<unknown>[] = []
      for (const listId of editListIds) {
        if (!originalListIds.has(listId)) {
          listOps.push(contactsService.addMemberToList(listId, editingContact.id, currentUserId))
        }
      }
      for (const listId of originalListIds) {
        if (!editListIds.has(listId)) {
          listOps.push(
            contactsService.removeMemberFromList(listId, editingContact.id, currentUserId),
          )
        }
      }
      await Promise.all(listOps)

      await refresh()
      toast.success(t("contactsPage.toast.contactUpdated"))
      setEditingContact(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    } finally {
      setSavingEdit(false)
    }
  }

  // ─── Create contact ───────────────────────────────────────

  async function handleCreateContact() {
    const name = newName.trim()
    const phone = newPhone.trim()
    if (!name || !phone) return
    const validation = validatePhoneE164(phone)
    if (!validation.valid) { toast.error(validation.error); return }
    setCreatingContact(true)
    try {
      await contactsService.create(currentUserId, name, phone, newCommLang)
      toast.success(t("contactsPage.toast.contactCreated"))
      setNewContactOpen(false)
      setNewName("")
      setNewPhone("")
      setNewCommLang(language as "es" | "en")
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    } finally {
      setCreatingContact(false)
    }
  }

  // ─── Delete contact ───────────────────────────────────────

  async function handleDeleteContact(contact: ContactDTO) {
    try {
      await contactsService.delete(contact.id, currentUserId)
      toast.success(t("contactsPage.toast.contactDeleted"))
      setDeletingContact(null)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    }
  }

  // ─── Create list ──────────────────────────────────────────

  async function handleCreateList() {
    const name = newListName.trim()
    if (!name) return
    setCreatingList(true)
    try {
      await contactsService.createList(currentUserId, name)
      toast.success(t("contactsPage.toast.listCreated"))
      setNewListOpen(false)
      setNewListName("")
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    } finally {
      setCreatingList(false)
    }
  }

  // ─── Delete list ──────────────────────────────────────────

  async function handleDeleteList(list: ContactListDTO) {
    try {
      await contactsService.deleteList(list.id, currentUserId)
      toast.success(t("contactsPage.toast.listDeleted"))
      setDeletingList(null)
      if (managingList?.id === list.id) setManagingList(null)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    }
  }

  // ─── Manage list dialog ───────────────────────────────────

  function openManageList(l: ContactListDTO) {
    setManagingList(l)
    setManagedMembers([...l.members])
    setManagedListName(l.name)
    setEditingListName(false)
    setAddMemberSearch("")
  }

  function syncManagedListToState(listId: string, newMembers: ContactDTO[]) {
    setManagedMembers(newMembers)
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, members: newMembers } : l)),
    )
  }

  async function handleSaveListName() {
    if (!managingList) return
    const name = managedListName.trim()
    if (!name || name === managingList.name) { setEditingListName(false); return }
    setSavingListName(true)
    try {
      await contactsService.renameList(managingList.id, currentUserId, name)
      setManagingList((prev) => prev ? { ...prev, name } : prev)
      setLists((prev) => prev.map((l) => (l.id === managingList.id ? { ...l, name } : l)))
      setEditingListName(false)
      toast.success(t("contactsPage.toast.listRenamed"))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    } finally {
      setSavingListName(false)
    }
  }

  async function handleMemberDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !managingList) return
    const oldIndex = managedMembers.findIndex((m) => m.id === active.id)
    const newIndex = managedMembers.findIndex((m) => m.id === over.id)
    const newOrder = arrayMove(managedMembers, oldIndex, newIndex)
    syncManagedListToState(managingList.id, newOrder)
    try {
      await contactsService.reorderListMembers(
        managingList.id,
        currentUserId,
        newOrder.map((m) => m.id),
      )
    } catch {
      // revert
      syncManagedListToState(managingList.id, managedMembers)
      toast.error(t("contactsPage.toast.saveFailed"))
    }
  }

  async function handleRemoveFromManaged(contactId: string) {
    if (!managingList) return
    const newMembers = managedMembers.filter((m) => m.id !== contactId)
    syncManagedListToState(managingList.id, newMembers)
    try {
      await contactsService.removeMemberFromList(managingList.id, contactId, currentUserId)
      toast.success(t("contactsPage.toast.memberRemoved"))
    } catch (e) {
      syncManagedListToState(managingList.id, managedMembers)
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    }
  }

  async function handleAddToManaged(contact: ContactDTO) {
    if (!managingList) return
    const newMembers = [...managedMembers, contact]
    syncManagedListToState(managingList.id, newMembers)
    setAddMemberSearch("")
    try {
      await contactsService.addMemberToList(managingList.id, contact.id, currentUserId)
      toast.success(t("contactsPage.toast.memberAdded"))
    } catch (e) {
      syncManagedListToState(managingList.id, managedMembers)
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    }
  }

  const managedMemberIds = useMemo(() => new Set(managedMembers.map((m) => m.id)), [managedMembers])

  const addableCandidates = useMemo(() => {
    const q = addMemberSearch.toLowerCase()
    return contacts.filter(
      (c) =>
        !managedMemberIds.has(c.id) &&
        (!q || c.name.toLowerCase().includes(q) || c.phone.includes(q)),
    )
  }, [contacts, managedMemberIds, addMemberSearch])

  // ─── Render ───────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title={t("contactsPage.pageTitle")}
        description={t("contactsPage.pageDescription")}
      />

      <div className="flex flex-1 flex-col gap-6 p-5 lg:p-8">

        {/* ── Info section ─────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="mb-1.5 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">{t("contactsPage.contactsAboutTitle")}</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("contactsPage.contactsAbout")}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="mb-1.5 flex items-center gap-2">
              <List className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">{t("contactsPage.listsAboutTitle")}</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("contactsPage.listsAbout")}
            </p>
          </div>
        </div>

        {/* ── Action bar ───────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => { setNewCommLang(language as "es" | "en"); setNewContactOpen(true) }}
          >
            <Plus className="h-4 w-4" />
            {t("contactsPage.newContact")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => setNewListOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {t("contactsPage.newList")}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">

            {/* ── Left: contacts ─────────────────────────── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <BookUser className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">{t("contactsPage.allContacts")}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {contacts.length}
                </span>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("contacts.searchContacts")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {filteredContacts.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <p className="text-center text-base text-muted-foreground">
                      {contacts.length === 0
                        ? t("contactsPage.noContacts")
                        : t("common.noResults")}
                    </p>
                    {contacts.length === 0 && (
                      <p className="mt-1 text-center text-sm text-muted-foreground">
                        {t("contactsPage.noContactsDesc")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="divide-y divide-border/40 p-0">
                    {filteredContacts.map((c) => {
                      const memberOfLists = contactListMap[c.id] ?? []
                      const socioEntries = Object.entries(c.socioNumbers)
                      return (
                        <div key={c.id} className="flex items-start gap-3 px-4 py-3">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {c.name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">{c.phone}</p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {c.linkedUserId && !c.linkedUserIsGuest && (
                                <Badge
                                  variant="outline"
                                  className="h-5 px-1.5 py-0 text-[10px] font-medium border-green-300 text-green-700 dark:border-green-800 dark:text-green-400"
                                >
                                  {t("contactsPage.linkedUser")}
                                </Badge>
                              )}
                              <Badge variant="outline" className="h-5 px-1.5 py-0 text-[10px] text-muted-foreground">
                                {c.communicationLanguage === "en" ? "EN" : "ES"}
                              </Badge>
                              {socioEntries.map(([slug, num]) => (
                                <Badge key={slug} variant="secondary" className="h-5 px-1.5 py-0 text-[10px]">
                                  {clubLabel(slug)} · {num}
                                </Badge>
                              ))}
                              {memberOfLists.map((name) => (
                                <Badge key={name} variant="outline" className="h-5 px-1.5 py-0 text-[10px] text-muted-foreground">
                                  {name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="mt-0.5 flex shrink-0 items-center gap-0.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              title={t("contactsPage.editContact")}
                              onClick={() => openEdit(c)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              title={t("contactsPage.deleteContact")}
                              onClick={() => setDeletingContact(c)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ── Right: lists ───────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">{t("contactsPage.lists")}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {lists.length}
                </span>
              </div>

              {lists.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-10">
                    <p className="text-center text-sm text-muted-foreground">
                      {t("contactsPage.noLists")}
                    </p>
                    <p className="mt-1 text-center text-xs text-muted-foreground">
                      {t("contactsPage.noListsDesc")}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {lists.map((l) => (
                    <Card key={l.id} className="border-border/50">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-2">
                          {/* Name + member count */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{l.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {l.members.length === 1
                                ? t("contactsPage.membersCount", { count: "1" })
                                : t("contactsPage.membersCount_plural", { count: String(l.members.length) })}
                            </p>
                            {/* Avatar stack preview */}
                            {l.members.length > 0 && (
                              <div className="mt-2 flex items-center gap-1">
                                <div className="flex -space-x-1.5">
                                  {l.members.slice(0, 4).map((m) => (
                                    <div
                                      key={m.id}
                                      className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary/10 text-[9px] font-semibold text-primary"
                                      title={m.name}
                                    >
                                      {m.name[0]?.toUpperCase()}
                                    </div>
                                  ))}
                                  {l.members.length > 4 && (
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] text-muted-foreground">
                                      +{l.members.length - 4}
                                    </div>
                                  )}
                                </div>
                                {/* First two names preview */}
                                <span className="truncate text-[10px] text-muted-foreground">
                                  {l.members
                                    .slice(0, 2)
                                    .map((m) => m.name.split(" ")[0])
                                    .join(", ")}
                                  {l.members.length > 2 ? "…" : ""}
                                </span>
                              </div>
                            )}
                          </div>
                          {/* Actions */}
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => openManageList(l)}
                            >
                              {t("contactsPage.manageList")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                              title={t("contactsPage.deleteList")}
                              onClick={() => setDeletingList(l)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Manage list dialog ─────────────────────────────── */}
      <Dialog open={!!managingList} onOpenChange={(o) => !o && setManagingList(null)}>
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-4">
            {editingListName ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={listNameInputRef}
                  value={managedListName}
                  onChange={(e) => setManagedListName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveListName()
                    if (e.key === "Escape") setEditingListName(false)
                  }}
                  className="h-8 text-base font-semibold"
                  autoFocus
                />
                <Button size="sm" onClick={handleSaveListName} disabled={savingListName}>
                  {savingListName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("form.save")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingListName(false)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <DialogTitle className="flex-1 truncate">{managingList?.name}</DialogTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground"
                  onClick={() => {
                    setManagedListName(managingList?.name ?? "")
                    setEditingListName(true)
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-4 gap-5">

            {/* Members section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t("contactsPage.dragToReorder")}
                </p>
                <span className="text-xs text-muted-foreground">{managedMembers.length}</span>
              </div>

              {managedMembers.length === 0 ? (
                <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
                  {t("contactsPage.noMembersYet")}
                </p>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleMemberDragEnd}
                >
                  <SortableContext
                    items={managedMembers.map((m) => m.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1.5">
                      {managedMembers.map((m, i) => (
                        <SortableListMemberRow
                          key={m.id}
                          contact={m}
                          index={i}
                          onRemove={() => handleRemoveFromManaged(m.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>

            <Separator />

            {/* Add contacts section */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("contactsPage.addMembersTitle")}
              </p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("contactsPage.addMembersSearch")}
                  value={addMemberSearch}
                  onChange={(e) => setAddMemberSearch(e.target.value)}
                  className="h-8 pl-8 text-sm"
                />
              </div>
              {addableCandidates.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  {t("contactsPage.noMoreContacts")}
                </p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {addableCandidates.map((c) => (
                    <button
                      key={c.id}
                      className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted"
                      onClick={() => handleAddToManaged(c)}
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t px-6 py-3">
            <DialogClose asChild>
              <Button variant="outline" className="w-full">{t("form.close")}</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Edit contact dialog ────────────────────────────── */}
      <Dialog open={!!editingContact} onOpenChange={(o) => !o && setEditingContact(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("contactsPage.editContact")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t("contactsPage.namePlaceholder")}</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("contactsPage.phonePlaceholder")}</Label>
              <Input value={editingContact?.phone ?? ""} readOnly className="text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t("contactsPage.phoneImmutable")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("contactsPage.communicationLanguage")}</Label>
              <div className="flex gap-2">
                {(["es", "en"] as const).map((lang) => (
                  <Button
                    key={lang}
                    type="button"
                    size="sm"
                    variant={editCommLang === lang ? "default" : "outline"}
                    onClick={() => setEditCommLang(lang)}
                  >
                    {lang === "es" ? "Español" : "English"}
                  </Button>
                ))}
              </div>
            </div>
            {memberships.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <Label>{t("contactsPage.clubSocioNumbers")}</Label>
                  {memberships.map((ms) => (
                    <div key={ms.clubSlug} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 truncate text-sm text-muted-foreground">
                        {clubLabel(ms.clubSlug)}
                      </span>
                      <Input
                        className="h-8 text-sm"
                        placeholder={t("contactsPage.socioPlaceholder")}
                        value={editSocioInputs[ms.clubSlug] ?? ""}
                        onChange={(e) =>
                          setEditSocioInputs((prev) => ({ ...prev, [ms.clubSlug]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
            {lists.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>{t("contactsPage.lists")}</Label>
                  {lists.map((l) => (
                    <div key={l.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`list-${l.id}`}
                        checked={editListIds.has(l.id)}
                        onCheckedChange={(checked) =>
                          setEditListIds((prev) => {
                            const next = new Set(prev)
                            checked ? next.add(l.id) : next.delete(l.id)
                            return next
                          })
                        }
                      />
                      <label htmlFor={`list-${l.id}`} className="cursor-pointer text-sm">
                        {l.name}
                      </label>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("form.cancel")}</Button>
            </DialogClose>
            <Button onClick={handleSaveEdit} disabled={!editName.trim() || savingEdit}>
              {savingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("form.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New contact dialog ─────────────────────────────── */}
      <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("contactsPage.newContactTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="mb-1 block text-sm">{t("contactsPage.namePlaceholder")}</Label>
              <Input
                placeholder={t("contactsPage.namePlaceholder")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateContact()}
              />
            </div>
            <div>
              <Label className="mb-1 block text-sm">{t("contactsPage.phonePlaceholder")}</Label>
              <PhoneInput value={newPhone} onChange={setNewPhone} defaultCountryCode="34" />
            </div>
            <div>
              <Label className="mb-1 block text-sm">{t("contactsPage.communicationLanguage")}</Label>
              <div className="flex gap-2">
                {(["es", "en"] as const).map((lang) => (
                  <Button
                    key={lang}
                    type="button"
                    size="sm"
                    variant={newCommLang === lang ? "default" : "outline"}
                    onClick={() => setNewCommLang(lang)}
                  >
                    {lang === "es" ? "Español" : "English"}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("form.cancel")}</Button>
            </DialogClose>
            <Button
              onClick={handleCreateContact}
              disabled={!newName.trim() || !newPhone.trim() || creatingContact}
            >
              {creatingContact ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("wizard.addButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New list dialog ────────────────────────────────── */}
      <Dialog open={newListOpen} onOpenChange={setNewListOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("contactsPage.newListTitle")}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder={t("contactsPage.listNamePlaceholder")}
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateList()}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("form.cancel")}</Button>
            </DialogClose>
            <Button onClick={handleCreateList} disabled={!newListName.trim() || creatingList}>
              {creatingList ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("wizard.addButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete contact alert ───────────────────────────── */}
      <AlertDialog open={!!deletingContact} onOpenChange={(o) => !o && setDeletingContact(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("contactsPage.confirmDeleteContact", { name: deletingContact?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("contactsPage.confirmDeleteContactDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("form.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingContact && handleDeleteContact(deletingContact)}
            >
              {t("form.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete list alert ──────────────────────────────── */}
      <AlertDialog open={!!deletingList} onOpenChange={(o) => !o && setDeletingList(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("contactsPage.confirmDeleteList", { name: deletingList?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("contactsPage.confirmDeleteListDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("form.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingList && handleDeleteList(deletingList)}
            >
              {t("form.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
