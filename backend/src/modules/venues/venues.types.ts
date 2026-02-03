// venues.types.ts
// API-facing types for the Venues module

/**
 * VenueDTO: API-facing venue object
 */
export interface VenueDTO {
  id: string;
  name: string;
  city: string;
  address?: string | null;
  indoor: boolean;
  surface: string;
  createdAt: string;
}

/**
 * Input for creating a new venue
 */
export interface CreateVenueInput {
  name: string;
  city: string;
  address?: string | null;
  indoor: boolean;
  surface: string;
}

/**
 * Filters for listing venues
 */
export interface VenueFilters {
  city?: string;
  surface?: string;
}
