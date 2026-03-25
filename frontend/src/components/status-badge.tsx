import { Badge } from "@/components/ui/badge"
import { useTranslation } from "@/lib/i18n/use-translation"

const statusClassNames: Record<string, string> = {
  scheduled:             "border-0 bg-primary/10 text-primary text-sm",
  awaiting_result:       "border-0 bg-chart-4/15 text-chart-4 text-sm",
  awaiting_confirmation: "border-0 bg-chart-4/15 text-chart-4 text-sm",
  completed:             "border-0 bg-primary/10 text-primary text-sm",
  cancelled:             "border-0 bg-destructive/10 text-destructive text-sm font-semibold",
  disputed:              "border-0 bg-destructive/10 text-destructive text-sm",
  pending:               "border-0 bg-chart-4/15 text-chart-4 text-sm",
  confirmed:             "border-0 bg-primary/10 text-primary text-sm",
  accepted:              "border-0 bg-primary/10 text-primary text-sm",
  declined:              "border-0 bg-muted text-muted-foreground text-sm",
  expired:               "border-0 bg-muted text-muted-foreground text-sm",
}

const statusI18nKeys: Record<string, string> = {
  scheduled:             "common.statusScheduled",
  awaiting_result:       "common.statusAwaitingResult",
  awaiting_confirmation: "common.statusAwaiting",
  completed:             "common.statusCompleted",
  cancelled:             "common.cancelled",
  disputed:              "common.statusDisputedLabel",
  pending:               "common.statusPending",
  confirmed:             "common.confirmed",
  accepted:              "common.statusAccepted",
  declined:              "common.statusDeclined",
  expired:               "common.statusExpired",
}

interface StatusBadgeProps {
  status: keyof typeof statusClassNames
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation()
  const cls = statusClassNames[status] ?? "border-0 bg-muted text-muted-foreground text-sm"
  const label = statusI18nKeys[status] ? t(statusI18nKeys[status]) : status
  return (
    <Badge className={`${cls} ${className || ""}`}>
      {label}
    </Badge>
  )
}
