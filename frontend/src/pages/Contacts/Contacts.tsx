import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Plus, Pencil, Trash2, Search, Loader2, BookUser, ChevronDown, ChevronRight, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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

export default function Contacts() {
  const { t, language } = useTranslation()
  const currentUserId = getCurrentUserId()

  const [contacts, setContacts] = useState<ContactDTO[]>([])
  const [lists, setLists] = useState<ContactListDTO[]>([])
  const [memberships, setMemberships] = useState<ClubMembershipDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [expandedListId, setExpandedListId] = useState<string | null>(null)

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

  // Rename list dialog
  const [renamingList, setRenamingList] = useState<ContactListDTO | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [savingRename, setSavingRename] = useState(false)

  // Delete dialogs
  const [deletingContact, setDeletingContact] = useState<ContactDTO | null>(null)
  const [deletingList, setDeletingList] = useState<ContactListDTO | null>(null)

  // Edit contact dialog
  const [editingContact, setEditingContact] = useState<ContactDTO | null>(null)
  const [editName, setEditName] = useState("")
  const [editCommLang, setEditCommLang] = useState<"es" | "en">("es")
  const [editSocioInputs, setEditSocioInputs] = useState<Record<string, string>>({})
  const [editListIds, setEditListIds] = useState<Set<string>>(new Set())
  const [savingEdit, setSavingEdit] = useState(false)

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

  // ─── Derived: contactId → list names ─────────────────────

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

  // ─── Edit dialog ──────────────────────────────────────────

  function openEdit(c: ContactDTO) {
    setEditingContact(c)
    setEditName(c.name)
    setEditCommLang((c.communicationLanguage === "en" ? "en" : "es") as "es" | "en")
    setEditSocioInputs({ ...c.socioNumbers })
    setEditListIds(
      new Set(lists.filter((l) => l.members.some((m) => m.id === c.id)).map((l) => l.id))
    )
  }

  async function handleSaveEdit() {
    if (!editingContact) return
    setSavingEdit(true)
    try {
      const nameChanged = editName.trim() !== editingContact.name
      const langChanged = editCommLang !== editingContact.communicationLanguage

      // Build merged socioNumbers from inputs
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

      // Single PATCH if name, socio, or language changed
      if (nameChanged || socioChanged || langChanged) {
        const patch: Record<string, unknown> = { ownerUserId: currentUserId }
        if (nameChanged) patch.name = editName.trim()
        if (socioChanged) patch.socioNumbers = newSocioNumbers
        if (langChanged) patch.communicationLanguage = editCommLang
        await apiClient.patch(`/contacts/${editingContact.id}`, patch)
      }

      // Diff list memberships
      const originalListIds = new Set(
        lists.filter((l) => l.members.some((m) => m.id === editingContact.id)).map((l) => l.id)
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
            contactsService.removeMemberFromList(listId, editingContact.id, currentUserId)
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

  // ─── Rename list ──────────────────────────────────────────

  async function handleRenameList() {
    if (!renamingList) return
    const name = renameValue.trim()
    if (!name) return
    setSavingRename(true)
    try {
      await contactsService.renameList(renamingList.id, currentUserId, name)
      toast.success(t("contactsPage.toast.listRenamed"))
      setRenamingList(null)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    } finally {
      setSavingRename(false)
    }
  }

  // ─── Delete list ──────────────────────────────────────────

  async function handleDeleteList(list: ContactListDTO) {
    try {
      await contactsService.deleteList(list.id, currentUserId)
      toast.success(t("contactsPage.toast.listDeleted"))
      setDeletingList(null)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    }
  }

  // ─── Remove from list (inline in lists panel) ─────────────

  async function handleRemoveFromList(listId: string, contactId: string) {
    try {
      await contactsService.removeMemberFromList(listId, contactId, currentUserId)
      toast.success(t("contactsPage.toast.memberRemoved"))
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    }
  }

  // ─── Filtered contacts ────────────────────────────────────

  const filteredContacts = contacts.filter(
    (c) =>
      !search.trim() ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  )

  // ─── Render ───────────────────────────────────────────────

  return (
    <>
      <PageHeader
        title={t("contactsPage.pageTitle")}
        description={t("contactsPage.pageDescription")}
      />

      <div className="flex flex-1 flex-col gap-6 p-5 lg:p-8">
        {/* Action bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="gap-1.5" onClick={() => { setNewCommLang(language as "es" | "en"); setNewContactOpen(true) }}>
            <Plus className="h-4 w-4" />
            {t("contactsPage.newContact")}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setNewListOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("contactsPage.newList")}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            {/* Left: contacts list */}
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

            {/* Right: lists */}
            <div className="space-y-4">
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
                      <CardHeader className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            className="flex flex-1 items-center gap-2 text-left"
                            onClick={() =>
                              setExpandedListId(expandedListId === l.id ? null : l.id)
                            }
                          >
                            {expandedListId === l.id ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <CardTitle className="text-sm font-medium">{l.name}</CardTitle>
                            <span className="text-xs text-muted-foreground">
                              ({l.members.length})
                            </span>
                          </button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground"
                            title={t("contactsPage.renameList")}
                            onClick={() => {
                              setRenamingList(l)
                              setRenameValue(l.name)
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            title={t("contactsPage.deleteList")}
                            onClick={() => setDeletingList(l)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardHeader>

                      {expandedListId === l.id && (
                        <CardContent className="px-4 pb-3 pt-0">
                          {l.members.length === 0 ? (
                            <p className="text-xs italic text-muted-foreground">
                              {t("contactsPage.noContacts")}
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {l.members.map((m) => (
                                <div key={m.id} className="flex items-center gap-2 rounded-md py-1">
                                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                    {m.name[0]?.toUpperCase()}
                                  </div>
                                  <span className="flex-1 text-xs">{m.name}</span>
                                  <button
                                    className="text-muted-foreground hover:text-destructive"
                                    title={t("contactsPage.removeFromList")}
                                    onClick={() => handleRemoveFromList(l.id, m.id)}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Edit contact dialog ────────────────────────────── */}
      <Dialog open={!!editingContact} onOpenChange={(o) => !o && setEditingContact(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("contactsPage.editContact")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label>{t("contactsPage.namePlaceholder")}</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                autoFocus
              />
            </div>

            {/* Phone — read-only */}
            <div className="space-y-1.5">
              <Label>{t("contactsPage.phonePlaceholder")}</Label>
              <Input
                value={editingContact?.phone ?? ""}
                readOnly
                className="text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">{t("contactsPage.phoneImmutable")}</p>
            </div>

            {/* Communication language */}
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

            {/* Socio numbers — one row per club membership */}
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
                          setEditSocioInputs((prev) => ({
                            ...prev,
                            [ms.clubSlug]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* List memberships */}
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

      {/* ── Rename list dialog ─────────────────────────────── */}
      <Dialog open={!!renamingList} onOpenChange={(o) => !o && setRenamingList(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("contactsPage.renameList")}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameList()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("form.cancel")}</Button>
            </DialogClose>
            <Button onClick={handleRenameList} disabled={!renameValue.trim() || savingRename}>
              {savingRename ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("form.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete contact alert ───────────────────────────── */}
      <AlertDialog
        open={!!deletingContact}
        onOpenChange={(o) => !o && setDeletingContact(null)}
      >
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
