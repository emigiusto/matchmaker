# 🎯 Rating System Overview

This module provides a **flexible, extensible player rating engine** for
match-based games.

It supports multiple rating algorithms and cleanly separates:

-   Rating computation logic (pure algorithms)
-   Persistence (Prisma transaction boundary)
-   Runtime algorithm selection

The system updates both **rating** and **confidence** after each
completed match.

------------------------------------------------------------------------

# 🧠 How It Works

When a match is completed:

1.  The system loads the match and its result.
2.  It validates that the match is in `completed` state.
3.  It loads both participating players.
4.  It determines winner and loser.
5.  It passes their rating + confidence snapshots to the selected
    algorithm.
6.  The algorithm computes:
    -   New ratings
    -   New confidence values
7.  The system persists the updates.
8.  Optionally, it stores a rating history record.

All operations run inside a provided Prisma transaction (`RatingTx`).

------------------------------------------------------------------------

# 🧩 Architecture

The rating system is built using a **pluggable strategy pattern**.

    rating/
     ├── rating.service.ts
     ├── algorithms/
     │    ├── algorithm.types.ts
     │    ├── deterministic.algorithm.ts
     │    ├── elo.algorithm.ts
     │    └── domain.types.ts

### Key Design Principles

-   ✅ Algorithms are pure and side-effect free
-   ✅ Service layer handles persistence only
-   ✅ Minimal database boundary (`RatingTx`)
-   ✅ Fully unit-testable
-   ✅ Runtime algorithm switching
-   ✅ Future-proof for new rating systems

------------------------------------------------------------------------

# ⚙️ Algorithms

## 1️⃣ Deterministic Algorithm (Default)

A predictable, tunable rating system.

### Characteristics

-   Handles upsets (lower-rated player wins)
-   Configurable gain and multipliers
-   Caps maximum delta
-   Enforces minimum gain
-   Confidence increases slightly after each match
-   **Not strictly zero-sum** (controlled by `lossFactor`)

This makes it stable and easy to tune for community play.

------------------------------------------------------------------------

## 2️⃣ ELO Algorithm (Confidence-Driven Volatility)

An enhanced ELO-based rating system.

Unlike classic ELO, this implementation includes:

> **Confidence-driven volatility**

Lower confidence players experience larger rating swings. Higher
confidence players stabilize over time.

------------------------------------------------------------------------

### Expected Score Formula

    E = 1 / (1 + 10^((loserRating - winnerRating) / 400))

### Volatility Multiplier

    volatility = 1 + (1 - confidence)

### Effective K-Factor

    effectiveK = baseK * volatility

### Rating Update

    delta = effectiveK * (1 - expectedScore)

    winnerNewRating = winnerRating + delta
    loserNewRating  = loserRating - delta

This implementation is **strictly zero-sum**.

Confidence increases slightly after each match.

------------------------------------------------------------------------

# 📊 ELO Examples

### Example 1 --- Equal Ratings

-   Player A: 1500 (confidence 0.5)
-   Player B: 1500 (confidence 0.5)
-   Base K = 32

Expected score:

    E = 0.5

Volatility:

    volatility = 1 + (1 - 0.5) = 1.5
    effectiveK = 32 * 1.5 = 48

Delta:

    delta = 48 * (1 - 0.5) = 24

New ratings:

    A = 1524
    B = 1476

------------------------------------------------------------------------

### Example 2 --- Higher Rated Wins

-   Player A: 1800 (confidence 0.8)
-   Player B: 1400 (confidence 0.6)

Expected score for A ≈ 0.91

Volatility for A:

    volatility = 1 + (1 - 0.8) = 1.2
    effectiveK = 32 * 1.2 = 38.4

Delta:

    delta ≈ 38.4 * (1 - 0.91) ≈ 3.46

Small rating change (expected outcome).

------------------------------------------------------------------------

### Example 3 --- Upset (Lower Rated Wins)

-   Player A: 1200 (confidence 0.4)
-   Player B: 1700 (confidence 0.9)

Expected score for A ≈ 0.06

Volatility for A:

    volatility = 1 + (1 - 0.4) = 1.6
    effectiveK = 32 * 1.6 = 51.2

Delta:

    delta ≈ 51.2 * (1 - 0.06) ≈ 48.13

Large rating swing (unexpected outcome).

------------------------------------------------------------------------

# 🔁 Switching Algorithms

Algorithms can be switched at runtime (e.g. inside
`rating.bootstrap.ts`).

### Default

The deterministic algorithm is used by default.

### Enable ELO via Environment Variables

    RATING_ALGORITHM=elo
    RATING_K_FACTOR=32   # optional (default: 32)

Example bootstrap usage:

``` ts
if (process.env.RATING_ALGORITHM === 'elo') {
  const k = parseInt(process.env.RATING_K_FACTOR || '32', 10);
  RatingService.setAlgorithm(new EloRatingAlgorithm(k));
}
```

------------------------------------------------------------------------

# 🗄 Rating History

If `enableHistoryTracking = true`, the system stores:

-   Player ID
-   Match ID
-   Old rating
-   New rating
-   Delta
-   Old confidence
-   New confidence

------------------------------------------------------------------------

# 🧪 Testing

The rating module is fully unit-tested using Vitest:

-   Algorithm invariants
-   Zero-sum checks
-   Stability over many matches
-   Confidence boundaries
-   Determinism
-   Service behavior with mocked transactions

------------------------------------------------------------------------

# 🚀 Extending the System

To add a new rating algorithm:

1.  Implement the `RatingAlgorithm` interface:

``` ts
compute(input: { winner: PlayerSnapshot; loser: PlayerSnapshot }): RatingUpdateResult
```

2.  Place it inside `algorithms/`
3.  Register it in your bootstrap configuration

No changes to `RatingService` are required.
