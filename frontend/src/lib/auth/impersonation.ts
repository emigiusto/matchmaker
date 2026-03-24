import { AUTH_TOKEN_KEY } from '../services/api-client'

const RESTORE_KEY = 'matchmaker_admin_restore'

export interface RestoreState {
  token: string
  name: string
}

export function startImpersonation(impersonationToken: string, targetName: string): void {
  const adminToken = localStorage.getItem(AUTH_TOKEN_KEY) ?? ''
  sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ token: adminToken, name: targetName }))
  localStorage.setItem(AUTH_TOKEN_KEY, impersonationToken)
}

export function stopImpersonation(): void {
  const raw = sessionStorage.getItem(RESTORE_KEY)
  if (!raw) return
  const { token } = JSON.parse(raw) as RestoreState
  localStorage.setItem(AUTH_TOKEN_KEY, token)
  sessionStorage.removeItem(RESTORE_KEY)
}

export function getImpersonationState(): { active: false } | { active: true; targetName: string } {
  const raw = sessionStorage.getItem(RESTORE_KEY)
  if (!raw) return { active: false }
  const { name } = JSON.parse(raw) as RestoreState
  return { active: true, targetName: name }
}
