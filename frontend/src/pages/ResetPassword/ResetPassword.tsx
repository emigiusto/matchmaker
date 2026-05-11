import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { KeyRound, Loader2, Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { authService } from "@/lib/services/auth.service"
import { useTranslation } from "@/lib/i18n/use-translation"
import { LanguageSwitcher } from "@/components/language-switcher"

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token") ?? ""

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (password.length < 6) {
      setError(t("resetPassword.passwordTooShort"))
      return
    }
    if (password !== confirm) {
      setError(t("resetPassword.passwordMismatch"))
      return
    }
    if (!token) {
      setError(t("resetPassword.invalidToken"))
      return
    }

    setSubmitting(true)
    try {
      await authService.resetPassword(token, password)
      navigate("/login?reset=1", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : t("resetPassword.failed"))
    } finally {
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <p className="text-sm text-destructive">{t("resetPassword.invalidToken")}</p>
            <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
              {t("resetPassword.requestNewLink")}
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center border-b border-border/40 bg-card/50 px-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary">
            <Swords className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">{t("common.appName")}</span>
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">{t("resetPassword.title")}</CardTitle>
            <CardDescription>{t("resetPassword.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}
              <div>
                <Label htmlFor="password">{t("form.newPassword")}</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder={t("resetPassword.passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="mt-1.5"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label htmlFor="confirm">{t("form.confirmPassword")}</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder={t("resetPassword.confirmPlaceholder")}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="mt-1.5"
                  autoComplete="new-password"
                />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                {t("resetPassword.submit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <footer className="flex h-14 shrink-0 items-center justify-end border-t border-border/40 bg-card/50 px-6">
        <LanguageSwitcher />
      </footer>
    </div>
  )
}
