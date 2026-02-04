/**
 * Reliability scoring for matchmaking.
 * Goal: Reward candidates who are reliable (few cancellations, good attendance).
 * Future: Integrate with cancellation history, attendance logs, or "trusted player" status.
 * For now, returns 0 and a placeholder reason.
 */
export function scoreReliability({ candidateUserId }: { candidateUserId: string }): { score: number; reason: string } {
  // Future: Query cancellation history, attendance, or reliability metrics.
  return {
    score: 0,
    reason: 'Reliability not yet implemented'
  };
}
