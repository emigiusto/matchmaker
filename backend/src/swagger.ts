// swagger.ts
// Centralized Swagger/OpenAPI configuration for the Matchmaker API

import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Matchmaker API',
      version: '1.0.0',
      description: 'API documentation for the Matchmaker backend',
    },
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'User ID' },
            name: { type: 'string', description: 'User name' },
            email: { type: 'string', description: 'User email' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Updated at' },
          },
          required: ['id', 'name', 'email', 'createdAt', 'updatedAt']
        },
        UserInput: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'User name' },
            email: { type: 'string', description: 'User email' },
            password: { type: 'string', description: 'User password' }
          },
          required: ['name', 'email', 'password']
        },
        Player: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Player ID' },
            userId: { type: 'string', description: 'User ID' },
            levelValue: { type: 'number', nullable: true, description: 'Player level value' },
            levelConfidence: { type: 'number', nullable: true, description: 'Player level confidence' },
            isActive: { type: 'boolean', description: 'Is active' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Updated at' },
          },
          required: ['id', 'userId', 'isActive', 'createdAt', 'updatedAt']
        },
        PlayerInput: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User ID' },
            levelValue: { type: 'number', nullable: true, description: 'Player level value' },
            levelConfidence: { type: 'number', nullable: true, description: 'Player level confidence' },
          },
          required: ['userId']
        },
        Notification: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Notification ID' },
            userId: { type: 'string', description: 'User ID' },
            message: { type: 'string', description: 'Notification message' },
            read: { type: 'boolean', description: 'Read status' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
          },
          required: ['id', 'userId', 'message', 'read', 'createdAt']
        },
        NotificationInput: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User ID' },
            message: { type: 'string', description: 'Notification message' }
          },
          required: ['userId', 'message']
        },
        Invite: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Invite ID' },
            token: { type: 'string', description: 'Opaque invite token' },
            status: { type: 'string', enum: ['pending', 'accepted', 'cancelled', 'expired'], description: 'Invite status' },
            expiresAt: { type: 'string', format: 'date-time', description: 'Expiration datetime (ISO8601)' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            availabilityId: { type: 'string', description: 'Availability ID' },
            inviterUserId: { type: 'string', description: 'User who sent the invite' },
            matchId: { type: 'string', nullable: true, description: 'Match created from this invite, if any' },
            visibility: { type: 'string', enum: ['private', 'community'], description: 'Visibility' },
            minLevel: { type: 'number', nullable: true, description: 'Minimum level filter' },
            maxLevel: { type: 'number', nullable: true, description: 'Maximum level filter' },
            radiusKm: { type: 'number', nullable: true, description: 'Distance radius in km' },
            matchType: { type: 'string', enum: ['competitive', 'practice'], description: 'Match type (competitive or practice)' },
          },
          required: [
            'id',
            'token',
            'status',
            'expiresAt',
            'createdAt',
            'availabilityId',
            'inviterUserId',
            'visibility',
            'matchType'
          ]
        },
        InviteInput: {
          type: 'object',
          properties: {
            availabilityId: { type: 'string', format: 'uuid', description: 'Availability ID' },
            inviterUserId: { type: 'string', format: 'uuid', description: 'User who sends the invite' },
            matchType: { type: 'string', enum: ['competitive', 'practice'], description: 'Optional. Defaults to competitive.' },
          },
          required: ['availabilityId', 'inviterUserId']
        },
        Group: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Group ID' },
            name: { type: 'string', description: 'Group name' },
            ownerId: { type: 'string', description: 'Owner User ID' },
            memberIds: { type: 'array', items: { type: 'string' }, description: 'Member User IDs' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Updated at' },
          },
          required: ['id', 'name', 'ownerId', 'memberIds', 'createdAt', 'updatedAt']
        },
        GroupInput: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Group name' },
            ownerId: { type: 'string', description: 'Owner User ID' }
          },
          required: ['name', 'ownerId']
        },
        Match: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Match ID' },
            inviteId: { type: 'string', nullable: true, description: 'Invite ID' },
            availabilityId: { type: 'string', nullable: true, description: 'Availability ID' },
            venueId: { type: 'string', nullable: true, description: 'Venue ID' },
            playerAId: { type: 'string', nullable: true, description: 'Player A ID' },
            playerBId: { type: 'string', nullable: true, description: 'Player B ID' },
            hostUserId: { type: 'string', description: 'Host user ID' },
            opponentUserId: { type: 'string', description: 'Opponent user ID' },
            scheduledAt: { type: 'string', format: 'date-time', description: 'Scheduled date/time' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            status: { type: 'string', enum: ['scheduled', 'awaiting_confirmation', 'completed', 'cancelled', 'disputed'], description: 'Match status' },
            type: { type: 'string', enum: ['competitive', 'practice'], description: 'Match type (competitive or practice)' },
          },
          required: [
            'id',
            'hostUserId',
            'opponentUserId',
            'scheduledAt',
            'createdAt',
            'status',
            'type'
          ]
        },
        MatchInput: {
          type: 'object',
          properties: {
            groupId: { type: 'string', description: 'Group ID' },
            venueId: { type: 'string', description: 'Venue ID' },
            scheduledAt: { type: 'string', format: 'date-time', description: 'Scheduled date/time' }
          },
          required: ['groupId', 'venueId', 'scheduledAt']
        },
        Result: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Result ID' },
            matchId: { type: 'string', description: 'Match ID' },
            winnerId: { type: 'string', description: 'Winner Player ID' },
            score: { type: 'string', description: 'Score (e.g. 3-2)' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Updated at' },
          },
          required: ['id', 'matchId', 'winnerId', 'score', 'createdAt', 'updatedAt']
        },
        ResultInput: {
          type: 'object',
          properties: {
            matchId: { type: 'string', description: 'Match ID' },
            winnerId: { type: 'string', description: 'Winner Player ID' },
            score: { type: 'string', description: 'Score (e.g. 3-2)' }
          },
          required: ['matchId', 'winnerId', 'score']
        },
        Conversation: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Conversation ID' },
            participantIds: { type: 'array', items: { type: 'string' }, description: 'Participant User IDs' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Updated at' },
          },
          required: ['id', 'participantIds', 'createdAt', 'updatedAt']
        },
        ConversationInput: {
          type: 'object',
          properties: {
            participantIds: { type: 'array', items: { type: 'string' }, description: 'Participant User IDs' }
          },
          required: ['participantIds']
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Message ID' },
            conversationId: { type: 'string', description: 'Conversation ID' },
            senderId: { type: 'string', description: 'Sender User ID' },
            content: { type: 'string', description: 'Message content' },
            sentAt: { type: 'string', format: 'date-time', description: 'Sent at' },
          },
          required: ['id', 'conversationId', 'senderId', 'content', 'sentAt']
        },
        MessageInput: {
          type: 'object',
          properties: {
            conversationId: { type: 'string', description: 'Conversation ID' },
            content: { type: 'string', description: 'Message content' }
          },
          required: ['conversationId', 'content']
        },
        Friendship: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Friendship ID' },
            userId: { type: 'string', description: 'User ID' },
            friendId: { type: 'string', description: 'Friend User ID' },
            status: { type: 'string', enum: ['pending', 'accepted', 'blocked'], description: 'Friendship status' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Updated at' },
          },
          required: ['id', 'userId', 'friendId', 'status', 'createdAt', 'updatedAt']
        },
        FriendshipInput: {
          type: 'object',
          properties: {
            friendId: { type: 'string', description: 'Friend User ID' }
          },
          required: ['friendId']
        },
        Venue: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Venue ID' },
            name: { type: 'string', description: 'Venue name' },
            address: { type: 'string', description: 'Venue address' },
            capacity: { type: 'integer', description: 'Venue capacity' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Updated at' },
          },
          required: ['id', 'name', 'address', 'capacity', 'createdAt', 'updatedAt']
        },
        VenueInput: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Venue name' },
            address: { type: 'string', description: 'Venue address' },
            capacity: { type: 'integer', description: 'Venue capacity' }
          },
          required: ['name', 'address', 'capacity']
        },
        Availability: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Availability ID' },
            playerId: { type: 'string', description: 'Player ID' },
            start: { type: 'string', format: 'date-time', description: 'Start time' },
            end: { type: 'string', format: 'date-time', description: 'End time' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Updated at' },
          },
          required: ['id', 'playerId', 'start', 'end', 'createdAt', 'updatedAt']
        },
        AvailabilityInput: {
          type: 'object',
          properties: {
            playerId: { type: 'string', description: 'Player ID' },
            start: { type: 'string', format: 'date-time', description: 'Start time' },
            end: { type: 'string', format: 'date-time', description: 'End time' }
          },
          required: ['playerId', 'start', 'end']
        },
      }
    }
  },
  apis: ['./src/modules/**/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);
