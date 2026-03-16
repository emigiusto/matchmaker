import { useState, useEffect, useCallback } from "react"
import {
  Plus, Pencil, Trash2, List, UserPlus, Search, Loader2, X, Check, BookUser, ChevronDown, ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/page-header"
import { PhoneInput } from "@/components/phone-input"
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
import { toast } from "sonner"
import { useTranslation } from "@/lib/i18n/use-translation"
import { getCurrentUserId } from "@/lib/current-user"
import { contactsService, type ContactDTO, type ContactListDTO } from "@/lib/services/contacts.service"
import { validatePhoneE164 } from "@/lib/phone.utils"

export default function Contacts() {
  const { t } = useTranslation()
  const currentUserId = getCurrentUserId()

  const [contacts, setContacts] = useState<ContactDTO[]>([])
  const [lists, setLists] = useState<ContactListDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [expandedListId, setExpandedListId] = useState<string | null>(null)

  // New contact dialog
  const [newContactOpen, setNewContactOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
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

  // Inline name edit
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState("")
  const [savingName, setSavingName] = useState(false)

  // Add to list
  const [addingToList, setAddingToList] = useState<ContactDTO | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [cs, ls] = await Promise.all([
        contactsService.list(currentUserId),
        contactsService.listLists(currentUserId),
      ])
      setContacts(cs)
      setLists(ls)
    } catch {
      toast.error(t("wizard.toast.loadContactsFailed"))
    }
  }, [currentUserId])

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
  }, [refresh])

  // ─── Create contact ───────────────────────────────────────

  async function handleCreateContact() {
    const name = newName.trim()
    const phone = newPhone.trim()
    if (!name || !phone) return
    const validation = validatePhoneE164(phone)
    if (!validation.valid) { toast.error(validation.error); return }
    setCreatingContact(true)
    try {
      await contactsService.create(currentUserId, name, phone)
      toast.success(t("contactsPage.toast.contactCreated"))
      setNewContactOpen(false)
      setNewName("")
      setNewPhone("")
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

  // ─── Inline name edit ─────────────────────────────────────

  async function handleSaveName() {
    if (!editingNameId) return
    const name = editingNameValue.trim()
    if (!name) { setEditingNameId(null); return }
    setSavingName(true)
    try {
      await contactsService.updateName(editingNameId, currentUserId, name)
      setEditingNameId(null)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    } finally {
      setSavingName(false)
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

  // ─── Add / remove from list ───────────────────────────────

  async function handleAddToList(listId: string, contactId: string) {
    try {
      await contactsService.addMemberToList(listId, contactId, currentUserId)
      toast.success(t("contactsPage.toast.memberAdded"))
      setAddingToList(null)
      await refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contactsPage.toast.saveFailed"))
    }
  }

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
    (c) => !search.trim() || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
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
          <Button size="sm" className="gap-1.5" onClick={() => setNewContactOpen(true)}>
            <UserPlus className="h-4 w-4" />
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
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{contacts.length}</span>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("common.search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              {filteredContacts.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <p className="text-center text-base text-muted-foreground">
                      {contacts.length === 0 ? t("contactsPage.noContacts") : t("common.noResults")}
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
                    {filteredContacts.map((c) => (
                      <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {c.name[0]?.toUpperCase()}
                        </div>

                        <div className="min-w-0 flex-1">
                          {editingNameId === c.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                className="h-7 py-1 text-sm"
                                value={editingNameValue}
                                onChange={(e) => setEditingNameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveName()
                                  if (e.key === "Escape") setEditingNameId(null)
                                }}
                                autoFocus
                              />
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleSaveName} disabled={savingName}>
                                {savingName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingNameId(null)}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <p className="truncate text-sm font-medium">{c.name}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{c.phone}</p>
                          {c.linkedUserId && (
                            <span className="inline-block rounded-full bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
                              {t("contactsPage.linkedUser")}
                            </span>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-0.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            title={t("contactsPage.editName")}
                            onClick={() => { setEditingNameId(c.id); setEditingNameValue(c.name) }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            title={t("contactsPage.addToList")}
                            onClick={() => setAddingToList(c)}
                          >
                            <List className="h-3.5 w-3.5" />
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
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right: lists */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">{t("contactsPage.lists")}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{lists.length}</span>
              </div>

              {lists.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-10">
                    <p className="text-center text-sm text-muted-foreground">{t("contactsPage.noLists")}</p>
                    <p className="mt-1 text-center text-xs text-muted-foreground">{t("contactsPage.noListsDesc")}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {lists.map((l) => (
                    <Card key={l.id} className="border-border/50">
                      <CardHeader className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            className="flex flex-1 items-center gap-2 text-left"
                            onClick={() => setExpandedListId(expandedListId === l.id ? null : l.id)}
                          >
                            {expandedListId === l.id
                              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            <CardTitle className="text-sm font-medium">{l.name}</CardTitle>
                            <span className="text-xs text-muted-foreground">({l.members.length})</span>
                          </button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground"
                            title={t("contactsPage.renameList")}
                            onClick={() => { setRenamingList(l); setRenameValue(l.name) }}
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
                            <p className="text-xs text-muted-foreground italic">{t("contactsPage.noContacts")}</p>
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
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("form.cancel")}</Button>
            </DialogClose>
            <Button onClick={handleCreateContact} disabled={!newName.trim() || !newPhone.trim() || creatingContact}>
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

      {/* ── Add to list dialog ─────────────────────────────── */}
      <Dialog open={!!addingToList} onOpenChange={(o) => !o && setAddingToList(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("contactsPage.addToList")}: {addingToList?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1 py-2 max-h-60 overflow-y-auto">
            {lists.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("contactsPage.noLists")}</p>
            )}
            {lists.map((l) => {
              const alreadyIn = l.members.some((m) => m.id === addingToList?.id)
              return (
                <button
                  key={l.id}
                  disabled={alreadyIn}
                  onClick={() => addingToList && handleAddToList(l.id, addingToList.id)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                >
                  <span>{l.name}</span>
                  {alreadyIn && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
              )
            })}
          </div>
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
