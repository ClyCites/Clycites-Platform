import { z } from 'zod';

const credentialParametersSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export const notificationTemplates = {
  INVITATION: { version: 1, containsSecret: true, parameters: credentialParametersSchema },
  PASSWORD_RESET: { version: 1, containsSecret: true, parameters: credentialParametersSchema },
  EMAIL_VERIFICATION: { version: 1, containsSecret: true, parameters: credentialParametersSchema },
  FARMER_ACCOUNT_RESET: {
    version: 1,
    containsSecret: true,
    parameters: z.object({ message: z.string().min(1), resetId: z.uuid() }),
  },
  PAYMENT_RECONCILED: {
    version: 1,
    containsSecret: false,
    parameters: z.object({ amountMinor: z.string().regex(/^\d+$/), currency: z.string().length(3) }),
  },
} as const;

export type NotificationTemplateCode = keyof typeof notificationTemplates;

export function assertNotificationTemplate(
  code: string,
  version: number,
  parameters: unknown,
): NotificationTemplateCode {
  if (!(code in notificationTemplates)) throw new Error(`Unknown notification template: ${code}`);
  const templateCode = code as NotificationTemplateCode;
  const template = notificationTemplates[templateCode];
  if (template.version !== version) throw new Error(`Unsupported ${code} template version`);
  template.parameters.parse(parameters);
  return templateCode;
}

export function renderEmailNotification(
  code: string,
  version: number,
  parameters: unknown,
): { subject: string; text: string } {
  const templateCode = assertNotificationTemplate(code, version, parameters);
  if (templateCode === 'FARMER_ACCOUNT_RESET')
    throw new Error('In-app notification cannot be rendered as email');
  if (templateCode === 'PAYMENT_RECONCILED')
    throw new Error('Payment notification cannot be rendered as credential email');
  const parsed = credentialParametersSchema.parse(parameters);
  const labels = {
    INVITATION: ['Your Clycites invitation', 'Accept your invitation'],
    PASSWORD_RESET: ['Reset your Clycites password', 'Use this password reset credential'],
    EMAIL_VERIFICATION: ['Verify your Clycites email', 'Use this email verification credential'],
  } as const;
  const [subject, instruction] = labels[templateCode];
  return {
    subject,
    text: `${instruction}: ${parsed.token}\n\nThis credential expires at ${parsed.expiresAt}.`,
  };
}