// src/shared/types/index.ts
// Shared TypeScript types

import type { AvailabilityDTO } from '../../modules/availability/availability.types';

export type AcceptAvailabilityResult = {
	availability: AvailabilityDTO;
	matchId: string;
};
