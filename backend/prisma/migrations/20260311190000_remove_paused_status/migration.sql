-- Remove paused status from SchedulingRequestStatus enum
-- First convert any paused requests to active
UPDATE `SchedulingRequest` SET `status` = 'active' WHERE `status` = 'paused';

-- Then remove paused from the enum
ALTER TABLE `SchedulingRequest` MODIFY COLUMN `status` ENUM('active', 'completed', 'expired', 'cancelled') NOT NULL DEFAULT 'active';
