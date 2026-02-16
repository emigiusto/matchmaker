-- AlterTable
ALTER TABLE `match` ADD COLUMN `type` ENUM('competitive', 'practice') NOT NULL DEFAULT 'competitive';

-- CreateIndex
CREATE INDEX `Match_type_idx` ON `Match`(`type`);
