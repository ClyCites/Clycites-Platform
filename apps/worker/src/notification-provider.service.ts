import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { z } from 'zod';

import type { WorkerEnvironment } from './environment.js';

export interface NotificationSubmission {
  notificationDeliveryId: string;
  provider: string;
  templateCode: string;
  recipient: string;
  subject: string;
  text: string;
}

@Injectable()
export class NotificationProviderService {
  private readonly transport?: Transporter;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<WorkerEnvironment, true>,
  ) {
    if (config.getOrThrow('EMAIL_PROVIDER', { infer: true }) === 'smtp') {
      const username = config.get('SMTP_USERNAME', { infer: true });
      this.transport = nodemailer.createTransport({
        host: config.getOrThrow('SMTP_HOST', { infer: true }),
        port: config.getOrThrow('SMTP_PORT', { infer: true }),
        secure: config.getOrThrow('SMTP_SECURE', { infer: true }),
        ...(username
          ? {
              auth: {
                user: username,
                pass: config.getOrThrow('SMTP_PASSWORD', { infer: true }),
              },
            }
          : {}),
      });
    }
  }

  async submit(input: NotificationSubmission): Promise<{ providerReference: string; provider: string }> {
    if (!['mock', 'console', 'email'].includes(input.provider)) {
      throw new Error('Notification provider is disabled');
    }
    const provider = input.provider === 'email'
      ? this.config.getOrThrow('EMAIL_PROVIDER', { infer: true })
      : input.provider;
    if (provider !== 'smtp')
      return { providerReference: `${provider}-${input.notificationDeliveryId}`, provider };
    const result = z.object({ messageId: z.string().min(1) }).parse(
      await this.transport!.sendMail({
        from: {
          address: this.config.getOrThrow('EMAIL_FROM_ADDRESS', { infer: true }),
          name: this.config.getOrThrow('EMAIL_FROM_NAME', { infer: true }),
        },
        to: input.recipient,
        subject: input.subject,
        text: input.text,
      }),
    );
    return { providerReference: result.messageId, provider };
  }
}
