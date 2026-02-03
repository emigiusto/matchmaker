// players.types.ts
// ------------------
// Types for Player entity (API-facing)

/**
 * Difference between User and Player:
 * - User: Represents a registered account in the system. Can exist without being a Player.
 * - Player: Represents the tennis persona/profile of a User. Not all Users are Players.
 *   Creating a Player is an explicit upgrade, never automatic.
 */

/**
 * PlayerDTO
 * API-facing shape of a Player. Does NOT expose internal Prisma model directly.
 * Represents the tennis persona of a User.
 *
 * Additional endpoints for richer UI/admin support:
 * - GET /players: List all players
 * - GET /players/by-city/:city: List players by city
 * - GET /players/count/by-city/:city: Count players by city
 * - DELETE /players/:id: Delete player (soft-delete stub)
 */
export interface PlayerDTO {
  /** Unique player ID */
  id: string;
  /** User ID for this player */
  userId: string;
  /** Display name for tennis persona */
  displayName: string;
  /** Player's skill level (may be unset) */
  levelValue?: number;
  /** Confidence in level assessment */
  levelConfidence?: number;
  /** Preferred court surfaces */
  preferredSurfaces?: string[];
  /** Default city for matches */
  defaultCity?: string;
  /** Latitude for geolocation */
  latitude?: number;
  /** Longitude for geolocation */
  longitude?: number;
}

/**
 * Input for creating a Player (upgrade from User)
 */
export interface CreatePlayerInput {
  userId: string;
  displayName: string;
  levelValue?: number;
  levelConfidence?: number;
  preferredSurfaces?: string[];
  defaultCity?: string;
  latitude?: number;
  longitude?: number;
}

/**
 * Input for updating a Player
 * All fields optional to allow partial updates
 */
export interface UpdatePlayerInput {
  displayName?: string;
  levelValue?: number;
  levelConfidence?: number;
  preferredSurfaces?: string[];
  defaultCity?: string;
  latitude?: number;
  longitude?: number;
}
