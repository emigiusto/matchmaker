import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { track } from './analytics'

// Replace dynamic segments with their parameter names so pages group correctly.
// Must mirror the route definitions in App.tsx.
const ROUTE_PATTERNS: [RegExp, string][] = [
  [/^\/matches\/[^/]+$/, '/matches/:id'],
  [/^\/play\/[^/]+$/, '/play/:requestId'],
  [/^\/profile\/[^/]+$/, '/profile/:userId'],
  [/^\/join\/[^/]+$/, '/join/:token'],
]

function normalizePath(pathname: string): string {
  for (const [pattern, normalized] of ROUTE_PATTERNS) {
    if (pattern.test(pathname)) return normalized
  }
  return pathname
}

export function usePageTracking(): void {
  const location = useLocation()
  useEffect(() => {
    track('page.view', { path: normalizePath(location.pathname) })
  }, [location.pathname])
}
