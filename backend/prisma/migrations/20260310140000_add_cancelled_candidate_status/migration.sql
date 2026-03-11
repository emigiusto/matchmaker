-- AlterTable: add 'cancelled' to SchedulingCandidateStatus (host cancelled the candidate)
-- 'declined' = invitee said no (rejected)
-- 'expired' = no response in time
-- 'cancelled' = host cancelled/skipped the candidate
ALTER TABLE `SchedulingCandidate` MODIFY COLUMN `status` ENUM('pending', 'contacted', 'waiting_reply', 'accepted', 'declined', 'expired', 'cancelled') NOT NULL DEFAULT 'pending';
