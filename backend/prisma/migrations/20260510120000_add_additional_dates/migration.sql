-- AlterTable: add additionalDates column to SchedulingRequest for multi-date scheduling
ALTER TABLE `SchedulingRequest` ADD COLUMN `additionalDates` TEXT NULL;
