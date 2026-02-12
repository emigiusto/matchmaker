/*
  Warnings:

  - The values [declined] on the enum `Invite_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `invite` ADD COLUMN `maxLevel` DOUBLE NULL,
    ADD COLUMN `minLevel` DOUBLE NULL,
    ADD COLUMN `radiusKm` DOUBLE NULL,
    ADD COLUMN `visibility` ENUM('private', 'community') NOT NULL DEFAULT 'private',
    MODIFY `status` ENUM('pending', 'accepted', 'cancelled', 'expired') NOT NULL DEFAULT 'pending';

-- CreateIndex
CREATE INDEX `Invite_visibility_status_idx` ON `Invite`(`visibility`, `status`);
