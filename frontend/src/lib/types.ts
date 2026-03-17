// Core domain types for Tennis MatchMaker

export interface Player {
  id: string
  userId: string
  name: string
  city: string
  latitude: number
  longitude: number
  levelValue: number
  levelConfidence: number
  rating: number
  avatarUrl?: string
  matchesPlayed: number
  wins: number
  losses: number
}

export interface Availability {
  id: string
  userId: string
  playerId: string
  date: string
  time: string
  location: string
  matchType: "competitive" | "practice"
  levelRangeMin: number
  levelRangeMax: number
  surfacePreference: "hard" | "clay" | "grass" | "any"
  createdAt: string
}

export interface Invite {
  id: string
  token: string
  fromUserId: string
  fromPlayerName: string
  toUserId?: string
  availabilityId?: string
  matchType: "competitive" | "practice"
  date: string
  time: string
  location: string
  status: "pending" | "accepted" | "declined" | "expired"
  isOpen: boolean
  createdAt: string
}

export interface Match {
  id: string
  player1: Player
  player2: Player
  date: string
  time: string
  endTime?: string
  location: string
  matchType: "competitive" | "practice"
  status: "scheduled" | "awaiting_confirmation" | "completed" | "cancelled" | "disputed"
  result?: MatchResult
  /** All participants (for doubles: always list all 4) */
  participants?: { userId: string; userName?: string; team?: "A" | "B" | null }[]
  /** False for doubles before result: teams unknown, hide vs layout */
  showVsLayout?: boolean
  /** Sport: tennis or padel (from scheduling, or inferred) */
  sport?: "tennis" | "padel"
  /** Format: singles or doubles */
  format?: "singles" | "doubles"
  /** WhatsApp group JID — use /whatsapp-group-link endpoint to get the shareable invite URL */
  whatsappGroupId?: string | null
}

export interface PostMatchQuestionnaire {
  matchPlayedOut?: string[]
  mainStrategy?: string[]
  whatWorkedBest?: string[]
  whatDidntWork?: string[]
  generalSensation?: string[]
  pointBuilding?: string[]
  serveStrategy?: string[]
  targetedSide?: string[]
  tacticAdjustment?: string[]
  importantPoints?: string[]
  netApproach?: string[]
  opponentStrength?: string[]
  mainMistake?: string[]
}

export interface MatchResult {
  id: string
  matchId: string
  winnerId: string
  sets: SetScore[]
  confirmedByPlayer1: boolean
  confirmedByPlayer2: boolean
  status: "pending" | "confirmed" | "disputed"
  player1RatingChange?: number
  player2RatingChange?: number
  questionnaire?: PostMatchQuestionnaire
}

export interface SetScore {
  setNumber: number
  player1Score: number
  player2Score: number
  tiebreak?: boolean
}

export interface SuggestedOpponent {
  player: Player
  distance: number
  levelDifference: number
  availabilityOverlap: string[]
  reason: string
}

export interface Notification {
  id: string
  userId: string
  type: "invite_received" | "result_pending" | "match_completed" | "rating_change" | "invite_accepted" | "match_cancelled" | "scheduling_no_match" | "booking_cancelled" | "booking_cancel_failed"
  title: string
  message: string
  read: boolean
  createdAt: string
  metadata?: Record<string, string>
}

export interface Reminder {
  id: string
  matchId: string
  matchDate: string
  matchTime: string
  opponent: string
  location: string
  reminderTime: string
  type: "preset" | "custom_relative" | "custom_exact"
  /** Human-readable label like "24 hours before", "3 days before", "Feb 18 at 09:00" */
  label: string
  enabled: boolean
  }

export interface PlayerStats {
  totalMatches: number
  competitiveMatches: number
  practiceMatches: number
  wins: number
  losses: number
  winRate: number
  averageOpponentLevel: number
  currentStreak: number
  streakType: "win" | "loss" | "none"
  ratingHistory: { date: string; rating: number }[]
}
