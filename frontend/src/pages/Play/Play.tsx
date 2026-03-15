import { useState } from "react"
import { InviteRequestsSection } from "@/components/invite-requests-section"
import { getCurrentUserId } from "@/lib/current-user"
import { useTranslation } from "@/lib/i18n"

export default function PlayPage() {
  const currentUserId = getCurrentUserId()
  const { t } = useTranslation()
  const [wizardOpen, setWizardOpen] = useState(false)

  return (
    <InviteRequestsSection
      currentUserId={currentUserId}
      wizardOpen={wizardOpen}
      setWizardOpen={setWizardOpen}
      variant="standalone"
      pageTitle={t("play.pageTitle")}
      pageDescription={t("play.pageDescription")}
    />
  )
}
