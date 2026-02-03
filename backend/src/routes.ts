
import { Router } from 'express';

import userRoutes from './modules/users/users.routes';
import availabilityRoutes from './modules/availability/availability.routes';
import inviteRoutes from './modules/invites/invite.routes';
import playersRoutes from './modules/players/players.routes';
import matchmakingRoutes from './modules/matchmaking/matchmaking.routes';
import groupsRoutes from './modules/groups/groups.routes';
import friendshipsRoutes from './modules/friendships/friendships.routes';
import venuesRoutes from './modules/venues/venues.routes';
import matchesRoutes from './modules/matches/matches.routes';
import resultsRoutes from './modules/results/results.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import messagesRoutes from './modules/messages/messages.routes';
import conversationsRoutes from './modules/conversations/conversations.routes';

const router = Router();

router.use('/users', userRoutes);
router.use('/availability', availabilityRoutes);
router.use('/invites', inviteRoutes);
router.use('/players', playersRoutes);
router.use('/groups', groupsRoutes);
router.use('/friendships', friendshipsRoutes);
router.use('/venues', venuesRoutes);
router.use('/matches', matchesRoutes);
router.use('/results', resultsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/messages', messagesRoutes);
router.use('/conversations', conversationsRoutes);
router.use('/matchmaking', matchmakingRoutes);

export default router;
