export const CALIBRATION_VALIDITY_YEARS = 1;

type Instrument = {
  id: string;
  status: 'ACTIVE' | 'INACTIVE' | 'RETIRED';
  calibratedAt: Date;
};

export type InstrumentAssessment = {
  reportedInstrumentId?: string;
  instrumentId?: string;
  instrumentFlagged: boolean;
  instrumentFlagReason:
    | 'INSTRUMENT_NOT_RECORDED'
    | 'INSTRUMENT_NOT_REGISTERED'
    | 'INSTRUMENT_INACTIVE'
    | 'CALIBRATION_LAPSED'
    | null;
};

export const assessWeighingInstrument = (
  reportedInstrumentId: string | undefined,
  instrument: Instrument | null,
  capturedAt: Date,
): InstrumentAssessment => {
  if (!reportedInstrumentId) {
    return {
      instrumentFlagged: true,
      instrumentFlagReason: 'INSTRUMENT_NOT_RECORDED',
    };
  }
  if (!instrument) {
    return {
      reportedInstrumentId,
      instrumentFlagged: true,
      instrumentFlagReason: 'INSTRUMENT_NOT_REGISTERED',
    };
  }
  if (instrument.status !== 'ACTIVE') {
    return {
      reportedInstrumentId,
      instrumentId: instrument.id,
      instrumentFlagged: true,
      instrumentFlagReason: 'INSTRUMENT_INACTIVE',
    };
  }

  const calibrationExpiresAt = new Date(instrument.calibratedAt);
  calibrationExpiresAt.setUTCFullYear(
    calibrationExpiresAt.getUTCFullYear() + CALIBRATION_VALIDITY_YEARS,
  );
  if (capturedAt > calibrationExpiresAt) {
    return {
      reportedInstrumentId,
      instrumentId: instrument.id,
      instrumentFlagged: true,
      instrumentFlagReason: 'CALIBRATION_LAPSED',
    };
  }
  return {
    reportedInstrumentId,
    instrumentId: instrument.id,
    instrumentFlagged: false,
    instrumentFlagReason: null,
  };
};
