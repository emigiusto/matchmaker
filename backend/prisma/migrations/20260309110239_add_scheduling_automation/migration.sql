-- CreateTable
CREATE TABLE `SchedulingRequest` (
    `id` VARCHAR(191) NOT NULL,
    `hostUserId` VARCHAR(191) NOT NULL,
    `sportType` ENUM('tennis', 'padel') NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `locationText` VARCHAR(191) NOT NULL,
    `radiusKm` DOUBLE NULL,
    `status` ENUM('active', 'completed', 'expired', 'cancelled') NOT NULL DEFAULT 'active',
    `currentCandidateIndex` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SchedulingRequest_hostUserId_idx`(`hostUserId`),
    INDEX `SchedulingRequest_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SchedulingCandidate` (
    `id` VARCHAR(191) NOT NULL,
    `schedulingRequestId` VARCHAR(191) NOT NULL,
    `contactUserId` VARCHAR(191) NOT NULL,
    `priorityOrder` INTEGER NOT NULL,
    `status` ENUM('pending', 'contacted', 'waiting_reply', 'accepted', 'declined', 'expired') NOT NULL DEFAULT 'pending',
    `contactedAt` DATETIME(3) NULL,
    `responseAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SchedulingCandidate_schedulingRequestId_idx`(`schedulingRequestId`),
    INDEX `SchedulingCandidate_contactUserId_idx`(`contactUserId`),
    INDEX `SchedulingCandidate_priorityOrder_idx`(`priorityOrder`),
    INDEX `SchedulingCandidate_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SchedulingRequest` ADD CONSTRAINT `SchedulingRequest_hostUserId_fkey` FOREIGN KEY (`hostUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchedulingCandidate` ADD CONSTRAINT `SchedulingCandidate_schedulingRequestId_fkey` FOREIGN KEY (`schedulingRequestId`) REFERENCES `SchedulingRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchedulingCandidate` ADD CONSTRAINT `SchedulingCandidate_contactUserId_fkey` FOREIGN KEY (`contactUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
