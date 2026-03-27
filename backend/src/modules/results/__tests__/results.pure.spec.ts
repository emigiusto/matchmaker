import { describe, it, expect } from 'vitest';
import { computeWinnerFromSets, validateSetScore } from '../results.service';
import { AppError } from '../../../shared/errors/AppError';

// ── computeWinnerFromSets ─────────────────────────────────────────────────────

describe('computeWinnerFromSets', () => {
  const A = 'user-a';
  const B = 'user-b';

  it('returns team A rep when A wins all sets', () => {
    const sets = [{ setNumber: 1, playerAScore: 6, playerBScore: 4 }];
    expect(computeWinnerFromSets(sets, A, B)).toBe(A);
  });

  it('returns team B rep when B wins all sets', () => {
    const sets = [{ setNumber: 1, playerAScore: 4, playerBScore: 6 }];
    expect(computeWinnerFromSets(sets, A, B)).toBe(B);
  });

  it('returns correct winner in a best-of-3 (2-1 for A)', () => {
    const sets = [
      { setNumber: 1, playerAScore: 6, playerBScore: 3 },
      { setNumber: 2, playerAScore: 3, playerBScore: 6 },
      { setNumber: 3, playerAScore: 6, playerBScore: 2 },
    ];
    expect(computeWinnerFromSets(sets, A, B)).toBe(A);
  });

  it('returns correct winner in a best-of-3 (2-1 for B)', () => {
    const sets = [
      { setNumber: 1, playerAScore: 6, playerBScore: 2 },
      { setNumber: 2, playerAScore: 2, playerBScore: 6 },
      { setNumber: 3, playerAScore: 3, playerBScore: 6 },
    ];
    expect(computeWinnerFromSets(sets, A, B)).toBe(B);
  });

  it('throws 400 when no sets provided', () => {
    expect(() => computeWinnerFromSets([], A, B)).toThrow(AppError);
    expect(() => computeWinnerFromSets([], A, B)).toThrow('no sets provided');
  });

  it('throws 400 when a set has a tied score', () => {
    const sets = [{ setNumber: 1, playerAScore: 6, playerBScore: 6 }];
    expect(() => computeWinnerFromSets(sets, A, B)).toThrow(AppError);
  });

  it('throws 400 when total set count is tied', () => {
    const sets = [
      { setNumber: 1, playerAScore: 6, playerBScore: 3 },
      { setNumber: 2, playerAScore: 3, playerBScore: 6 },
    ];
    expect(() => computeWinnerFromSets(sets, A, B)).toThrow(AppError);
    expect(() => computeWinnerFromSets(sets, A, B)).toThrow('tied');
  });

  it('handles alternative score formats (e.g. 9-3 super tiebreak)', () => {
    const sets = [{ setNumber: 1, playerAScore: 9, playerBScore: 3 }];
    expect(computeWinnerFromSets(sets, A, B)).toBe(A);
  });
});

// ── validateSetScore ──────────────────────────────────────────────────────────

describe('validateSetScore', () => {
  it('accepts a valid set score', () => {
    expect(() =>
      validateSetScore({ setNumber: 1, playerAScore: 6, playerBScore: 4 })
    ).not.toThrow();
  });

  it('accepts alternative score formats allowed by the relaxed rules (e.g. 2-1)', () => {
    expect(() =>
      validateSetScore({ setNumber: 1, playerAScore: 2, playerBScore: 1 })
    ).not.toThrow();
  });

  it('throws 400 when playerAScore is negative', () => {
    expect(() =>
      validateSetScore({ setNumber: 1, playerAScore: -1, playerBScore: 4 })
    ).toThrow(AppError);
  });

  it('throws 400 when playerBScore is negative', () => {
    expect(() =>
      validateSetScore({ setNumber: 1, playerAScore: 6, playerBScore: -1 })
    ).toThrow(AppError);
  });

  it('throws 400 when scores are tied', () => {
    expect(() =>
      validateSetScore({ setNumber: 1, playerAScore: 6, playerBScore: 6 })
    ).toThrow(AppError);
  });

  it('throws 400 when tiebreakScoreA is negative', () => {
    expect(() =>
      validateSetScore({ setNumber: 1, playerAScore: 7, playerBScore: 6, tiebreakScoreA: -1, tiebreakScoreB: 5 })
    ).toThrow(AppError);
  });

  it('throws 400 when tiebreakScoreB is negative', () => {
    expect(() =>
      validateSetScore({ setNumber: 1, playerAScore: 7, playerBScore: 6, tiebreakScoreA: 7, tiebreakScoreB: -1 })
    ).toThrow(AppError);
  });

  it('accepts a set with valid tiebreak scores', () => {
    expect(() =>
      validateSetScore({ setNumber: 1, playerAScore: 7, playerBScore: 6, tiebreakScoreA: 7, tiebreakScoreB: 5 })
    ).not.toThrow();
  });
});
