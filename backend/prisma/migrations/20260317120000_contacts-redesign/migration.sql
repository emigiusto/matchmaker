-- contacts-redesign
-- Replaces GuestContact + Friendship + Group + GroupMember
-- with Contact + ContactList + ContactListMember

SET FOREIGN_KEY_CHECKS = 0;

-- Drop old tables
DROP TABLE IF EXISTS `Friendship`;
DROP TABLE IF EXISTS `GuestContact`;
DROP TABLE IF EXISTS `GroupMember`;
DROP TABLE IF EXISTS `Group`;

SET FOREIGN_KEY_CHECKS = 1;

-- Contact: unified address book entry
CREATE TABLE `Contact` (
    `id`           VARCHAR(191) NOT NULL,
    `ownerUserId`  VARCHAR(191) NOT NULL,
    `name`         VARCHAR(191) NOT NULL,
    `phone`        VARCHAR(191) NOT NULL,
    `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`    DATETIME(3)  NOT NULL,
    `linkedUserId` VARCHAR(191) NULL,
    `socioNumbers` JSON         NOT NULL DEFAULT ('{}'),
    `importSource` VARCHAR(191) NULL,
    `externalId`   VARCHAR(191) NULL,

    UNIQUE INDEX `Contact_ownerUserId_phone_key`(`ownerUserId`, `phone`),
    UNIQUE INDEX `Contact_ownerUserId_externalId_key`(`ownerUserId`, `externalId`),
    INDEX `Contact_ownerUserId_idx`(`ownerUserId`),
    INDEX `Contact_linkedUserId_idx`(`linkedUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ContactList: named list of contacts
CREATE TABLE `ContactList` (
    `id`          VARCHAR(191) NOT NULL,
    `ownerUserId` VARCHAR(191) NOT NULL,
    `name`        VARCHAR(191) NOT NULL,
    `createdAt`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ContactList_ownerUserId_idx`(`ownerUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ContactListMember: many-to-many Contact ↔ ContactList
CREATE TABLE `ContactListMember` (
    `id`            VARCHAR(191) NOT NULL,
    `contactListId` VARCHAR(191) NOT NULL,
    `contactId`     VARCHAR(191) NOT NULL,
    `addedAt`       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ContactListMember_contactListId_contactId_key`(`contactListId`, `contactId`),
    INDEX `ContactListMember_contactListId_idx`(`contactListId`),
    INDEX `ContactListMember_contactId_idx`(`contactId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Foreign keys
ALTER TABLE `Contact`
    ADD CONSTRAINT `Contact_ownerUserId_fkey`
        FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `Contact_linkedUserId_fkey`
        FOREIGN KEY (`linkedUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ContactList`
    ADD CONSTRAINT `ContactList_ownerUserId_fkey`
        FOREIGN KEY (`ownerUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ContactListMember`
    ADD CONSTRAINT `ContactListMember_contactListId_fkey`
        FOREIGN KEY (`contactListId`) REFERENCES `ContactList`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `ContactListMember_contactId_fkey`
        FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
