// Minimum required overlap in minutes for a match to be considered
export const MIN_OVERLAP_MINUTES = 60;
// Matchmaking score weights for easy tuning
export const WEIGHT_AVAILABILITY_OVERLAP = 1; // Multiplier for overlap minutes
export const WEIGHT_SOCIAL_PROXIMITY = 1; // Multiplier for social proximity score
export const WEIGHT_LEVEL_COMPATIBILITY = 1; // Multiplier for level compatibility
export const WEIGHT_LOCATION_PROXIMITY = 1; // Multiplier for location proximity
// You can adjust these weights to control the influence of each factor

// matchmaking.constants.ts
// Constants for matchmaking service

export const MIN_SCORE = 10;
