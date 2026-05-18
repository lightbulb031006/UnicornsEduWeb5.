ALTER TABLE "users"
ADD COLUMN "data_processing_consent_accepted_at" TIMESTAMPTZ(6),
ADD COLUMN "data_processing_consent_version" TEXT;
