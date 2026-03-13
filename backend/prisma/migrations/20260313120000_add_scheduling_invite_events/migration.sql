-- CreateTable
CREATE TABLE `SchedulingInviteEvent` (
    `id` VARCHAR(191) NOT NULL,
    `schedulingRequestId` VARCHAR(191) NOT NULL,
    `candidateId` VARCHAR(191) NULL,
    `actorUserId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SchedulingInviteEvent_schedulingRequestId_idx`(`schedulingRequestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SchedulingInviteEvent` ADD CONSTRAINT `SchedulingInviteEvent_schedulingRequestId_fkey` FOREIGN KEY (`schedulingRequestId`) REFERENCES `SchedulingRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchedulingInviteEvent` ADD CONSTRAINT `SchedulingInviteEvent_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `SchedulingCandidate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
