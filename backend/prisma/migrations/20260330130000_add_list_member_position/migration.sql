-- AddColumn: position to ContactListMember
ALTER TABLE `ContactListMember` ADD COLUMN `position` INTEGER NOT NULL DEFAULT 0;

-- Backfill: set position based on addedAt order within each list
UPDATE `ContactListMember` clm
JOIN (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY contactListId ORDER BY addedAt ASC) - 1 AS rn
  FROM `ContactListMember`
) ranked ON clm.id = ranked.id
SET clm.position = ranked.rn;
