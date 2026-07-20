import { describe, expect, it } from 'vitest';

import { resolvePilotTransition } from './pilot-lifecycle.js';

describe('controlled pilot lifecycle', () => {
  it('requires the governed onboarding sequence', () => {
    expect(resolvePilotTransition('DRAFT', 'SUBMIT_READINESS_REVIEW')).toBe('READINESS_REVIEW');
    expect(resolvePilotTransition('READINESS_REVIEW', 'APPROVE_ONBOARDING')).toBe(
      'APPROVED_FOR_ONBOARDING',
    );
    expect(resolvePilotTransition('APPROVED_FOR_ONBOARDING', 'START_ONBOARDING')).toBe(
      'ONBOARDING',
    );
    expect(resolvePilotTransition('ONBOARDING', 'START_TRAINING')).toBe('TRAINING');
    expect(resolvePilotTransition('TRAINING', 'START_BASELINE')).toBe('BASELINE_COLLECTION');
    expect(resolvePilotTransition('BASELINE_COLLECTION', 'START_SUPERVISED_USE')).toBe(
      'SUPERVISED_LIVE_USE',
    );
  });

  it('rejects activation shortcuts and final automated decisions', () => {
    expect(resolvePilotTransition('DRAFT', 'ACTIVATE')).toBeUndefined();
    expect(resolvePilotTransition('READINESS_REVIEW', 'START_SUPERVISED_USE')).toBeUndefined();
    expect(resolvePilotTransition('EVALUATING', 'CLOSE')).toBeUndefined();
  });

  it('makes pause readmission pass through readiness review', () => {
    expect(resolvePilotTransition('ACTIVE', 'PAUSE')).toBe('PAUSED');
    expect(resolvePilotTransition('PAUSED', 'RESUME')).toBe('READINESS_REVIEW');
  });
});
