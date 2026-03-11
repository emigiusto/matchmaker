import { Badge } from "@/components/ui/badge"

const statusConfig = {
  scheduled: { label: "Scheduled", className: "border-0 bg-primary/10 text-primary text-sm" },
  awaiting_confirmation: { label: "Awaiting", className: "border-0 bg-chart-4/15 text-chart-4 text-sm" },
  completed: { label: "Completed", className: "border-0 bg-primary/10 text-primary text-sm" },
  cancelled: { label: "Cancelled", className: "border-0 bg-destructive/10 text-destructive text-sm font-semibold" },
  disputed: { label: "Disputed", className: "border-0 bg-destructive/10 text-destructive text-sm" },
  pending: { label: "Pending", className: "border-0 bg-chart-4/15 text-chart-4 text-sm" },
  confirmed: { label: "Confirmed", className: "border-0 bg-primary/10 text-primary text-sm" },
  accepted: { label: "Accepted", className: "border-0 bg-primary/10 text-primary text-sm" },
  declined: { label: "Declined", className: "border-0 bg-muted text-muted-foreground text-sm" },
  expired: { label: "Expired", className: "border-0 bg-muted text-muted-foreground text-sm" },
}

interface StatusBadgeProps {
  status: keyof typeof statusConfig
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status]
  return (
    <Badge className={`${config.className} ${className || ""}`}>
      {config.label}
    </Badge>
  )
}
