import { AUTH_TOKEN_KEY } from '../services/api-client'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
const FLUSH_INTERVAL_MS = 10_000
const MAX_BATCH = 50

interface ClientEvent {
  eventType: string
  metadata?: Record<string, unknown>
  sessionId: string
}

// One session ID per page load
const SESSION_ID = typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36)

let queue: ClientEvent[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null
let initialized = false

export function track(eventType: string, metadata?: Record<string, unknown>): void {
  queue.push({ eventType, metadata, sessionId: SESSION_ID })
  if (queue.length >= MAX_BATCH) void flush()
}

export async function flush(): Promise<void> {
  if (!queue.length) return
  const batch = queue.splice(0, MAX_BATCH)
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  try {
    await fetch(`${API_BASE_URL}/analytics/events`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ events: batch }),
    })
  } catch {
    // Silently discard — analytics must never affect the UI
  }
}

function beaconFlush(): void {
  if (!queue.length) return
  const batch = queue.splice(0, MAX_BATCH)
  const token = localStorage.getItem(AUTH_TOKEN_KEY)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const blob = new Blob([JSON.stringify({ events: batch })], { type: 'application/json' })
  if (!navigator.sendBeacon(`${API_BASE_URL}/analytics/events`, blob)) {
    // sendBeacon failed — fire-and-forget fetch as fallback
    void flush()
  }
}

export function initAnalytics(): void {
  if (initialized) return
  initialized = true

  flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') beaconFlush()
  })
}
