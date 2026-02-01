
import { Router } from 'express';
import userRoutes from './modules/users/users.routes';
import availabilityRoutes from './modules/availability/availability.routes';
import inviteRoutes from './modules/invites/invite.routes';
import playersRoutes from './modules/players/players.routes';

const router = Router();


router.use('/users', userRoutes);
router.use('/availability', availabilityRoutes);
router.use('/invites', inviteRoutes);
router.use('/players', playersRoutes);
// Matches routes not implemented yet
router.use('/matches', (req, res) => {
  res.json({ status: 'not implemented' });
});

export default router;
