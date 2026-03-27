-- AlterTable: replace aceupMatchId with aceupChallengeId on Result
ALTER TABLE `Result` DROP COLUMN `aceupMatchId`;
ALTER TABLE `Result` ADD COLUMN `aceupChallengeId` INTEGER NULL;
