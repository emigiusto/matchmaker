-- CreateTable
CREATE TABLE `RatingHistory` (
    `id` VARCHAR(191) NOT NULL,
    `playerId` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `oldRating` DOUBLE NOT NULL,
    `newRating` DOUBLE NOT NULL,
    `delta` DOUBLE NOT NULL,
    `oldConfidence` DOUBLE NOT NULL,
    `newConfidence` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RatingHistory_playerId_idx`(`playerId`),
    INDEX `RatingHistory_matchId_idx`(`matchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `RatingHistory` ADD CONSTRAINT `RatingHistory_playerId_fkey` FOREIGN KEY (`playerId`) REFERENCES `Player`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
