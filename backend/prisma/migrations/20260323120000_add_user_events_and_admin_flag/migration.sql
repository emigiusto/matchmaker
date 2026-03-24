-- Add isAdmin flag to User
ALTER TABLE `User` ADD COLUMN `isAdmin` BOOLEAN NOT NULL DEFAULT false;

-- Create UserEvent table
CREATE TABLE `UserEvent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `sessionId` VARCHAR(191) NULL,
    `source` VARCHAR(191) NOT NULL DEFAULT 'client',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UserEvent_userId_idx`(`userId`),
    INDEX `UserEvent_eventType_createdAt_idx`(`eventType`, `createdAt`),
    INDEX `UserEvent_createdAt_idx`(`createdAt`),
    INDEX `UserEvent_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add foreign key
ALTER TABLE `UserEvent` ADD CONSTRAINT `UserEvent_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
