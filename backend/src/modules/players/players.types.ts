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
 */
export interface PlayerDTO {
  id: string;
  userId: string;
  displayName: string;
  levelValue?: number; // Optional: Player's skill level (may be unset)
  levelConfidence?: number; // Optional: Confidence in level assessment
  preferredSurfaces?: string[]; // Optional: Preferred court surfaces
  defaultCity?: string; // Optional: Default city for matches
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
}
