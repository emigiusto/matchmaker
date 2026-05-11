-- AlterTable
ALTER TABLE `User`
  ADD COLUMN `resetPasswordToken` VARCHAR(191) NULL,
  ADD COLUMN `resetPasswordTokenExpiresAt` DATETIME(3) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_resetPasswordToken_key` ON `User`(`resetPasswordToken`);
