-- Allow RatingHistory entries without a matchId (e.g. onboarding seed entries)
ALTER TABLE `RatingHistory` MODIFY COLUMN `matchId` VARCHAR(191) NULL;
