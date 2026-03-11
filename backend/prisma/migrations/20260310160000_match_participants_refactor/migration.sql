-- CreateTable: MatchParticipant
CREATE TABLE `MatchParticipant` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `team` VARCHAR(191) NULL,

    UNIQUE INDEX `MatchParticipant_matchId_userId_key`(`matchId`, `userId`),
    INDEX `MatchParticipant_matchId_idx`(`matchId`),
    INDEX `MatchParticipant_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill MatchParticipant from existing Match data
INSERT INTO `MatchParticipant` (`id`, `matchId`, `userId`, `team`)
SELECT UUID(), `id`, `hostUserId`, 'A' FROM `Match` WHERE `hostUserId` IS NOT NULL;

INSERT INTO `MatchParticipant` (`id`, `matchId`, `userId`, `team`)
SELECT UUID(), `id`, `opponentUserId`, 'B' FROM `Match` WHERE `opponentUserId` IS NOT NULL;

INSERT INTO `MatchParticipant` (`id`, `matchId`, `userId`, `team`)
SELECT UUID(), `id`, `hostPartnerUserId`, 'A' FROM `Match` WHERE `hostPartnerUserId` IS NOT NULL;

INSERT INTO `MatchParticipant` (`id`, `matchId`, `userId`, `team`)
SELECT UUID(), `id`, `opponentPartnerUserId`, 'B' FROM `Match` WHERE `opponentPartnerUserId` IS NOT NULL;

-- AlterTable: Drop host/opponent columns from Match
ALTER TABLE `Match` DROP FOREIGN KEY `Match_hostUserId_fkey`;
ALTER TABLE `Match` DROP FOREIGN KEY `Match_opponentUserId_fkey`;
ALTER TABLE `Match` DROP FOREIGN KEY `Match_hostPartnerUserId_fkey`;
ALTER TABLE `Match` DROP FOREIGN KEY `Match_opponentPartnerUserId_fkey`;

ALTER TABLE `Match` DROP COLUMN `hostUserId`,
    DROP COLUMN `hostPartnerUserId`,
    DROP COLUMN `opponentUserId`,
    DROP COLUMN `opponentPartnerUserId`;

-- AddForeignKey
ALTER TABLE `MatchParticipant` ADD CONSTRAINT `MatchParticipant_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MatchParticipant` ADD CONSTRAINT `MatchParticipant_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
