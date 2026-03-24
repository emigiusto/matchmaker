import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { track } from './analytics'

export function usePageTracking(): void {
  const location = useLocation()
  useEffect(() => {
    track('page.view', { path: location.pathname })
  }, [location.pathname])
}
