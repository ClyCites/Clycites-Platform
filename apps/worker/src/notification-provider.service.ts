import { Injectable } from '@nestjs/common';

export interface NotificationSubmission {
  notificationDeliveryId: string;
  provider: string;
  templateCode: string;
}

@Injectable()
export class NotificationProviderService {
  submit(input: NotificationSubmission): Promise<{ providerReference: string }> {
    if (!['mock', 'console'].includes(input.provider)) {
      throw new Error('Notification provider is disabled');
    }
    return Promise.resolve({
      providerReference: `${input.provider}-${input.notificationDeliveryId}`,
    });
  }
}
