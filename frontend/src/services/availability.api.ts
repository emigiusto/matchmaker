// src/services/availability.api.ts
// API client for availability
import { apiFetch } from './api.client';

export interface Availability {
  id: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  levelMin?: number;
  levelMax?: number;
  createdAt: string;
}

export async function getAvailability(id: string): Promise<Availability> {
  return apiFetch<Availability>(`/api/availability/${id}`);
}

export async function createAvailability(data: Partial<Availability>): Promise<Availability> {
  return apiFetch<Availability>(`/api/availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
