/**
 * Current user ID for API calls.
 * TODO: Replace with auth context when authentication is implemented.
 * For development, set VITE_CURRENT_USER_ID in .env.local to match a seeded user.
 */
export function getCurrentUserId(): string {
  return import.meta.env.VITE_CURRENT_USER_ID ?? "user-001"
}
