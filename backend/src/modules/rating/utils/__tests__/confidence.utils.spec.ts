import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { computeDecayedConfidence } from '../confidence.utils';

describe('computeDecayedConfidence', () => {
  const baseConfidence = 0.5;
  const decayRate = 0.01;
  const inactivityThresholdDays = 14;
  const minConfidence = 0.1;
  const baseDate = new Date('2026-02-16T12:00:00Z');
  const msPerDay = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseDate);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns storedConfidence if lastMatchAt is null', () => {
    expect(computeDecayedConfidence(baseConfidence, null, baseDate, decayRate, inactivityThresholdDays, minConfidence)).toBe(baseConfidence);
  });

  it('no decay when daysSince <= inactivityThresholdDays', () => {
    for (let days = 0; days <= inactivityThresholdDays; days++) {
      const lastMatchAt = new Date(baseDate.getTime() - days * msPerDay);
      expect(computeDecayedConfidence(baseConfidence, lastMatchAt, baseDate, decayRate, inactivityThresholdDays, minConfidence)).toBe(baseConfidence);
    }
  });

  it('linear decay when daysSince > inactivityThresholdDays', () => {
    const daysOver = 3;
    const lastMatchAt = new Date(baseDate.getTime() - (inactivityThresholdDays + daysOver) * msPerDay);
    const expected = baseConfidence - daysOver * decayRate;
    expect(computeDecayedConfidence(baseConfidence, lastMatchAt, baseDate, decayRate, inactivityThresholdDays, minConfidence)).toBeCloseTo(expected, 6);
  });

  it('clamps to minConfidence', () => {
    const daysOver = 100;
    const lastMatchAt = new Date(baseDate.getTime() - (inactivityThresholdDays + daysOver) * msPerDay);
    expect(computeDecayedConfidence(baseConfidence, lastMatchAt, baseDate, decayRate, inactivityThresholdDays, minConfidence)).toBe(minConfidence);
  });

  it('high decay does not produce negative values', () => {
    const highDecay = 1;
    const daysOver = 10;
    const lastMatchAt = new Date(baseDate.getTime() - (inactivityThresholdDays + daysOver) * msPerDay);
    expect(computeDecayedConfidence(baseConfidence, lastMatchAt, baseDate, highDecay, inactivityThresholdDays, minConfidence)).toBe(minConfidence);
  });

  it('boundary case: exactly equal to threshold (no decay)', () => {
    const lastMatchAt = new Date(baseDate.getTime() - inactivityThresholdDays * msPerDay);
    expect(computeDecayedConfidence(baseConfidence, lastMatchAt, baseDate, decayRate, inactivityThresholdDays, minConfidence)).toBe(baseConfidence);
  });
});
