-- AlterTable
ALTER TABLE `Availability` ADD COLUMN `status` ENUM('open', 'invited', 'matched', 'closed') NOT NULL DEFAULT 'open';

-- CreateIndex
CREATE INDEX `Availability_status_idx` ON `Availability`(`status`);
