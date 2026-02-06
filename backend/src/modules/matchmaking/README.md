# Matchmaking Testing Guide

## 1. Prepare the Database

- **Run the seeders** to ensure all users with availabilities also have player records:

  ```sh
  npm run seed
  ```

## 2. Get User IDs for Testing

- To find users who have open, future availabilities and at least one candidate (i.e., users who will get matchmaking suggestions), run this SQL query:

  ```sql
  SELECT DISTINCT u.id AS user_id
  FROM matchmaker.user u
  JOIN matchmaker.availability a1 ON a1.userId = u.id
  WHERE a1.status = 'open'
    AND a1.endTime > NOW()
    AND EXISTS (
      SELECT 1
      FROM matchmaker.availability a2
      WHERE a2.status = 'open'
        AND a2.endTime > NOW()
        AND a2.userId <> u.id
        AND a2.date = a1.date
        AND a2.startTime < a1.endTime
        AND a2.endTime > a1.startTime
    )
  LIMIT 10;
  ```

- This will return user IDs that are likely to have matchmaking candidates.

## 3. Call the Matchmaking Endpoint

- Use the following endpoint to get all matchmaking suggestions for a user:

  ```sh
  curl "http://localhost:3000/matchmaking/all?userId=<USER_ID>"
  ```
  Replace `<USER_ID>` with one of the IDs from the query above.

- You can add optional query parameters:
  - `topN` (number of candidates to return)
  - `minScore`, `maxDistanceKm`, `minLevel`, `maxLevel`, `forceRefresh`

  Example:
  ```sh
  curl "http://localhost:3000/matchmaking/all?userId=<USER_ID>&topN=5&minScore=10&forceRefresh=true"
  ```

## 4. What to Expect

- The response will be a JSON array of candidate suggestions for each open, future availability of the user.
- Each candidate includes:
  - `candidateUserId`, `candidatePlayerId`, `score`, `scoreBreakdown`, `reasons`, and overlap/time info.
- If there are no candidates, the array will be empty.
- If you see `candidateLevel: 0`, it means the candidate user does not have a player record (should not happen if you ran the seeder and cleaned up old data).

## 5. Troubleshooting

- If you get errors about missing locations or levels, make sure you:
  - Ran the seeder after cleaning out old data.
  - Only use user IDs from the SQL query above.
- If you change the seeder, always re-run it and clear old data for consistent results.
# Matchmaking Module: Testing Guide

This document explains how to test the matchmaking engine and inspect its results using the provided API and database queries.

## 1. Testing the Matchmaker via API

You can test the matchmaking logic and see detailed, explainable results using the following endpoint:

```
GET http://localhost:3000/matchmaking/test?userId=<USER_ID>&availabilityId=<AVAILABILITY_ID>
```

This will render an HTML table showing all matchmaking candidates for the given user and availability slot, including:
- Total score and breakdown by factor
- Overlap time range
- Both overlapping availability IDs (requester and candidate)
- Human-readable reasons for each suggestion

### Example

```
http://localhost:3000/matchmaking/test?userId=2580e2e0-04ae-4bc1-bd5e-bd126fcbcd35&availabilityId=0054b45e-7c01-4273-93de-2136ea6cc461
```

## 2. Finding Overlapping Availabilities in SQL

To find pairs of availabilities that overlap (for use in testing), you can use the following SQL query:

```sql
SELECT
  a1.id AS avail1,
  a2.id AS avail2,
  a1.userId AS user1,
  a2.userId AS user2,
  a1.date,
  a1.startTime,
  a1.endTime,
  a2.startTime,
  a2.endTime,
  TIMESTAMPDIFF(MINUTE, 
    GREATEST(a1.startTime, a2.startTime),
    LEAST(a1.endTime, a2.endTime)
  ) AS overlap_minutes
FROM matchmaker.availability a1
JOIN matchmaker.availability a2
  ON a1.date = a2.date
  AND a1.userId <> a2.userId
  AND a1.startTime < a2.endTime
  AND a1.endTime > a2.startTime
WHERE
  TIMESTAMPDIFF(MINUTE, 
    GREATEST(a1.startTime, a2.startTime),
    LEAST(a1.endTime, a2.endTime)
  ) >= 60
LIMIT 20;
```

This will return up to 20 pairs of availabilities on the same date, for different users, with overlapping times (within 2 hours of each other).

## 3. Tips
- Use the above SQL to find valid userId and availabilityId pairs for testing.
- The HTML output from `/matchmaking/test` is the best way to visually inspect and debug the matchmaking logic.
- All score components and overlap details are shown for transparency.

---

For further details, see the code in this folder or contact the maintainers.
