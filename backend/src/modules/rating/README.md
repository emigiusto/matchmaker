# 🎾 Rating System Overview

This module provides a flexible, extensible player rating engine for
match-based games such as a tennis community platform.

It supports multiple rating algorithms and cleanly separates:

-   Rating computation logic (pure algorithms)
-   Persistence (Prisma transaction boundary)
-   Runtime algorithm selection

The system updates both rating and confidence after each completed
match.

------------------------------------------------------------------------

# 🧠 How It Works

When a match is completed:

1.  The system loads the match and its result.
2.  It validates that the match is in completed state.
3.  It loads both participating players.
4.  It determines winner and loser.
5.  It builds rating snapshots for both players.
6.  The selected algorithm computes:
    -   New ratings
    -   New confidence values
7.  The system persists the updates.
8.  Optionally, it stores a rating history record.

All operations run inside a provided Prisma transaction (RatingTx).

------------------------------------------------------------------------

# 🧩 Architecture

    rating/
     ├── rating.service.ts
     ├── algorithms/
     │    ├── algorithm.types.ts
     │    ├── deterministic.algorithm.ts
     │    ├── elo.algorithm.ts
     │    └── domain.types.ts

Key Design Principles

-   ✅ Algorithms are pure and side-effect free
-   ✅ Service layer handles persistence only
-   ✅ Minimal database boundary (RatingTx)
-   ✅ Fully unit-testable
-   ✅ Runtime algorithm switching
-   ✅ Future-proof for new rating systems

------------------------------------------------------------------------

# ⚙️ Algorithms

## 1️⃣ Deterministic Algorithm (Default)

A predictable, tunable rating system.

Characteristics

-   Handles upsets (lower-rated player wins)
-   Configurable gain and multipliers
-   Caps maximum delta
-   Enforces minimum gain
-   Confidence increases slightly after each match
-   Not strictly zero-sum (controlled by lossFactor)

This makes it stable and easy to tune for community play.

------------------------------------------------------------------------

## 2️⃣ ELO Algorithm (Confidence-Driven Volatility + Inactivity Decay)

An enhanced ELO-based rating system designed specifically for
competitive communities.

### ⭐ Core Idea

Each player’s confidence independently affects how much their rating
changes.

This is not classic chess ELO.

------------------------------------------------------------------------

### 🧠 Confidence-Driven Volatility (Per Player)

For each player:

    volatility = 1 + (1 - confidence)
    effectiveK = baseK * volatility

Lower confidence → higher volatility → larger rating changes
Higher confidence → lower volatility → smaller rating changes

Each player’s delta is computed independently:

    winnerDelta = winnerK * (1 - expectedScore)
    loserDelta  = loserK  * (0 - (1 - expectedScore))

Because each player has their own K-factor:

⚠️ The system is not strictly zero-sum.

This is intentional and improves realism in evolving skill systems.

------------------------------------------------------------------------

### 📉 Inactivity Decay

Confidence decays over time if a player stops competing.

-   Based on Player.lastMatchAt
-   Never based on updatedAt
-   Decay begins after a configurable threshold (default: 14 days)
-   Each day beyond threshold reduces confidence linearly
-   Confidence never drops below minConfidence
-   After each completed match, lastMatchAt is updated to the match’s
    scheduled date

Lower confidence caused by inactivity increases volatility on return.

------------------------------------------------------------------------

### 📐 Mathematical Overview

Expected Score

    E = 1 / (1 + 10^((loserRating - winnerRating) / 400))

Rating Updates (Per Player)

    winnerNewRating = winnerRating + winnerDelta
    loserNewRating  = loserRating  + loserDelta

------------------------------------------------------------------------

## 📊 Detailed Examples


### Example 1 — Equal Ratings, Equal Confidence

**Initial:**
    - Player A: rating 1500, confidence 0.5, lastMatchAt = today
    - Player B: rating 1500, confidence 0.5, lastMatchAt = today
    - K = 32

**Computation:**
    - Expected score = 0.5
    - Volatility = 1.5 (both)
    - Effective K = 48 (both)
    - Delta = 24

**Final:**
    - Player A: rating 1524, confidence 0.52 (increased)
    - Player B: rating 1476, confidence 0.52 (increased)

---

### Example 2 — Same Ratings, Different Confidence

**Initial:**
    - Player A: rating 1500, confidence 0.2, lastMatchAt = today
    - Player B: rating 1500, confidence 0.9, lastMatchAt = today
    - K = 32

**Computation:**
    - Player A volatility = 1.8 → K = 57.6
    - Player B volatility = 1.1 → K = 35.2
    - Expected score = 0.5
    - Player A delta = 28.8
    - Player B delta = -17.6

**Final:**
    - Player A: rating 1528.8, confidence 0.22 (increased)
    - Player B: rating 1482.4, confidence 0.92 (increased)

---

### Example 3 — Upset with Confidence Difference

**Initial:**
    - Player A: rating 1200, confidence 0.4, lastMatchAt = today
    - Player B: rating 1700, confidence 0.9, lastMatchAt = today
    - K = 32

**Computation:**
    - Expected score for A ≈ 0.06
    - Player A volatility = 1.6 → K = 51.2
    - Player B volatility = 1.1 → K = 35.2
    - Player A delta = 48.13
    - Player B delta = -32.29

**Final:**
    - Player A: rating 1248.13, confidence 0.42 (increased)
    - Player B: rating 1667.71, confidence 0.92 (increased)

---

### Example 4 — Inactivity Return

**Initial:**
    - Player A: rating 1600, confidence 0.8, lastMatchAt = 30 days ago
    - Player B: rating 1600, confidence 0.8, lastMatchAt = today
    - K = 32
    - Inactivity threshold = 14 days

**Computation:**
    - Player A confidence decays: 30 - 14 = 16 days over threshold
    - Decay rate = 0.01 → confidence decays by 0.16 → new confidence = 0.64
    - Player A volatility = 1.36 → K = 43.52
    - Player B volatility = 1.2 → K = 38.4
    - Expected score = 0.5
    - Player A delta = 21.76
    - Player B delta = -19.2

**Final:**
    - Player A: rating 1621.76, confidence 0.66 (decayed, then increased)
    - Player B: rating 1580.8, confidence 0.82 (increased)

------------------------------------------------------------------------

## 🔁 Switching Algorithms

Environment configuration:

    RATING_ALGORITHM=elo
    RATING_K_FACTOR=32

Bootstrap example:

    if (process.env.RATING_ALGORITHM === 'elo') {
      const k = parseInt(process.env.RATING_K_FACTOR || '32', 10);
      RatingService.setAlgorithm(new EloRatingAlgorithm(k));
    }

------------------------------------------------------------------------

## 🗄 Rating History

If enableHistoryTracking = true, the system stores:

-   Player ID
-   Match ID
-   Old rating
-   New rating
-   Delta
-   Old confidence
-   New confidence

------------------------------------------------------------------------

## 🧪 Testing

The rating module is fully unit-tested using Vitest:

-   Algorithm invariants
-   Stability over many matches
-   Confidence boundaries
-   Inactivity decay behavior
-   Service behavior with mocked transactions

------------------------------------------------------------------------

## 🚀 Extending the System

To add a new rating algorithm:

1.  Implement the RatingAlgorithm interface
2.  Place it inside algorithms/
3.  Register it in your bootstrap configuration

No changes to RatingService are required.

------------------------------------------------------------------------

## 🎾 Why This Works for a Tennis Community

-   New players converge quickly to their real level
-   Established players stabilize naturally
-   Inactive players return with higher volatility
-   Upsets are rewarded
-   The system self-corrects over time

This design balances fairness, realism, and long-term stability.
