/*
  Warnings:

  - Added the required column `hostUserId` to the `Match` table without a default value. This is not possible if the table is not empty.
  - Added the required column `opponentUserId` to the `Match` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `match` ADD COLUMN `hostUserId` VARCHAR(191) NOT NULL,
    ADD COLUMN `opponentUserId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `Match_hostUserId_idx` ON `Match`(`hostUserId`);

-- CreateIndex
CREATE INDEX `Match_opponentUserId_idx` ON `Match`(`opponentUserId`);

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_hostUserId_fkey` FOREIGN KEY (`hostUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_opponentUserId_fkey` FOREIGN KEY (`opponentUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
