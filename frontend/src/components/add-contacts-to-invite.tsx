import { useState, useEffect } from "react"
import { UserPlus, List, Search, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { groupsService } from "@/lib/services/groups.service"
import { friendshipsService } from "@/lib/services/friendships.service"
import { usersService } from "@/lib/services/users.service"
import { schedulingService } from "@/lib/services/scheduling.service"
import { useTranslation } from "@/lib/i18n"

type AvailableContact =
  | { id: string; name: string; type: "user" }
  | { id: string; name: string; type: "guestContact"; phone: string }

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
  const [groups, setGroups] = useState<import("@/lib/services/groups.service").GroupWithMembersDTO[]>([])
  const [friends, setFriends] = useState<import("@/lib/services/friendships.service").Friend[]>([])
  const [availableContacts, setAvailableContacts] = useState<AvailableContact[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open || !hostUserId) return
    setLoading(true)
    setSearch("")
    setSelectedIds(new Set())
    Promise.all([
      groupsService.listWithMembers(hostUserId).catch(() => []),
      friendshipsService.listFriends(hostUserId).catch(() => []),
      usersService.getAll(),
    ])
      .then(([g, f, users]) => {
        const withPhone = users.filter(
          (u) => u.phone && u.id !== hostUserId && (u.name || u.email || u.id)
        )
        setGroups(g)
        setFriends(f.filter((x) => x.type === "user"))
        const userContacts: AvailableContact[] = withPhone.map((u) => ({
          id: u.id,
          name: u.name || u.email || t("common.unknown"),
          type: "user" as const,
        }))
        setAvailableContacts(userContacts)
      })
      .catch(() => {
        setGroups([])
        setFriends([])
        setAvailableContacts([])
        toast.error(t("wizard.toast.loadContactsFailed"))
      })
      .finally(() => setLoading(false))
  }, [open, hostUserId])

  const allOptions = [
    ...availableContacts.filter((c) => c.type === "user"),
    ...friends.map((f) => ({ id: f.id, name: f.name })),
  ]
  const deduped = allOptions.filter(
    (o, i, arr) => arr.findIndex((x) => x.id === o.id) === i && !existingContactIds.includes(o.id)
  )
  const filtered = deduped.filter(
    (o) => !search.trim() || o.name.toLowerCase().includes(search.trim().toLowerCase())
  )

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

  function toggleGroupMembers(group: import("@/lib/services/groups.service").GroupWithMembersDTO) {
    const toAdd = group.members
      .filter((m) => m.id !== hostUserId && m.phone && !existingContactIds.includes(m.id))
      .map((m) => m.id)
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
            {groups.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t("invites.fromList")}</p>
                <div className="flex flex-wrap gap-1">
                  {groups.map((g) => (
                    <Button
                      key={g.id}
                      variant="secondary"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => toggleGroupMembers(g)}
                    >
                      <List className="mr-1 h-3 w-3" />
                      {g.name}
                    </Button>
                  ))}
                </div>
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
              {filtered.slice(0, 50).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleSelection(o.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted",
                    selectedIds.has(o.id) && "bg-primary/10"
                  )}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border">
                    {selectedIds.has(o.id) ? "✓" : ""}
                  </span>
                  {o.name}
                </button>
              ))}
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
