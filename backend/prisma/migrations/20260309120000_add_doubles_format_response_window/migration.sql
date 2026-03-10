-- AlterTable SchedulingRequest: add doubles support and UI fields
ALTER TABLE `SchedulingRequest` ADD COLUMN `hostPartnerUserId` VARCHAR(191) NULL,
    ADD COLUMN `format` ENUM('singles', 'doubles') NOT NULL DEFAULT 'singles',
    ADD COLUMN `matchType` ENUM('competitive', 'practice') NOT NULL DEFAULT 'competitive',
    ADD COLUMN `responseWindowMinutes` INTEGER NOT NULL DEFAULT 240,
    ADD COLUMN `inviteToken` VARCHAR(191) NULL,
    ADD COLUMN `matchId` VARCHAR(191) NULL;

-- Add unique token for existing rows (required before adding UNIQUE constraint)
UPDATE `SchedulingRequest` SET `inviteToken` = CONCAT('legacy-', `id`) WHERE `inviteToken` IS NULL;

ALTER TABLE `SchedulingRequest` MODIFY COLUMN `inviteToken` VARCHAR(191) NOT NULL;

-- AlterTable SchedulingRequest: add paused status
ALTER TABLE `SchedulingRequest` MODIFY COLUMN `status` ENUM('active', 'paused', 'completed', 'expired', 'cancelled') NOT NULL DEFAULT 'active';

-- CreateIndex
CREATE UNIQUE INDEX `SchedulingRequest_inviteToken_key` ON `SchedulingRequest`(`inviteToken`);
CREATE UNIQUE INDEX `SchedulingRequest_matchId_key` ON `SchedulingRequest`(`matchId`);
CREATE INDEX `SchedulingRequest_inviteToken_idx` ON `SchedulingRequest`(`inviteToken`);

-- AlterTable Match: add doubles partner fields
ALTER TABLE `Match` ADD COLUMN `hostPartnerUserId` VARCHAR(191) NULL,
    ADD COLUMN `opponentPartnerUserId` VARCHAR(191) NULL;

-- AddForeignKey SchedulingRequest
ALTER TABLE `SchedulingRequest` ADD CONSTRAINT `SchedulingRequest_hostPartnerUserId_fkey` FOREIGN KEY (`hostPartnerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SchedulingRequest` ADD CONSTRAINT `SchedulingRequest_matchId_fkey` FOREIGN KEY (`matchId`) REFERENCES `Match`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey Match
ALTER TABLE `Match` ADD CONSTRAINT `Match_hostPartnerUserId_fkey` FOREIGN KEY (`hostPartnerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Match` ADD CONSTRAINT `Match_opponentPartnerUserId_fkey` FOREIGN KEY (`opponentPartnerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex Match
CREATE INDEX `Match_hostPartnerUserId_idx` ON `Match`(`hostPartnerUserId`);
CREATE INDEX `Match_opponentPartnerUserId_idx` ON `Match`(`opponentPartnerUserId`);
