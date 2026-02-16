
import { faker } from '@faker-js/faker';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedResults(
  matches: {
    id: string;
    hostUserId: string;
    opponentUserId: string;
    scheduledAt: Date;
  }[]
) {
  for (const match of matches) {
    if (match.scheduledAt >= new Date()) continue; // Only past matches

    // 7. Randomly generate lifecycle distribution
    const lifecycleType = faker.helpers.weightedArrayElement([
      { weight: 6, value: 'confirmed' },
      { weight: 3, value: 'submitted' },
      { weight: 1, value: 'draft' },
    ]);

    // 8. Always create 2–3 realistic tennis sets
    const sets = generateTennisSets(match.hostUserId, match.opponentUserId);

    // 9. Ensure winnerUserId matches the majority of sets won
    const winnerUserId = computeWinnerFromSets(sets, match.hostUserId, match.opponentUserId);

    // 4-6. Set result/match status and timestamps according to lifecycleType
    await prisma.$transaction(async (tx) => {
      // Create Result
      const now = new Date();
      let resultData: any = {
        matchId: match.id,
        winnerUserId,
        status: lifecycleType,
        submittedByUserId: lifecycleType !== 'draft' ? match.hostUserId : null,
        confirmedByHostAt: null,
        confirmedByOpponentAt: null,
      };
      if (lifecycleType === 'submitted') {
        resultData.confirmedByHostAt = now;
        resultData.confirmedByOpponentAt = null;
      } else if (lifecycleType === 'confirmed') {
        resultData.confirmedByHostAt = now;
        resultData.confirmedByOpponentAt = now;
      }
      const result = await tx.result.create({ data: resultData });

      // Create sets
      for (const set of sets) {
        await tx.setResult.create({
          data: {
            resultId: result.id,
            setNumber: set.setNumber,
            playerAScore: set.playerAScore,
            playerBScore: set.playerBScore,
            tiebreakScoreA: set.tiebreakScoreA ?? null,
            tiebreakScoreB: set.tiebreakScoreB ?? null,
          },
        });
      }

      // Update match status to be consistent with result
      let matchStatus: import('@prisma/client').MatchStatus = 'scheduled';
      if (lifecycleType === 'submitted') matchStatus = 'awaiting_confirmation';
      else if (lifecycleType === 'confirmed') matchStatus = 'completed';
      await tx.match.update({
        where: { id: match.id },
        data: { status: matchStatus },
      });
    });
  }
}

function generateTennisSets(hostUserId: string, opponentUserId: string) {
  // 2 or 3 sets, realistic scores
  const numSets = faker.helpers.arrayElement([2, 3]);
  const sets = [];
  let hostSetsWon = 0;
  let opponentSetsWon = 0;
  for (let i = 1; i <= numSets; i++) {
    // Randomly pick winner for this set
    const hostWins = faker.datatype.boolean();
    let playerAScore, playerBScore;
    if (hostWins) {
      playerAScore = faker.helpers.arrayElement([6, 7]);
      playerBScore = playerAScore === 6 ? faker.number.int({ min: 0, max: 4 }) : 5;
      hostSetsWon++;
    } else {
      playerBScore = faker.helpers.arrayElement([6, 7]);
      playerAScore = playerBScore === 6 ? faker.number.int({ min: 0, max: 4 }) : 5;
      opponentSetsWon++;
    }
    sets.push({
      setNumber: i,
      playerAScore,
      playerBScore,
      tiebreakScoreA: null,
      tiebreakScoreB: null,
    });
  }
  // Ensure no tie in sets
  if (hostSetsWon === opponentSetsWon) {
    // Randomly increment one
    if (faker.datatype.boolean()) {
      sets[0].playerAScore = 6;
      sets[0].playerBScore = 4;
      hostSetsWon++;
    } else {
      sets[0].playerAScore = 4;
      sets[0].playerBScore = 6;
      opponentSetsWon++;
    }
  }
  return sets;
}

function computeWinnerFromSets(sets: any[], hostUserId: string, opponentUserId: string) {
  let hostSetsWon = 0;
  let opponentSetsWon = 0;
  for (const set of sets) {
    if (set.playerAScore > set.playerBScore) hostSetsWon++;
    else if (set.playerBScore > set.playerAScore) opponentSetsWon++;
  }
  return hostSetsWon > opponentSetsWon ? hostUserId : opponentUserId;
}
