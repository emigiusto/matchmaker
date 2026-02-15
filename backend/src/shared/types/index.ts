// src/shared/types/index.ts
// Shared TypeScript types
import type { AvailabilityDTO } from '../../modules/availabilities/availability.types';

export type AcceptAvailabilityResult = {
	availability: AvailabilityDTO;
	matchId: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; isAdmin?: boolean };
    }
  }
}