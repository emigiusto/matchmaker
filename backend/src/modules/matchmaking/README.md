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
