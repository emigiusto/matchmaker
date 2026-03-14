-- Delete Reminder rows whose matchId references a non-existent Match.
-- These were created before onDelete: Cascade was enforced on the FK.
DELETE FROM `Reminder`
WHERE `matchId` NOT IN (SELECT `id` FROM `Match`);
