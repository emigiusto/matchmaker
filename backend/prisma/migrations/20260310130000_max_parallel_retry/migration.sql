-- AlterTable: Add maxParallelCandidates and retry support
ALTER TABLE `SchedulingRequest` ADD COLUMN `maxParallelCandidates` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `SchedulingCandidate` ADD COLUMN `retryOrder` INTEGER NULL;
