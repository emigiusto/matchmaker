/*
  Warnings:

  - You are about to drop the column `winnerPlayerId` on the `result` table. All the data in the column will be lost.
  - Added the required column `winnerUserId` to the `Result` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `result` DROP FOREIGN KEY `Result_winnerPlayerId_fkey`;

-- DropIndex
DROP INDEX `Result_winnerPlayerId_idx` ON `result`;

-- AlterTable
ALTER TABLE `result` DROP COLUMN `winnerPlayerId`,
    ADD COLUMN `winnerUserId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `Result_winnerUserId_idx` ON `Result`(`winnerUserId`);

-- AddForeignKey
ALTER TABLE `Result` ADD CONSTRAINT `Result_winnerUserId_fkey` FOREIGN KEY (`winnerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
