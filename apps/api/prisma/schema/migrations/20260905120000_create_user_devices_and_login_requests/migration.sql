-- Tables were in Prisma schema (auth.prisma) without a CREATE TABLE migration.
-- 20260906000000_add_activate_secret_hash ALTERs login_requests; production
-- never had the table. Create both here (timestamp before that ALTER).
-- login_requests.activate_secret_hash is added by the following migration.

CREATE TABLE IF NOT EXISTS "user_devices" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_info" JSONB,
    "ip_address" TEXT,
    "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_devices_token_hash_key" ON "user_devices"("token_hash");
CREATE INDEX IF NOT EXISTS "user_devices_user_id_idx" ON "user_devices"("user_id");
CREATE INDEX IF NOT EXISTS "user_devices_token_hash_idx" ON "user_devices"("token_hash");
CREATE INDEX IF NOT EXISTS "user_devices_last_active_at_idx" ON "user_devices"("last_active_at");

DO $$ BEGIN
    ALTER TABLE "user_devices"
        ADD CONSTRAINT "user_devices_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "login_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "device_info" JSONB,
    "ip_address" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "login_requests_token_hash_key" ON "login_requests"("token_hash");
CREATE INDEX IF NOT EXISTS "login_requests_user_id_idx" ON "login_requests"("user_id");
CREATE INDEX IF NOT EXISTS "login_requests_token_hash_idx" ON "login_requests"("token_hash");
CREATE INDEX IF NOT EXISTS "login_requests_expires_at_idx" ON "login_requests"("expires_at");

DO $$ BEGIN
    ALTER TABLE "login_requests"
        ADD CONSTRAINT "login_requests_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
