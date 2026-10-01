import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationProviderService } from './notification-provider.service.js';

vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn() },
}));

describe('NotificationProviderService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submits rendered email through SMTP without logging content', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'smtp-message-id' });
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);
    const service = new NotificationProviderService(
      new ConfigService({
        EMAIL_PROVIDER: 'smtp',
        SMTP_HOST: 'smtp.example.com',
        SMTP_PORT: 587,
        SMTP_SECURE: false,
        EMAIL_FROM_ADDRESS: 'notifications@example.com',
        EMAIL_FROM_NAME: 'Clycites',
      }),
    );

    await expect(
      service.submit({
        notificationDeliveryId: 'delivery-id',
        provider: 'email',
        templateCode: 'PASSWORD_RESET',
        recipient: 'farmer@example.com',
        subject: 'Reset password',
        text: 'secret rendered body',
      }),
    ).resolves.toEqual({ providerReference: 'smtp-message-id', provider: 'smtp' });
    expect(sendMail).toHaveBeenCalledWith({
      from: { address: 'notifications@example.com', name: 'Clycites' },
      to: 'farmer@example.com',
      subject: 'Reset password',
      text: 'secret rendered body',
    });
  });
});
