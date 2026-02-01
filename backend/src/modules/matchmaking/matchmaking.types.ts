// src/modules/matchmaking/matchmaking.types.ts
// Types for matchmaking logic

export interface MatchCandidate {
  id: string;
  score: number;
  // ...other fields
}

export interface LevelCompatibility {
  score: number;
  // ...other fields
}
