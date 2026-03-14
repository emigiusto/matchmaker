-- AlterTable
ALTER TABLE `GuestContact` ADD COLUMN `socioNumber` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ClubMembership` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `clubSlug` VARCHAR(191) NOT NULL,
    `adapterType` VARCHAR(191) NOT NULL,
    `socioNumber` VARCHAR(191) NOT NULL,
    `encryptedPassword` VARCHAR(191) NULL,
    `status` ENUM('unverified', 'active', 'invalid_credentials') NOT NULL DEFAULT 'unverified',
    `lastVerifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ClubMembership_userId_idx`(`userId`),
    INDEX `ClubMembership_clubSlug_idx`(`clubSlug`),
    UNIQUE INDEX `ClubMembership_userId_clubSlug_key`(`userId`, `clubSlug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `matchId` VARCHAR(191) NOT NULL,
    `clubMembershipId` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'success', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
    `externalBookingId` VARCHAR(191) NULL,
    `courtName` VARCHAR(191) NULL,
    `errorMessage` VARCHAR(191) NULL,
    `attemptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `BookingAttempt_matchId_key`(`matchId`),
    INDEX `BookingAttempt_matchId_idx`(`matchId`),
    INDEX `BookingAttempt_clubMembershipId_idx`(`clubMembershipId`),
    INDEX `BookingAttempt_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ClubMembership` ADD CONSTRAINT `ClubMembership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingAttempt` ADD CONSTRAINT `BookingAttempt_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingAttempt` ADD CONSTRAINT `BookingAttempt_clubMembershipId_fkey` FOREIGN KEY (`clubMembershipId`) REFERENCES `ClubMembership`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
