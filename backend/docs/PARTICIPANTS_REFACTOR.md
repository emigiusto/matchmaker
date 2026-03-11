# Match & SchedulingRequest: Participants Refactor

## Goal
Store match participants without defining teams upfront. Teams (A/B) are assigned when the result is loaded.

## Schema Changes

### MatchParticipant (new)
- `matchId`, `userId` - the participant
- `team` - 'A' | 'B' | null (null until result defines teams)
- Unique(matchId, userId)

### Match (modified)
- **Remove**: hostUserId, opponentUserId, hostPartnerUserId, opponentPartnerUserId
- **Add**: participants → MatchParticipant[]
- Keep: availabilityId, scheduledAt, type, status, whatsappGroupId, etc.
- `availability.userId` = creator/owner of the slot (for authorization)

### SchedulingRequest
- **Keep** hostUserId (creator of the request, always a participant)
- **Remove** hostPartnerUserId - participants derived from host + accepted candidates
- Participants = host + candidates with status=accepted

### Result flow (when loading result)
- User defines Team A and Team B (who played together)
- MatchParticipant.team is set: 'A' or 'B'
- SetResult: playerAScore = Team A, playerBScore = Team B
- winnerUserId = one person from winning team (or add winnerTeam: 'A'|'B')

## Migration Order
1. Create MatchParticipant, add to Match
2. Backfill MatchParticipant from existing Match data
3. Update createMatch, completeScheduling to use MatchParticipant
4. Update Result flow for team assignment
5. Drop host/opponent from Match
6. Update User model relations
