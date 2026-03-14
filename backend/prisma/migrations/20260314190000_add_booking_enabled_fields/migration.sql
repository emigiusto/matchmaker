-- AlterTable
ALTER TABLE `Invite` ADD COLUMN `bookingEnabled` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `SchedulingRequest` ADD COLUMN `bookingEnabled` BOOLEAN NOT NULL DEFAULT false;
