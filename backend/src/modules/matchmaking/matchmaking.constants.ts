// Minimum required overlap in minutes for a match to be considered
export const MIN_OVERLAP_MINUTES = 60;

// Matchmaking score weights for easy tuning
export const WEIGHT_AVAILABILITY_OVERLAP = 1; // Multiplier for overlap minutes
export const WEIGHT_SOCIAL_PROXIMITY = 1;     // Multiplier for social proximity score
export const WEIGHT_LEVEL_COMPATIBILITY = 1;  // Multiplier for level compatibility
export const WEIGHT_LOCATION_PROXIMITY = 1;   // Multiplier for location proximity
export const WEIGHT_SURFACE_PREFERENCE = 1;   // Multiplier for surface preference match
export const WEIGHT_RECENT_ACTIVITY = 1;      // Multiplier for recent activity bonus

// Availability bonus: flat points added when both users have overlapping availability
// (used in profile mode to reward candidates who have published open slots)
export const AVAILABILITY_BONUS = 20;

// Surface preference score values
export const SCORE_SURFACE_MATCH = 10;        // Both prefer the same surface
export const SCORE_SURFACE_PARTIAL = 5;       // At least one shared surface preference

// Recent activity score values
export const SCORE_RECENT_30_DAYS = 5;        // Played a match in the last 30 days
export const SCORE_RECENT_90_DAYS = 2;        // Played a match in the last 31–90 days

// Minimum total score for a candidate to be included in results
export const MIN_SCORE = 10;
