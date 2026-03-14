
import { Router } from 'express';

import healthRoutes from './modules/health/health.routes';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/users.routes';
import availabilityRoutes from './modules/availabilities/availability.routes';
import inviteRoutes from './modules/invites/invite.routes';
import playersRoutes from './modules/players/players.routes';
import matchmakingRoutes from './modules/matchmaking/matchmaking.routes';
import groupsRoutes from './modules/groups/groups.routes';
import friendshipsRoutes from './modules/friendships/friendships.routes';
import guestContactsRoutes from './modules/guest-contacts/guest-contacts.routes';
import venuesRoutes from './modules/venues/venues.routes';
import matchesRoutes from './modules/matches/matches.routes';
import resultsRoutes from './modules/results/results.routes';
import notificationsRoutes from './modules/notifications/notifications.routes';
import messagesRoutes from './modules/messages/messages.routes';
import conversationsRoutes from './modules/conversations/conversations.routes';
import schedulingRoutes from './modules/scheduling/scheduling.routes';
import whatsappRoutes from './modules/whatsapp/whatsapp.routes';
import remindersRoutes from './modules/reminders/reminders.routes';
import bookingRoutes from './modules/booking/booking.routes';

const router = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/availability', availabilityRoutes);
router.use('/invites', inviteRoutes);
router.use('/players', playersRoutes);
router.use('/groups', groupsRoutes);
router.use('/friendships', friendshipsRoutes);
router.use('/guest-contacts', guestContactsRoutes);
router.use('/venues', venuesRoutes);
router.use('/matches', matchesRoutes);
router.use('/results', resultsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/messages', messagesRoutes);
router.use('/conversations', conversationsRoutes);
router.use('/matchmaking', matchmakingRoutes);
router.use('/scheduling', schedulingRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/reminders', remindersRoutes);
router.use('/booking', bookingRoutes);

export default router;
