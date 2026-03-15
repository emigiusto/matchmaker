-- AlterTable
ALTER TABLE `SchedulingRequest` ADD COLUMN `timezone` VARCHAR(191) NOT NULL DEFAULT 'UTC';
