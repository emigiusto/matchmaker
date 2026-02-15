import { DeterministicRatingAlgorithm } from '../deterministic.algorithm';
import { EloRatingAlgorithm } from '../elo.algorithm';
import { RatingConfig, PlayerSnapshot } from '../domain.types';

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

  const algorithms = [
    {
      name: 'Deterministic',
      instance: new DeterministicRatingAlgorithm(config),
      makeSnapshot: (rating: number, confidence: number) => ({ rating, confidence }),
      zeroSum: false,
    },
    {
      name: 'ELO',
      instance: new EloRatingAlgorithm(kFactor, confidenceIncrement, confidenceMax),
      makeSnapshot: (rating: number, confidence: number) => ({ rating, confidence }),
      zeroSum: true,
    },
  ];

  algorithms.forEach(({ name, instance, makeSnapshot, zeroSum }) => {
    describe(`${name}RatingAlgorithm`, () => {
      it('Fuzz: random ratings/confidence do not break invariants', () => {
        for (let i = 0; i < 200; i++) {
          const winnerRating = Math.random() * 3000;
          const loserRating = Math.random() * 3000;
          const winnerConfidence = Math.random();
          const loserConfidence = Math.random();
          const winner = makeSnapshot(winnerRating, winnerConfidence);
          const loser = makeSnapshot(loserRating, loserConfidence);
          const result = instance.compute({ winner, loser });
          // Ratings remain finite
          expect(Number.isFinite(result.winnerNewRating)).toBe(true);
          expect(Number.isFinite(result.loserNewRating)).toBe(true);
          // Confidence remains in [0, 1]
          expect(result.winnerNewConfidence).toBeGreaterThanOrEqual(0);
          expect(result.winnerNewConfidence).toBeLessThanOrEqual(1);
          expect(result.loserNewConfidence).toBeGreaterThanOrEqual(0);
          expect(result.loserNewConfidence).toBeLessThanOrEqual(1);
          // No NaN
          expect(!Number.isNaN(result.winnerNewRating)).toBe(true);
          expect(!Number.isNaN(result.loserNewRating)).toBe(true);
        }
      });
      it('Symmetry: reversing winner/loser mirrors rating delta appropriately', () => {
        const a = makeSnapshot(1500, 0.5);
        const b = makeSnapshot(1400, 0.5);
        const win = instance.compute({ winner: a, loser: b });
        const reverse = instance.compute({ winner: b, loser: a });
        const deltaA = win.winnerNewRating - a.rating;
        const deltaB = win.loserNewRating - b.rating;
        const reverseDeltaA = reverse.loserNewRating - a.rating;
        const reverseDeltaB = reverse.winnerNewRating - b.rating;
        const total = deltaA + deltaB + reverseDeltaA + reverseDeltaB;
        if (zeroSum) {
          // For zero-sum, the sum of all deltas for both match directions should be zero
          expect(total).toBeCloseTo(0, 8);
        } else {
          // For non-zero-sum, allow a larger epsilon due to loss factor and clamping
          const epsilon = 0.25;
          expect(Math.abs(total)).toBeLessThanOrEqual(epsilon);
        }
      });
      it('Zero-sum property: winnerNewRating + loserNewRating ≈ winnerOldRating + loserOldRating', () => {
        const winner = makeSnapshot(1500, 0.5);
        const loser = makeSnapshot(1400, 0.5);
        const result = instance.compute({ winner, loser });
        const oldSum = winner.rating + loser.rating;
        const newSum = result.winnerNewRating + result.loserNewRating;
        if (zeroSum) {
          expect(newSum).toBeCloseTo(oldSum, 8);
        } else {
          // Allow for lossFactor < 1 (not strictly zero-sum)
          const expectedSum = oldSum - (result.winnerNewRating - winner.rating) * (1 - config.lossFactor);
          // Allow up to minExpectedGain + small margin for floating-point
          const epsilon = config.minExpectedGain + 1e-4;
          expect(Math.abs(newSum - expectedSum)).toBeLessThanOrEqual(epsilon);
        }
      });

      it('Ratings never NaN or Infinity', () => {
        const winner = makeSnapshot(1500, 0.5);
        const loser = makeSnapshot(1400, 0.5);
        const result = instance.compute({ winner, loser });
        expect(Number.isFinite(result.winnerNewRating)).toBe(true);
        expect(Number.isFinite(result.loserNewRating)).toBe(true);
      });

      it('Confidence always within [0, 1]', () => {
        const winner = makeSnapshot(1500, 0.99);
        const loser = makeSnapshot(1400, 0.99);
        const result = instance.compute({ winner, loser });
        expect(result.winnerNewConfidence).toBeGreaterThanOrEqual(0);
        expect(result.winnerNewConfidence).toBeLessThanOrEqual(1);
        expect(result.loserNewConfidence).toBeGreaterThanOrEqual(0);
        expect(result.loserNewConfidence).toBeLessThanOrEqual(1);
      });

      it('Multiple consecutive matches: ratings stabilize and do not explode', () => {
        let winner = makeSnapshot(1500, 0.3);
        let loser = makeSnapshot(1400, 0.3);
        for (let i = 0; i < 50; i++) {
          const result = instance.compute({ winner, loser });
          // Invariant: ratings finite, confidence in [0,1]
          expect(Number.isFinite(result.winnerNewRating)).toBe(true);
          expect(Number.isFinite(result.loserNewRating)).toBe(true);
          expect(result.winnerNewConfidence).toBeGreaterThanOrEqual(0);
          expect(result.winnerNewConfidence).toBeLessThanOrEqual(1);
          expect(result.loserNewConfidence).toBeGreaterThanOrEqual(0);
          expect(result.loserNewConfidence).toBeLessThanOrEqual(1);
          // Prepare for next match: swap winner/loser every 10 matches
          if ((i + 1) % 10 === 0) {
            [winner, loser] = [loser, winner];
          } else {
            winner = { rating: result.winnerNewRating, confidence: result.winnerNewConfidence };
            loser = { rating: result.loserNewRating, confidence: result.loserNewConfidence };
          }
        }
        // Ratings should not explode
        expect(Math.abs(winner.rating)).toBeLessThan(10000);
        expect(Math.abs(loser.rating)).toBeLessThan(10000);
      });
    });
  });
});
