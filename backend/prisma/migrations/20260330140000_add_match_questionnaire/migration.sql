-- CreateTable: per-user per-match questionnaire answers
CREATE TABLE `MatchQuestionnaire` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `answers` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MatchQuestionnaire_matchId_userId_key`(`matchId`, `userId`),
    INDEX `MatchQuestionnaire_matchId_idx`(`matchId`),
    INDEX `MatchQuestionnaire_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MatchQuestionnaire` ADD CONSTRAINT `MatchQuestionnaire_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MatchQuestionnaire` ADD CONSTRAINT `MatchQuestionnaire_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: migrate existing questionnaire answers from Result into the new per-user table
-- Uses submittedByUserId as the author, skips nulls and empty objects
INSERT INTO `MatchQuestionnaire` (`id`, `matchId`, `userId`, `answers`, `createdAt`, `updatedAt`)
SELECT
    UUID(),
    r.`matchId`,
    r.`submittedByUserId`,
    r.`questionnaire`,
    r.`createdAt`,
    NOW()
FROM `Result` r
WHERE r.`questionnaire` IS NOT NULL
  AND r.`submittedByUserId` IS NOT NULL
  AND JSON_LENGTH(r.`questionnaire`) > 0
ON DUPLICATE KEY UPDATE `answers` = r.`questionnaire`;
