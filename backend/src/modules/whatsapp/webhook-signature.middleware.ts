import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../../config/logger';

/**
 * Incoming webhook signature header per provider.
 *
 * Whapi:    https://whapi.cloud/docs — header: x-whapi-signature
 *           Verification: HMAC-SHA256 of raw body, hex-encoded, prefixed with "sha256=".
 *
 * Wasender: header: x-webhook-signature
 *           Verification: raw secret compared directly against the header value.
 */
const SIGNATURE_HEADER: Record<string, string> = {
  whapi: 'x-whapi-signature',
  wasender: 'x-webhook-signature',
};

/**
 * Middleware that verifies incoming WhatsApp webhook requests.
 *
 * Configure via env:
 *   WHAPI_WEBHOOK_SECRET=...    (when WHATSAPP_PROVIDER=whapi)
 *   WASENDER_WEBHOOK_SECRET=... (when WHATSAPP_PROVIDER=wasender)
 *
 * If no secret is configured for the active provider the middleware logs a warning and
 * passes the request through — this preserves backwards compatibility in development and
 * in environments where the secret has not been set yet. Set the secret in production.
 */
export function verifyWebhookSignature(req: Request, res: Response, next: NextFunction): void {
  const provider = (process.env.WHATSAPP_PROVIDER ?? 'mock').toLowerCase();

  if (provider === 'mock') {
    return next();
  }

  const secretKey = `${provider.toUpperCase()}_WEBHOOK_SECRET`;
  const secret = process.env[secretKey];

  if (!secret) {
    logger.warn(`[webhook] ${secretKey} not set — skipping signature verification. Set it in production.`);
    return next();
  }

  const headerName = SIGNATURE_HEADER[provider];
  if (!headerName) {
    // Unknown provider with a secret configured — let it through rather than hard-blocking.
    logger.warn(`[webhook] No signature header mapping for provider "${provider}" — skipping verification.`);
    return next();
  }

  const signature = req.headers[headerName] as string | undefined;
  if (!signature) {
    res.status(401).json({ error: 'Missing webhook signature' });
    return;
  }

  // Wasender compares the header value directly against the secret (no HMAC).
  if (provider === 'wasender') {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(secret))) {
      logger.warn('[webhook] Invalid signature from wasender');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
    return next();
  }

  // Whapi (and future providers): HMAC-SHA256 of raw body, prefixed with "sha256=".
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!rawBody) {
    logger.error('[webhook] rawBody unavailable — express.json verify callback may be missing');
    res.status(500).json({ error: 'Internal error' });
    return;
  }

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  // Reject immediately on length mismatch (expected is always the same fixed length).
  if (signature.length !== expected.length) {
    logger.warn(`[webhook] Signature length mismatch from ${provider}`);
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    logger.warn(`[webhook] Invalid signature from ${provider}`);
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  next();
}
