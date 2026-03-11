import { User, Users, Square } from "lucide-react"
import { cn } from "@/lib/utils"

export type SportFormat =
  | "tennis_singles"
  | "tennis_doubles"
  | "padel"

const config: Record<
  SportFormat,
  { label: string; icon: typeof User; className: string }
> = {
  tennis_singles: {
    label: "Tennis Singles",
    icon: User,
    className:
      "border-emerald-200/60 bg-emerald-500/8 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-500/10 dark:text-emerald-400",
  },
  tennis_doubles: {
    label: "Tennis Doubles",
    icon: Users,
    className:
      "border-emerald-200/60 bg-emerald-500/10 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-500/12 dark:text-emerald-400",
  },
  padel: {
    label: "Padel",
    icon: Square,
    className:
      "border-sky-200/60 bg-sky-500/8 text-sky-700 dark:border-sky-800/40 dark:bg-sky-500/10 dark:text-sky-400",
  },
}

function toSportFormat(
  sport: "tennis" | "padel",
  format: "singles" | "doubles"
): SportFormat {
  if (sport === "padel") return "padel"
  return format === "singles" ? "tennis_singles" : "tennis_doubles"
}

export interface SportFormatBadgeProps {
  sport: "tennis" | "padel"
  format: "singles" | "doubles"
  className?: string
  size?: "sm" | "default"
}

export function SportFormatBadge({
  sport,
  format,
  className,
  size = "default",
}: SportFormatBadgeProps) {
  const key = toSportFormat(sport, format)
  const { label, icon: Icon, className: styleClass } = config[key]
  const sizeClass = size === "sm" ? "gap-1 px-1.5 py-0 text-[10px]" : "gap-1.5 px-2.5 py-1 text-xs"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-medium [&>svg]:shrink-0",
        sizeClass,
        styleClass,
        className
      )}
      title={label}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {label}
    </span>
  )
}
