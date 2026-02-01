// src/services/matches.api.ts
// API client for matches
import { apiFetch } from './api.client';

export interface Match {
  id: string;
  inviteId: string;
  createdAt: string;
  // ...other fields
}

export async function getMatch(id: string): Promise<Match> {
  return apiFetch<Match>(`/api/matches/${id}`);
}
