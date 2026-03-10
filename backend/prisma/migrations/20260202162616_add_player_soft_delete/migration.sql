-- AlterTable
ALTER TABLE `Player` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `isDeleted` BOOLEAN NOT NULL DEFAULT false;
