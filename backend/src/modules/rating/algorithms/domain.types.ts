// Domain types for rating module
export interface PlayerSnapshot {
  rating: number;
  confidence: number;
}

// For ELO algorithm only: require lastMatchAt
export interface EloPlayerSnapshot extends PlayerSnapshot {
  lastMatchAt: Date;
}

export interface RatingUpdateResult {
  winnerNewRating: number;
  loserNewRating: number;
  winnerNewConfidence: number;
  loserNewConfidence: number;
}

export interface RatingConfig {
  baseGain: number;
  upsetMultiplier: number;
  maxDelta: number;
  lossFactor: number;
  confidenceIncrement: number;
  confidenceMax: number;
  defaultRating: number;
  defaultConfidence: number;
  minExpectedGain: number;
  enableHistoryTracking: boolean;
}
