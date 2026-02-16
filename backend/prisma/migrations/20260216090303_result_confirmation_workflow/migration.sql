-- AlterTable
ALTER TABLE `match` MODIFY `status` ENUM('scheduled', 'awaiting_confirmation', 'completed', 'cancelled', 'disputed') NOT NULL DEFAULT 'scheduled';

-- AlterTable
ALTER TABLE `result` ADD COLUMN `confirmedByHostAt` DATETIME(3) NULL,
    ADD COLUMN `confirmedByOpponentAt` DATETIME(3) NULL,
    ADD COLUMN `disputedByHostAt` DATETIME(3) NULL,
    ADD COLUMN `disputedByOpponentAt` DATETIME(3) NULL,
    ADD COLUMN `status` ENUM('draft', 'submitted', 'confirmed', 'disputed') NOT NULL DEFAULT 'draft';

-- CreateIndex
CREATE INDEX `Result_status_idx` ON `Result`(`status`);
