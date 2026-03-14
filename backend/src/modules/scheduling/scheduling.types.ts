// scheduling.types.ts
// API-facing types for the scheduling automation module

export type SchedulingSportType = 'tennis' | 'padel';

export type SchedulingFormat = 'singles' | 'doubles';

export type SchedulingMatchType = 'competitive' | 'practice';

export type SchedulingRequestStatus = 'active' | 'completed' | 'expired' | 'cancelled';

export type SchedulingCandidateStatus =
  | 'pending'
  | 'contacted'
  | 'waiting_reply'
  | 'accepted'
  | 'declined'
  | 'expired'
  | 'cancelled';

// minutes: 15m, 30m, 1h, 2h, 4h, 12h, 24h, 72h. Dev-only: 10/60 (10 sec)
export const RESPONSE_WINDOW_OPTIONS = [15, 30, 60, 120, 240, 720, 1440, 4320] as const;

export const MAX_ACTIVE_SCHEDULING_REQUESTS = 5;

export interface CreateSchedulingRequestInput {
  hostUserId: string;
  sportType: SchedulingSportType;
  format?: SchedulingFormat;
  matchType?: SchedulingMatchType;
  date: string;
  startTime: string;
  endTime: string;
  locationText: string;
  radiusKm?: number | null;
  responseWindowMinutes?: number;
  maxParallelCandidates?: number;
  hostPartnerUserId?: string | null;
  candidateUserIds: string[];
  bookingEnabled?: boolean;
}

export interface SchedulingRequestDTO {
  id: string;
  hostUserId: string;
  hostPartnerUserId: string | null;
  sportType: SchedulingSportType;
  format: SchedulingFormat;
  matchType: SchedulingMatchType;
  date: string;
  startTime: string;
  endTime: string;
  locationText: string;
  radiusKm: number | null;
  responseWindowMinutes: number;
  maxParallelCandidates: number;
  inviteToken: string;
  status: SchedulingRequestStatus;
  currentCandidateIndex: number;
  matchId: string | null;
  whatsappGroupId: string | null;
  createdAt: string;
  updatedAt: string;
  candidates?: SchedulingCandidateDTO[];
}

export interface SchedulingCandidateDTO {
  id: string;
  schedulingRequestId: string;
  contactUserId: string;
  contactUserName?: string | null;
  priorityOrder: number;
  retryOrder?: number | null;
  status: SchedulingCandidateStatus;
  contactedAt: string | null;
  responseAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SchedulingInviteEventAction =
  | 'invite_sent'
  | 'invite_accepted'
  | 'invite_declined'
  | 'invite_expired'
  | 'candidate_cancelled'
  | 'candidate_retried'
  | 'candidates_added'
  | 'request_started'
  | 'request_cancelled'
  | 'request_completed'
  | 'request_expired'
  | 'booking_pending'
  | 'booking_success'
  | 'booking_failed';

export interface SchedulingInviteEventDTO {
  id: string;
  schedulingRequestId: string;
  candidateId: string | null;
  candidateUserName: string | null;
  actorUserId: string | null;
  actorUserName: string | null;
  action: SchedulingInviteEventAction;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
