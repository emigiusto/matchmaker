import { describe, it, expect } from 'vitest';
import { formatSetsForAceUp } from '../aceup.service';
import type { MatchmakerSet } from '../aceup.types';

function makeSet(overrides: Partial<MatchmakerSet> = {}): MatchmakerSet {
  return {
    setNumber: 1,
    playerAScore: 6,
    playerBScore: 4,
    tiebreakScoreA: null,
    tiebreakScoreB: null,
    ...overrides,
  };
}

// ── formatSetsForAceUp ────────────────────────────────────────────────────────

describe('formatSetsForAceUp', () => {
  describe('when playerAIsPlayer1 = true', () => {
    it('maps playerAScore to p1 and playerBScore to p2', () => {
      const result = formatSetsForAceUp([makeSet({ playerAScore: 6, playerBScore: 4 })], true);
      expect(result[0].score).toBe('6-4');
    });

    it('preserves the set number', () => {
      const result = formatSetsForAceUp([makeSet({ setNumber: 3 })], true);
      expect(result[0].set).toBe(3);
    });
  });

  describe('when playerAIsPlayer1 = false', () => {
    it('maps playerBScore to p1 and playerAScore to p2 (inverted perspective)', () => {
      const result = formatSetsForAceUp([makeSet({ playerAScore: 6, playerBScore: 4 })], false);
      // From player B's (player1) perspective: 4-6
      expect(result[0].score).toBe('4-6');
    });

    it('inverts a match tiebreak score correctly', () => {
      const result = formatSetsForAceUp(
        [makeSet({ playerAScore: 9, playerBScore: 11 })],
        false
      );
      expect(result[0].score).toBe('11-9');
    });
  });

  describe('tiebreak detection', () => {
    it('sets tiebreak=false when both tiebreak scores are null', () => {
      const result = formatSetsForAceUp(
        [makeSet({ tiebreakScoreA: null, tiebreakScoreB: null })],
        true
      );
      expect(result[0].tiebreak).toBe(false);
    });

    it('sets tiebreak=true when tiebreakScoreA is non-null', () => {
      const result = formatSetsForAceUp(
        [makeSet({ tiebreakScoreA: 7, tiebreakScoreB: null })],
        true
      );
      expect(result[0].tiebreak).toBe(true);
    });

    it('sets tiebreak=true when tiebreakScoreB is non-null', () => {
      const result = formatSetsForAceUp(
        [makeSet({ tiebreakScoreA: null, tiebreakScoreB: 5 })],
        true
      );
      expect(result[0].tiebreak).toBe(true);
    });

    it('sets tiebreak=true when both tiebreak scores are present', () => {
      const result = formatSetsForAceUp(
        [makeSet({ tiebreakScoreA: 7, tiebreakScoreB: 3 })],
        true
      );
      expect(result[0].tiebreak).toBe(true);
    });
  });

  describe('multiple sets', () => {
    it('maps all sets preserving order and set numbers', () => {
      const sets: MatchmakerSet[] = [
        makeSet({ setNumber: 1, playerAScore: 6, playerBScore: 3 }),
        makeSet({ setNumber: 2, playerAScore: 3, playerBScore: 6 }),
        makeSet({ setNumber: 3, playerAScore: 7, playerBScore: 6, tiebreakScoreA: 7, tiebreakScoreB: 4 }),
      ];
      const result = formatSetsForAceUp(sets, true);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ set: 1, score: '6-3', tiebreak: false });
      expect(result[1]).toEqual({ set: 2, score: '3-6', tiebreak: false });
      expect(result[2]).toEqual({ set: 3, score: '7-6', tiebreak: true });
    });

    it('returns empty array for empty input', () => {
      expect(formatSetsForAceUp([], true)).toEqual([]);
    });
  });
});
