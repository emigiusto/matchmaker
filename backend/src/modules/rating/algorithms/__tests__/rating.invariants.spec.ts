import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeterministicRatingAlgorithm } from '../deterministic.algorithm';
import { EloRatingAlgorithm } from '../elo.algorithm';
import {
  RatingConfig,
  PlayerSnapshot,
  EloPlayerSnapshot,
} from '../domain.types';

describe('Rating Algorithm Invariants', () => {
  const config: RatingConfig = {
    baseGain: 0.1,
    upsetMultiplier: 1.5,
    maxDelta: 0.25,
    lossFactor: 0.5,
    confidenceIncrement: 0.02,
    confidenceMax: 1,
    defaultRating: 3.0,
    defaultConfidence: 0.3,
    minExpectedGain: 0.03,
    enableHistoryTracking: true,
  };

  const kFactor = 32;
  const confidenceIncrement = 0.02;
  const confidenceMax = 1;
  const confidenceDecayRate = 0.01;
  const inactivityThresholdDays = 14;
  const minConfidence = 0.1;

  const deterministic = new DeterministicRatingAlgorithm(config);

  const elo = new EloRatingAlgorithm(
    kFactor,
    confidenceIncrement,
    confidenceMax,
    confidenceDecayRate,
    inactivityThresholdDays,
    minConfidence
  );

  const now = new Date('2026-02-15T12:00:00Z');
  const msPerDay = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Deterministic Algorithm Invariants
  // ---------------------------------------------------------------------------

  describe('DeterministicRatingAlgorithm', () => {
    function makeSnapshot(
      rating: number,
      confidence: number
    ): PlayerSnapshot {
      return { rating, confidence };
    }

    it('Fuzz: random inputs remain valid', () => {
      for (let i = 0; i < 300; i++) {
        const winner = makeSnapshot(Math.random() * 3000, Math.random());
        const loser = makeSnapshot(Math.random() * 3000, Math.random());

        const result = deterministic.compute({ winner, loser });

        expect(Number.isFinite(result.winnerNewRating)).toBe(true);
        expect(Number.isFinite(result.loserNewRating)).toBe(true);

        expect(result.winnerNewConfidence).toBeGreaterThanOrEqual(0);
        expect(result.winnerNewConfidence).toBeLessThanOrEqual(1);
        expect(result.loserNewConfidence).toBeGreaterThanOrEqual(0);
        expect(result.loserNewConfidence).toBeLessThanOrEqual(1);
      }
    });

    it('Ratings remain bounded after many matches', () => {
      let winner = makeSnapshot(1500, 0.5);
      let loser = makeSnapshot(1400, 0.5);

      for (let i = 0; i < 100; i++) {
        const result = deterministic.compute({ winner, loser });

        winner = makeSnapshot(
          result.winnerNewRating,
          result.winnerNewConfidence
        );

        loser = makeSnapshot(
          result.loserNewRating,
          result.loserNewConfidence
        );
      }

      expect(Math.abs(winner.rating)).toBeLessThan(10000);
      expect(Math.abs(loser.rating)).toBeLessThan(10000);
    });

    it('Confidence always respects bounds', () => {
      const winner = makeSnapshot(1500, 0.99);
      const loser = makeSnapshot(1400, 0.99);

      const result = deterministic.compute({ winner, loser });

      expect(result.winnerNewConfidence).toBeLessThanOrEqual(1);
      expect(result.loserNewConfidence).toBeLessThanOrEqual(1);
      expect(result.winnerNewConfidence).toBeGreaterThanOrEqual(0);
      expect(result.loserNewConfidence).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // ELO v2 Algorithm Invariants
  // ---------------------------------------------------------------------------

  describe('EloRatingAlgorithm (v2 - Confidence & Decay)', () => {
    function makeSnapshot(
      rating: number,
      confidence: number,
      lastMatchAt?: Date
    ): EloPlayerSnapshot {
      return { rating, confidence, lastMatchAt: lastMatchAt ?? now };
    }

    it('Fuzz: random inputs remain valid (with valid lastMatchAt)', () => {
      for (let i = 0; i < 300; i++) {
        // Always use a lastMatchAt within threshold for both
        const daysAgo = Math.floor(Math.random() * (inactivityThresholdDays + 1));
        const lastMatchAt = new Date(now.getTime() - daysAgo * msPerDay);
        const winner = makeSnapshot(Math.random() * 3000, Math.random(), lastMatchAt);
        const loser = makeSnapshot(Math.random() * 3000, Math.random(), lastMatchAt);

        const result = elo.compute({ winner, loser });

        expect(Number.isFinite(result.winnerNewRating)).toBe(true);
        expect(Number.isFinite(result.loserNewRating)).toBe(true);

        expect(result.winnerNewConfidence).toBeGreaterThanOrEqual(0);
        expect(result.winnerNewConfidence).toBeLessThanOrEqual(1);
        expect(result.loserNewConfidence).toBeGreaterThanOrEqual(0);
        expect(result.loserNewConfidence).toBeLessThanOrEqual(1);
      }
    });

    it('Lower confidence increases volatility', () => {
      const opponent = makeSnapshot(1500, 1);

      const lowConfidence = makeSnapshot(1500, 0.2);
      const highConfidence = makeSnapshot(1500, 1);

      const low = elo.compute({ winner: lowConfidence, loser: opponent });
      const high = elo.compute({ winner: highConfidence, loser: opponent });

      const lowDelta = low.winnerNewRating - lowConfidence.rating;
      const highDelta = high.winnerNewRating - highConfidence.rating;

      expect(lowDelta).toBeGreaterThan(highDelta);
    });

    it('Inactivity increases volatility via decay', () => {
      const inactive = makeSnapshot(
        1500,
        0.8,
        new Date(
          now.getTime() -
            (inactivityThresholdDays + 10) * msPerDay
        )
      );

      const active = makeSnapshot(1500, 0.8);
      const opponent = makeSnapshot(1500, 0.8);

      const rInactive = elo.compute({ winner: inactive, loser: opponent });
      const rActive = elo.compute({ winner: active, loser: opponent });

      const deltaInactive =
        rInactive.winnerNewRating - inactive.rating;
      const deltaActive =
        rActive.winnerNewRating - active.rating;

      expect(deltaInactive).toBeGreaterThan(deltaActive);
    });

    it('Confidence always respects bounds (minConfidence only if decay applies)', () => {
      // No decay: lastMatchAt within threshold
      const winner = makeSnapshot(1500, 0.99, now);
      const loser = makeSnapshot(1400, 0.99, now);
      const result = elo.compute({ winner, loser });
      expect(result.winnerNewConfidence).toBeLessThanOrEqual(1);
      expect(result.loserNewConfidence).toBeLessThanOrEqual(1);
      expect(result.winnerNewConfidence).toBeGreaterThanOrEqual(0);
      expect(result.loserNewConfidence).toBeGreaterThanOrEqual(0);

      // With decay: lastMatchAt far in the past
      const daysOver = 100;
      const decayedLastMatchAt = new Date(now.getTime() - (inactivityThresholdDays + daysOver) * msPerDay);
      const winnerDecay = makeSnapshot(1500, 0.2, decayedLastMatchAt);
      const loserDecay = makeSnapshot(1400, 0.2, decayedLastMatchAt);
      const resultDecay = elo.compute({ winner: winnerDecay, loser: loserDecay });
      expect(resultDecay.winnerNewConfidence).toBeGreaterThanOrEqual(minConfidence);
      expect(resultDecay.loserNewConfidence).toBeGreaterThanOrEqual(minConfidence);
    });

    it('Ratings remain stable after many matches', () => {
      let winner = makeSnapshot(1500, 0.5);
      let loser = makeSnapshot(1400, 0.5);

      for (let i = 0; i < 100; i++) {
        const result = elo.compute({ winner, loser });

        winner = makeSnapshot(
          result.winnerNewRating,
          result.winnerNewConfidence
        );

        loser = makeSnapshot(
          result.loserNewRating,
          result.loserNewConfidence
        );
      }

      expect(Math.abs(winner.rating)).toBeLessThan(10000);
      expect(Math.abs(loser.rating)).toBeLessThan(10000);
    });
  });
});
