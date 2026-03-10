-- AlterTable
ALTER TABLE `Match` ADD COLUMN `status` ENUM('scheduled', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled';

-- CreateIndex
CREATE INDEX `Match_status_idx` ON `Match`(`status`);
