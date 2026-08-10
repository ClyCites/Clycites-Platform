import { describe, expect, it } from 'vitest';

import { assessWeighingInstrument } from './delivery-instrument.js';

describe('delivery instrument provenance', () => {
  it('Capture invariant 2: flags a missing instrument without rejecting capture', () => {
    expect(assessWeighingInstrument(undefined, null, new Date('2026-08-10T08:00:00Z'))).toEqual({
      instrumentFlagged: true,
      instrumentFlagReason: 'INSTRUMENT_NOT_RECORDED',
    });
  });

  it('Capture invariant 2: records an active instrument with current calibration', () => {
    expect(
      assessWeighingInstrument(
        '11111111-1111-4111-8111-111111111111',
        {
          id: '11111111-1111-4111-8111-111111111111',
          status: 'ACTIVE',
          calibratedAt: new Date('2026-01-10T00:00:00Z'),
        },
        new Date('2026-08-10T08:00:00Z'),
      ),
    ).toEqual({
      reportedInstrumentId: '11111111-1111-4111-8111-111111111111',
      instrumentId: '11111111-1111-4111-8111-111111111111',
      instrumentFlagged: false,
      instrumentFlagReason: null,
    });
  });

  it('Capture invariant 2: flags lapsed calibration at capture time', () => {
    expect(
      assessWeighingInstrument(
        '11111111-1111-4111-8111-111111111111',
        {
          id: '11111111-1111-4111-8111-111111111111',
          status: 'ACTIVE',
          calibratedAt: new Date('2024-08-10T00:00:00Z'),
        },
        new Date('2026-08-10T08:00:00Z'),
      ),
    ).toMatchObject({
      instrumentFlagged: true,
      instrumentFlagReason: 'CALIBRATION_LAPSED',
    });
  });
});
