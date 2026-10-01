ALTER TABLE "User"
ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "User"
ADD CONSTRAINT "User_active_requires_password"
CHECK ("status" <> 'ACTIVE' OR "passwordHash" IS NOT NULL);
