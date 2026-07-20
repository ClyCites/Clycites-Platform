ALTER TABLE "PilotMetricObservation"
ADD COLUMN "reviewNotes" VARCHAR(2000);

CREATE INDEX "PilotSupportCase_escalatedIncidentId_idx"
ON "PilotSupportCase"("escalatedIncidentId");
