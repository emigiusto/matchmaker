import { useState } from "react"
import { XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { matchesService } from "@/lib/services/matches.service"
import { toast } from "sonner"
import type { Match } from "@/lib/types"

interface CancelMatchButtonProps {
  matchId: string
  userId: string
  onSuccess?: (match: Match) => void
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
  size?: "default" | "sm" | "lg" | "icon"
  compact?: boolean
}

export function CancelMatchButton({
  matchId,
  userId,
  onSuccess,
  variant = "outline",
  size = "default",
  compact = false,
}: CancelMatchButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      const match = await matchesService.cancel(matchId, userId)
      setOpen(false)
      toast.success("Match cancelled")
      onSuccess?.(match)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to cancel match"
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} className="gap-2">
          <XCircle className={compact ? "h-4 w-4" : "h-5 w-5"} />
          {compact ? "Cancel" : "Cancel Match"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel match?</AlertDialogTitle>
          <AlertDialogDescription>
            This will cancel the match. Participants will no longer see it as scheduled. This action
            cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Keep</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              handleConfirm()
            }}
            disabled={loading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {loading ? "Cancelling…" : "Cancel match"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
