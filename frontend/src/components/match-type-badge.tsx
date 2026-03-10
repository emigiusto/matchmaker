import { Badge } from "@/components/ui/badge"

interface MatchTypeBadgeProps {
  type: "competitive" | "practice"
  className?: string
}

export function MatchTypeBadge({ type, className }: MatchTypeBadgeProps) {
  if (type === "competitive") {
    return (
      <Badge
        className={`border-0 bg-competitive/10 text-competitive text-sm hover:bg-competitive/15 ${className || ""}`}
      >
        Competitive
      </Badge>
    )
  }
  return (
    <Badge
      className={`border-0 bg-practice/10 text-practice text-sm hover:bg-practice/15 ${className || ""}`}
    >
      Practice
    </Badge>
  )
}
