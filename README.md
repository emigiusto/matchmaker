
# MatchMaker

MatchMaker is a platform to organize sports matches efficiently, focusing on player availability, seamless invites, and secure confirmations. WhatsApp is used only as a delivery channel for notifications and links—never for parsing replies.

## General Direction & Product Vision
- Make organizing matches easy for both organizers and players
- Secure, auditable confirmations via unique links
- Prioritize privacy and user control
- No ambiguous group chat replies—only unique links for confirmations

## Core Flows
1. **Availability**: Players submit when/where they can play
2. **Invites**: Organizers send invites with unique, time-limited links
3. **Confirmation**: Players confirm/decline only via the invite link
4. **Matchmaking**: System helps fill matches with best available players

## Why Unique Links?
- Only intended recipient can respond
- No ambiguity from group chat replies
- Full audit trail for organizers

## Backend Setup
See [backend/README.md](backend/README.md) for full instructions:
- Install dependencies
- Create MySQL database
- Configure `.env`
- Run migrations
- Start server

## API Testing
- Use Postman or curl to test endpoints (see backend README for details)
- Example: Create user, player, availability, invite, etc.

## Roadmap / TODO
- Mobile app
- In-app notifications
- Advanced analytics
- Payment integration