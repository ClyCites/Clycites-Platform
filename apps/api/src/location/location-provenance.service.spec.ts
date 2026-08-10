import { describe, expect, it } from 'vitest';

import {
  assessLocation,
  calculateDistanceMeters,
  declaredHectares,
  isAreaDiscrepancyFlagged,
  validateFarmPlotBoundary,
} from './location-provenance.service.js';

describe('location provenance calculations', () => {
  it('calculates haversine distance against a known equatorial fixture', () => {
    expect(calculateDistanceMeters(0, 32, 0, 33)).toBe(111_195);
  });

  it('treats missing collection-point coordinates as absent evidence', () => {
    expect(
      assessLocation(
        { latitude: null, longitude: null },
        { latitude: 0.31, longitude: 32.58, accuracyMeters: 10 },
        500,
      ),
    ).toEqual({ distanceMeters: null, flagged: false });
  });

  it('does not flag a reading whose accuracy exceeds the distance threshold', () => {
    expect(
      assessLocation(
        { latitude: 0.31, longitude: 32.58 },
        { latitude: 0.36, longitude: 32.58, accuracyMeters: 750 },
        500,
      ),
    ).toMatchObject({ distanceMeters: expect.any(Number), flagged: false });
  });

  it('converts declared acres to hectares', () => {
    expect(declaredHectares('10', 'ACRE')).toBeCloseTo(4.04686, 5);
    expect(declaredHectares('10', 'HECTARE')).toBe(10);
  });

  it('validates a Uganda GeoJSON polygon and derives its survey facts', () => {
    const result = validateFarmPlotBoundary({
      type: 'Polygon',
      coordinates: [
        [
          [32.58, 0.31],
          [32.581, 0.31],
          [32.581, 0.311],
          [32.58, 0.311],
          [32.58, 0.31],
        ],
      ],
    });

    expect(result.vertexCount).toBe(5);
    expect(result.centroidLatitude).toBeCloseTo(0.3105, 6);
    expect(result.centroidLongitude).toBeCloseTo(32.5805, 6);
    expect(result.computedHectares).toBeGreaterThan(1);
  });

  it.each([
    { type: 'Point', coordinates: [32.58, 0.31] },
    {
      type: 'Polygon',
      coordinates: [
        [
          [28, 0],
          [28.1, 0],
          [28.1, 0.1],
          [28, 0],
        ],
      ],
    },
    {
      type: 'Polygon',
      coordinates: [
        [
          [32.58, 0.31],
          [32.59, 0.31],
          [32.59, 0.32],
          [32.58, 0.32],
        ],
      ],
    },
  ])('rejects malformed or out-of-country boundary %#', (boundary) => {
    expect(() => validateFarmPlotBoundary(boundary)).toThrow();
  });

  it('rejects a self-intersecting polygon', () => {
    expect(() =>
      validateFarmPlotBoundary({
        type: 'Polygon',
        coordinates: [
          [
            [32.58, 0.31],
            [32.59, 0.32],
            [32.59, 0.31],
            [32.58, 0.32],
            [32.58, 0.31],
          ],
        ],
      }),
    ).toThrow(/self-intersect/i);
  });

  it('flags a measured area that differs from the declaration by more than 25 percent', () => {
    expect(isAreaDiscrepancyFlagged(6, 4)).toBe(true);
    expect(isAreaDiscrepancyFlagged(4.8, 4)).toBe(false);
  });
});
