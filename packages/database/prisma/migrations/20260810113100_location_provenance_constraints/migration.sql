ALTER TABLE "CollectionPoint"
ADD CONSTRAINT "CollectionPoint_active_coordinates_required"
CHECK ("status" <> 'ACTIVE' OR "deletedAt" IS NOT NULL OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL));

ALTER TABLE "Farm"
ADD CONSTRAINT "Farm_active_location_required"
CHECK (
  "status" <> 'ACTIVE'
  OR "deletedAt" IS NOT NULL
  OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL AND "locationMethod" IS NOT NULL)
),
ADD CONSTRAINT "Farm_location_accuracy_nonnegative"
CHECK ("locationAccuracyMeters" IS NULL OR "locationAccuracyMeters" >= 0);

ALTER TABLE "CollectionSession"
ADD CONSTRAINT "CollectionSession_open_location_shape"
CHECK (
  ("openedLatitude" IS NULL AND "openedLongitude" IS NULL AND "openedAccuracyMeters" IS NULL AND "openedDistanceMeters" IS NULL AND NOT "openedLocationFlagged")
  OR ("openedLatitude" IS NOT NULL AND "openedLongitude" IS NOT NULL AND "openedAccuracyMeters" IS NOT NULL AND "openedAccuracyMeters" >= 0 AND ("openedDistanceMeters" IS NULL OR "openedDistanceMeters" >= 0))
),
ADD CONSTRAINT "CollectionSession_close_location_shape"
CHECK (
  ("closedLatitude" IS NULL AND "closedLongitude" IS NULL AND "closedAccuracyMeters" IS NULL AND "closedDistanceMeters" IS NULL AND NOT "closedLocationFlagged")
  OR ("closedLatitude" IS NOT NULL AND "closedLongitude" IS NOT NULL AND "closedAccuracyMeters" IS NOT NULL AND "closedAccuracyMeters" >= 0 AND ("closedDistanceMeters" IS NULL OR "closedDistanceMeters" >= 0))
);

ALTER TABLE "FarmPlot"
ADD CONSTRAINT "FarmPlot_vertex_count_minimum" CHECK ("vertexCount" >= 4),
ADD CONSTRAINT "FarmPlot_computed_hectares_positive" CHECK ("computedHectares" > 0),
ADD CONSTRAINT "FarmPlot_survey_accuracy_nonnegative" CHECK ("surveyAccuracyMeters" IS NULL OR "surveyAccuracyMeters" >= 0);
