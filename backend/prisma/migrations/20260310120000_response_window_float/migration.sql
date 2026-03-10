-- AlterTable: Allow fractional minutes for response window (e.g. 0.333 = 20 seconds for testing)
ALTER TABLE `SchedulingRequest` MODIFY COLUMN `responseWindowMinutes` DOUBLE NOT NULL DEFAULT 240;
