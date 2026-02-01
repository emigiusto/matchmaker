// src/services/invites.api.ts
// API client for invites
import { apiFetch } from './api.client';

export interface Invite {
  status: string;
  matchDetails?: {
    date: string;
    location: string;
    // ...other fields
  };
}

export async function getInvite(token: string): Promise<Invite> {
  return apiFetch<Invite>(`/api/invites/${token}`);
}

export async function confirmInvite(token: string): Promise<void> {
  return apiFetch<void>(`/api/invites/${token}/confirm`, { method: 'POST' });
}

export async function declineInvite(token: string): Promise<void> {
  return apiFetch<void>(`/api/invites/${token}/decline`, { method: 'POST' });
}
