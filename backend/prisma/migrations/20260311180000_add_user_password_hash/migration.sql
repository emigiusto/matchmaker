-- Add passwordHash to User for email/password auth. Nullable for guest users.
ALTER TABLE `User` ADD COLUMN `passwordHash` VARCHAR(255) NULL;
