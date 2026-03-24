import express from 'express';
import cors from 'cors';
import routes from './routes';

import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';
import { errorHandler } from './shared/errors/errorHandler';
import { requestContextMiddleware } from './shared/middleware/requestContextMiddleware';
import { configureRatingSystem } from './modules/rating/rating.bootstrap';

const app = express();

// Configure rating system before handling requests
configureRatingSystem();

// CORS
const isDev = process.env.ENVIRONMENT === 'DEVELOPMENT';
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(isDev
  ? { origin: true } // allow any origin in development
  : corsOrigin ? { origin: corsOrigin.split(',').map((o) => o.trim()) } : {}));

// Set per-request context (e.g. isImpersonated) for use deeper in the call stack
app.use(requestContextMiddleware);

// Parse JSON bodies — capture raw buffer for webhook HMAC verification
app.use(express.json({
  verify: (req, _res, buf) => {
    (req as unknown as { rawBody: Buffer }).rawBody = buf;
  },
}));

// Swagger/OpenAPI setup
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Feature flag for jobs
if (process.env.JOBS_ENABLED === 'true') {
	// eslint-disable-next-line no-console
	console.log('[JOBS] Scheduling background jobs...');
	import('./modules/jobs')
		.then(({ scheduleAllJobs }) => scheduleAllJobs())
		.catch((err) => {
			// eslint-disable-next-line no-console
			console.error('[JOBS] Failed to load jobs:', err);
		});
} else {
	// eslint-disable-next-line no-console
	if (process.env.NODE_ENV !== 'test') console.log('[JOBS] Disabled (JOBS_ENABLED != true)');
}

// Mount main routes
app.use('/', routes);


// Global error handler (must be last)
app.use(errorHandler);

export default app;
