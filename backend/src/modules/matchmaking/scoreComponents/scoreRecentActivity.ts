/**
 * Recent activity scoring for matchmaking.
 * Goal: Reward candidates who have been active recently.
 * Future: Integrate with attendance logs, last login, or match participation.
 * For now, returns 0 and a placeholder reason.
 */
export function scoreRecentActivity({ candidateUserId }: { candidateUserId: string }): { score: number; reason: string } {
  // Future: Query last login, attendance, or match participation.
  return {
    score: 0,
    reason: 'Recent activity not yet implemented'
  };
}
