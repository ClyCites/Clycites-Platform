ALTER TABLE "NotificationDelivery"
ALTER COLUMN "parameters" DROP NOT NULL;

ALTER TABLE "NotificationDelivery"
DROP CONSTRAINT "NotificationDelivery_provider_restricted";

ALTER TABLE "NotificationDelivery"
ADD CONSTRAINT "NotificationDelivery_provider_restricted"
CHECK ("provider" IN ('console', 'mock', 'email'));

UPDATE "NotificationDelivery"
SET "parameters" = NULL
WHERE "status" IN ('DELIVERED', 'FAILED', 'CANCELLED', 'SUPPRESSED')
	AND "templateCode" IN (
		'INVITATION',
		'PASSWORD_RESET',
		'EMAIL_VERIFICATION',
		'FARMER_ACCOUNT_RESET'
	);
