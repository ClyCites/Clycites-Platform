import type { PilotStatus } from '@clycites/database';
import type { TransitionPilotInput } from '@clycites/contracts';

export const PILOT_TRANSITIONS: Readonly<
  Record<PilotStatus, Partial<Record<TransitionPilotInput['action'], PilotStatus>>>
> = {
  DRAFT: { SUBMIT_READINESS_REVIEW: 'READINESS_REVIEW' },
  READINESS_REVIEW: { APPROVE_ONBOARDING: 'APPROVED_FOR_ONBOARDING' },
  BLOCKED: { SUBMIT_READINESS_REVIEW: 'READINESS_REVIEW' },
  APPROVED_FOR_ONBOARDING: { START_ONBOARDING: 'ONBOARDING' },
  ONBOARDING: { START_TRAINING: 'TRAINING', PAUSE: 'PAUSED' },
  TRAINING: { START_BASELINE: 'BASELINE_COLLECTION', PAUSE: 'PAUSED' },
  BASELINE_COLLECTION: { START_SUPERVISED_USE: 'SUPERVISED_LIVE_USE', PAUSE: 'PAUSED' },
  SUPERVISED_LIVE_USE: { ACTIVATE: 'ACTIVE', PAUSE: 'PAUSED', COMPLETE: 'COMPLETED' },
  ACTIVE: { PAUSE: 'PAUSED', COMPLETE: 'COMPLETED' },
  PAUSED: { RESUME: 'READINESS_REVIEW', COMPLETE: 'COMPLETED' },
  COMPLETED: { START_EVALUATION: 'EVALUATING' },
  EVALUATING: {},
  GO: { CLOSE: 'CLOSED' },
  CONDITIONAL_GO: { CLOSE: 'CLOSED' },
  NO_GO: { CLOSE: 'CLOSED' },
  CLOSED: {},
};

export const resolvePilotTransition = (
  status: PilotStatus,
  action: TransitionPilotInput['action'],
): PilotStatus | undefined => PILOT_TRANSITIONS[status][action];
