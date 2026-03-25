import { Badge } from "@/components/ui/badge"
import { useTranslation } from "@/lib/i18n"

interface MatchTypeBadgeProps {
  type: "competitive" | "practice"
  className?: string
}

export function MatchTypeBadge({ type, className }: MatchTypeBadgeProps) {
  const { t } = useTranslation()
  if (type === "competitive") {
    return (
      <Badge
        className={`border-0 bg-competitive/10 text-competitive text-sm hover:bg-competitive/15 ${className || ""}`}
      >
        {t("common.competitive")}
      </Badge>
    )
  }
  return (
    <Badge
      className={`border-0 bg-practice/10 text-practice text-sm hover:bg-practice/15 ${className || ""}`}
    >
      {t("common.practice")}
    </Badge>
  )
}
