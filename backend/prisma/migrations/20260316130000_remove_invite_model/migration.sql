-- Drop FK and inviteId column from Match
ALTER TABLE `Match` DROP FOREIGN KEY `Match_inviteId_fkey`;
ALTER TABLE `Match` DROP INDEX `Match_inviteId_key`;
ALTER TABLE `Match` DROP COLUMN `inviteId`;

-- Drop Invite table (also drops InviteStatus / InviteVisibility inline enums in MySQL)
DROP TABLE `Invite`;
