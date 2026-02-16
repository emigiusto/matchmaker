/**
 * Computes confidence decay due to player inactivity.
 *
 * @param storedConfidence - The player's current stored confidence value.
 * @param lastMatchAt - The date of the player's last match. If null, no decay is applied.
 * @param now - The current date (used for calculation, inject for testability).
 * @param decayRate - The amount confidence decays per day of inactivity beyond the threshold.
 * @param inactivityThresholdDays - Number of days after which decay begins.
 * @param minConfidence - The minimum allowed confidence value.
 * @returns The decayed confidence value, clamped to minConfidence.
 *
 * If lastMatchAt is null, returns storedConfidence unchanged.
 * Decay is only applied after inactivityThresholdDays have passed since lastMatchAt.
 * Each day over the threshold reduces confidence linearly: decayed = storedConfidence - daysOver * decayRate
 * The result is clamped to minConfidence and never mutates input.
 */
export function computeDecayedConfidence(
  storedConfidence: number,
  lastMatchAt: Date | null,
  now: Date,
  decayRate: number,
  inactivityThresholdDays: number,
  minConfidence: number
): number {
  if (!lastMatchAt) return storedConfidence;
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysSince = Math.floor((now.getTime() - lastMatchAt.getTime()) / msPerDay);
  if (daysSince <= inactivityThresholdDays) return storedConfidence;
  const daysOver = daysSince - inactivityThresholdDays;
  const decayed = storedConfidence - daysOver * decayRate;
  return Math.max(minConfidence, decayed);
}
