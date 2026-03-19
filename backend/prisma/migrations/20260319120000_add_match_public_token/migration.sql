-- AddColumn: publicToken to Match (nullable, unique)
ALTER TABLE `Match` ADD COLUMN `publicToken` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `Match_publicToken_key` ON `Match`(`publicToken`);
CREATE INDEX `Match_publicToken_idx` ON `Match`(`publicToken`);
