import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

const mockHandleCandidateResponse = vi.fn();
vi.mock('../scheduling/scheduling.service', () => ({
  schedulingService: {
    handleCandidateResponse: (...args: unknown[]) => mockHandleCandidateResponse(...args),
  },
}));

vi.mock('./whatsapp.service', () => ({
  whatsappService: {
    parseWebhookPayload: vi.fn(),
  },
}));

import { WhatsappController } from './whatsapp.controller';
import { whatsappService } from './whatsapp.service';

describe('WhatsappController', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { body: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it('returns 200 with processed=false when payload is not parsable', async () => {
    (whatsappService.parseWebhookPayload as ReturnType<typeof vi.fn>).mockReturnValue(null);

    await WhatsappController.webhook(
      req as Request,
      res as Response,
      next as any,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true, processed: false });
    expect(mockHandleCandidateResponse).not.toHaveBeenCalled();
  });

  it('calls handleCandidateResponse and returns processed result', async () => {
    (whatsappService.parseWebhookPayload as ReturnType<typeof vi.fn>).mockReturnValue({
      senderPhone: '34612345678',
      messageText: 'YES',
    });
    mockHandleCandidateResponse.mockResolvedValue({ processed: true });

    await WhatsappController.webhook(
      req as Request,
      res as Response,
      next as any,
    );

    expect(mockHandleCandidateResponse).toHaveBeenCalledWith('34612345678', 'YES', undefined);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true, processed: true });
  });

  it('calls next on error', async () => {
    (whatsappService.parseWebhookPayload as ReturnType<typeof vi.fn>).mockReturnValue({
      senderPhone: '34612345678',
      messageText: 'YES',
    });
    mockHandleCandidateResponse.mockRejectedValue(new Error('DB error'));

    await WhatsappController.webhook(
      req as Request,
      res as Response,
      next as any,
    );

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.status).not.toHaveBeenCalled();
  });
});
