import express from 'express';
import routes from './routes';

import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';

const app = express();

// Parse JSON bodies
app.use(express.json());

// Swagger/OpenAPI setup
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Feature flag for jobs
if (process.env.JOBS_ENABLED === 'true') {
	// eslint-disable-next-line no-console
	console.log('[JOBS] Scheduling background jobs...');
	import('./modules/jobs').then(({ scheduleAllJobs }) => scheduleAllJobs());
}

// Mount main routes
app.use('/', routes);

// Global error handler (must be last)
import { errorHandler } from './shared/errors/errorHandler';
app.use(errorHandler);

export default app;
