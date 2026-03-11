-- AlterTable: add whatsappGroupId to Match for scheduling WhatsApp groups
ALTER TABLE `Match` ADD COLUMN `whatsappGroupId` VARCHAR(191) NULL;
