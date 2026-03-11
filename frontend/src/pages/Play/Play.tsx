import { useState } from "react"
import { InviteRequestsSection } from "@/components/invite-requests-section"
import { getCurrentUserId } from "@/lib/current-user"

export default function PlayPage() {
  const currentUserId = getCurrentUserId()
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <InviteRequestsSection
      currentUserId={currentUserId}
      wizardOpen={wizardOpen}
      setWizardOpen={setWizardOpen}
      variant="standalone"
      pageTitle="My Invites"
      pageDescription="Create matches and browse open invites"
    />
  )
}
