// availability.types.ts
// ---------------------
// API-facing types for Availability module (no Prisma models exposed)

/**
 * Availability is User-based (not Player-based yet):
 * - Each Availability is linked to a User (userId).
 * - Used as input for invites & matchmaking.
 */

/**
 * AvailabilityDTO
 * API-facing shape for an availability slot.
 */
export interface AvailabilityDTO {
  id: string;
  userId: string;
  date: string; // ISO date string (YYYY-MM-DD)
  startTime: string; // ISO time string (HH:mm or full ISO)
  endTime: string;   // ISO time string (HH:mm or full ISO)
  locationText: string;
  minLevel?: number | null;
  maxLevel?: number | null;
  createdAt: string; // ISO datetime string
}

/**
 * Input for creating an availability slot
 */
export interface CreateAvailabilityInput {
  userId: string;
  date: string; // ISO date string
  startTime: string; // ISO time string
  endTime: string;   // ISO time string
  locationText: string;
  minLevel?: number | null;
  maxLevel?: number | null;
}
