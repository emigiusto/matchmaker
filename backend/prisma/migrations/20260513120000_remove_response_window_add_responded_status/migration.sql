-- Remove responseWindowMinutes, maxParallelCandidates, showCandidates from SchedulingRequest
ALTER TABLE `SchedulingRequest` DROP COLUMN `responseWindowMinutes`;
ALTER TABLE `SchedulingRequest` DROP COLUMN `maxParallelCandidates`;
ALTER TABLE `SchedulingRequest` DROP COLUMN `showCandidates`;

-- Add `responded` to SchedulingCandidateStatus enum (voted on poll, quorum not yet reached)
ALTER TABLE `SchedulingCandidate` MODIFY COLUMN `status` ENUM('pending','contacted','waiting_reply','responded','accepted','declined','expired','cancelled','send_failed') NOT NULL DEFAULT 'pending';
