// scheduling.types.ts
// API-facing types for the scheduling automation module

export type SchedulingSportType = 'tennis' | 'padel';

export type SchedulingFormat = 'singles' | 'doubles';

export type SchedulingMatchType = 'competitive' | 'practice';

export type SchedulingRequestStatus = 'active' | 'paused' | 'completed' | 'expired' | 'cancelled';

export type SchedulingCandidateStatus =
  | 'pending'
  | 'contacted'
  | 'waiting_reply'
  | 'accepted'
  | 'declined'
  | 'expired';

// minutes: 20s, 1m, 5m, 15m, 30m, 1h, 2h, 4h, 10h, 24h (0.333 = 20 seconds for testing)
export const RESPONSE_WINDOW_OPTIONS = [1 / 3, 1, 5, 15, 30, 60, 120, 240, 600, 1440] as const;

export const MAX_ACTIVE_SCHEDULING_REQUESTS = 3;

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
