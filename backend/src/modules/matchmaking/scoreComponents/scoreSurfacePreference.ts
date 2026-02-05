// scoreSurfacePreference.ts
// Computes a bonus score for matching surface preferences (e.g., clay, grass, hard court)
// Currently returns 0 as a placeholder until schema and logic are implemented.

/**
 * Calculates a surface preference bonus for matchmaking.
 * @param requesterSurface - The requester's preferred surface (string or null)
 * @param candidateSurface - The candidate's preferred surface (string or null)
 * @returns { score: number, reason?: string }
 */
export function scoreSurfacePreference({
  requesterSurface,
  candidateSurface
}: {
  requesterSurface: string | null;
  candidateSurface: string | null;
}): { score: number; reason?: string } {
  // Placeholder: No bonus until surface preference is supported
  // In the future, return a positive score if surfaces match, or partial if compatible
  return {
    score: 0,
    reason: undefined // or a string if you want to explain
  };
}
