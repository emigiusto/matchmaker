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
            // ...other user fields
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
            rating: { type: 'number', description: 'Player rating' },
            isActive: { type: 'boolean', description: 'Is active' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Updated at' },
            // ...other player fields
          },
          required: ['id', 'userId', 'rating', 'isActive', 'createdAt', 'updatedAt']
        },
        PlayerInput: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'User ID' },
            rating: { type: 'number', description: 'Player rating' }
          },
          required: ['userId', 'rating']
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
            groupId: { type: 'string', description: 'Group ID' },
            senderId: { type: 'string', description: 'Sender User ID' },
            recipientId: { type: 'string', description: 'Recipient User ID' },
            status: { type: 'string', enum: ['pending', 'accepted', 'declined'], description: 'Invite status' },
            token: { type: 'string', description: 'Invite token' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Updated at' },
          },
          required: ['id', 'groupId', 'senderId', 'recipientId', 'status', 'token', 'createdAt', 'updatedAt']
        },
        InviteInput: {
          type: 'object',
          properties: {
            groupId: { type: 'string', description: 'Group ID' },
            recipientId: { type: 'string', description: 'Recipient User ID' }
          },
          required: ['groupId', 'recipientId']
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
            groupId: { type: 'string', description: 'Group ID' },
            venueId: { type: 'string', description: 'Venue ID' },
            scheduledAt: { type: 'string', format: 'date-time', description: 'Scheduled date/time' },
            status: { type: 'string', enum: ['scheduled', 'completed', 'cancelled'], description: 'Match status' },
            createdAt: { type: 'string', format: 'date-time', description: 'Created at' },
            updatedAt: { type: 'string', format: 'date-time', description: 'Updated at' },
          },
          required: ['id', 'groupId', 'venueId', 'scheduledAt', 'status', 'createdAt', 'updatedAt']
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
