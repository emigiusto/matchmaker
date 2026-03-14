ALTER TABLE `SchedulingCandidate` MODIFY `status` ENUM('pending', 'contacted', 'waiting_reply', 'accepted', 'declined', 'expired', 'cancelled', 'send_failed') NOT NULL DEFAULT 'pending';
