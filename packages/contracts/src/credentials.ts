import { z } from 'zod';

export const accountClassSchema = z.enum(['STAFF', 'FARMER']);

const email = z.string().trim().toLowerCase().email().max(320);
const password = z.string().min(1).max(128);
const token = z.string().min(32).max(512);
const name = z.string().trim().min(1).max(100);

export const issueUserInvitationSchema = z
  .object({
    email,
    firstName: name,
    lastName: name,
    role: z.enum([
      'COOPERATIVE_ADMIN',
      'COLLECTION_AGENT',
      'FINANCE_OFFICER',
      'QUALITY_INSPECTOR',
      'BUYER',
      'VIEWER',
    ]),
    accountClass: accountClassSchema,
  })
  .strict();

export const acceptUserInvitationSchema = z.object({ token, password }).strict();
export const passwordResetRequestSchema = z.object({ email }).strict();
export const passwordResetConfirmSchema = z.union([
  z.object({ token, password }).strict(),
  z.object({ email, code: z.string().regex(/^\d{6}$/), password }).strict(),
]);
export const farmerAccountResetRedeemSchema = z.object({ code: token, password }).strict();
export const passwordChangeSchema = z
  .object({ currentPassword: password, newPassword: password })
  .strict();
export const emailVerificationConfirmSchema = z.object({ token }).strict();
export const deviceTokenRequestSchema = z.union([
  z.object({ devicePublicId: z.string().trim().min(1).max(128), deviceToken: token }).strict(),
  z.object({ refreshToken: token }).strict(),
]);
export const mfaChallengeVerificationSchema = z
  .object({ challengeToken: token, code: z.string().trim().min(6).max(64) })
  .strict();

export type AccountClass = z.infer<typeof accountClassSchema>;
export type IssueUserInvitation = z.infer<typeof issueUserInvitationSchema>;
export type AcceptUserInvitation = z.infer<typeof acceptUserInvitationSchema>;
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;
export type FarmerAccountResetRedeem = z.infer<typeof farmerAccountResetRedeemSchema>;
export type PasswordChange = z.infer<typeof passwordChangeSchema>;
export type EmailVerificationConfirm = z.infer<typeof emailVerificationConfirmSchema>;
export type DeviceTokenRequest = z.infer<typeof deviceTokenRequestSchema>;
export type MfaChallengeVerification = z.infer<typeof mfaChallengeVerificationSchema>;
