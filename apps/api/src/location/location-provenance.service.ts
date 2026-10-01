import { BadRequestException } from '@nestjs/common';
import area from '@turf/area';
import centroid from '@turf/centroid';
import { polygon } from '@turf/helpers';
import kinks from '@turf/kinks';

const EARTH_RADIUS_METERS = 6_371_008.8;
const UGANDA_BOUNDS = {
  minimumLongitude: 29.5,
  maximumLongitude: 35.1,
  minimumLatitude: -1.5,
  maximumLatitude: 4.3,
};

type AreaUnit = 'ACRE' | 'HECTARE';
type Position = [number, number];

export interface ValidatedFarmPlotBoundary {
  boundary: { type: 'Polygon'; coordinates: Position[][] };
  vertexCount: number;
  centroidLatitude: number;
  centroidLongitude: number;
  computedHectares: number;
}

export const calculateDistanceMeters = (
  firstLatitude: number,
  firstLongitude: number,
  secondLatitude: number,
  secondLongitude: number,
): number => {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(secondLatitude - firstLatitude);
  const longitudeDelta = radians(secondLongitude - firstLongitude);
  const firstLatitudeRadians = radians(firstLatitude);
  const secondLatitudeRadians = radians(secondLatitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitudeRadians) *
      Math.cos(secondLatitudeRadians) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(
    2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
};

export const assessLocation = (
  reference: { latitude: number | null; longitude: number | null },
  reading: { latitude: number; longitude: number; accuracyMeters: number },
  thresholdMeters: number,
): { distanceMeters: number | null; flagged: boolean } => {
  if (reference.latitude === null || reference.longitude === null) {
    return { distanceMeters: null, flagged: false };
  }
  const distanceMeters = calculateDistanceMeters(
    reference.latitude,
    reference.longitude,
    reading.latitude,
    reading.longitude,
  );
  return {
    distanceMeters,
    // A reading less precise than the threshold cannot support an adverse judgement.
    flagged: reading.accuracyMeters <= thresholdMeters && distanceMeters > thresholdMeters,
  };
};

export const declaredHectares = (totalArea: string | number, unit: AreaUnit): number =>
  Number(totalArea) * (unit === 'ACRE' ? 0.404686 : 1);

export const isAreaDiscrepancyFlagged = (
  computedHectares: number,
  declaredAreaHectares: number,
): boolean =>
  declaredAreaHectares > 0 &&
  Math.abs(computedHectares - declaredAreaHectares) / declaredAreaHectares > 0.25;

export const validateFarmPlotBoundary = (input: unknown): ValidatedFarmPlotBoundary => {
  if (!isObject(input) || input.type !== 'Polygon' || !Array.isArray(input.coordinates)) {
    throw new BadRequestException('Boundary must be a GeoJSON Polygon');
  }
  if (input.coordinates.length === 0) {
    throw new BadRequestException('Boundary must contain a linear ring');
  }

  const coordinates = input.coordinates.map((ring) => validateRing(ring));
  const feature = polygon(coordinates);
  if (kinks(feature).features.length > 0) {
    throw new BadRequestException('Boundary must not self-intersect');
  }
  const [centroidLongitude, centroidLatitude] = centroid(feature).geometry.coordinates;
  if (centroidLatitude === undefined || centroidLongitude === undefined) {
    throw new BadRequestException('Boundary centroid could not be computed');
  }

  return {
    boundary: { type: 'Polygon', coordinates },
    vertexCount: coordinates.reduce((total, ring) => total + ring.length, 0),
    centroidLatitude,
    centroidLongitude,
    computedHectares: area(feature) / 10_000,
  };
};

const validateRing = (input: unknown): Position[] => {
  if (!Array.isArray(input) || input.length < 4) {
    throw new BadRequestException('Boundary rings require at least four positions');
  }
  const positions = input.map((position) => validatePosition(position));
  const first = positions[0];
  const last = positions.at(-1);
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    throw new BadRequestException('Boundary rings must be closed');
  }
  return positions;
};

const validatePosition = (input: unknown): Position => {
  if (
    !Array.isArray(input) ||
    input.length !== 2 ||
    typeof input[0] !== 'number' ||
    typeof input[1] !== 'number' ||
    !Number.isFinite(input[0]) ||
    !Number.isFinite(input[1])
  ) {
    throw new BadRequestException('Boundary positions must be longitude-latitude pairs');
  }
  const longitude = Number(input[0]);
  const latitude = Number(input[1]);
  if (
    longitude < UGANDA_BOUNDS.minimumLongitude ||
    longitude > UGANDA_BOUNDS.maximumLongitude ||
    latitude < UGANDA_BOUNDS.minimumLatitude ||
    latitude > UGANDA_BOUNDS.maximumLatitude
  ) {
    throw new BadRequestException('Boundary positions must be within Uganda');
  }
  return [longitude, latitude];
};

const isObject = (input: unknown): input is Record<string, unknown> =>
  typeof input === 'object' && input !== null;
