import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { NotificationsDropdown } from "@/components/notifications-dropdown"

interface PageHeaderProps {
  title: string
  description?: string
  children?: React.ReactNode
}

export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <header className="flex h-20 shrink-0 items-center justify-between border-b border-border/40 bg-card/50 px-5 backdrop-blur-sm lg:px-8">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-6" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="hidden text-sm text-muted-foreground sm:block">{description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {children}
        <NotificationsDropdown />
      </div>
    </header>
  )
}
