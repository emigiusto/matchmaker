-- DropForeignKey
ALTER TABLE `match` DROP FOREIGN KEY `Match_inviteId_fkey`;

-- AlterTable
ALTER TABLE `match` MODIFY `inviteId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Match` ADD CONSTRAINT `Match_inviteId_fkey` FOREIGN KEY (`inviteId`) REFERENCES `Invite`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
