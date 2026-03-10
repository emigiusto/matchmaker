-- AlterTable
ALTER TABLE `Invite` ADD COLUMN `matchType` ENUM('competitive', 'practice') NOT NULL DEFAULT 'competitive';

-- CreateIndex
CREATE INDEX `Invite_matchType_idx` ON `Invite`(`matchType`);
