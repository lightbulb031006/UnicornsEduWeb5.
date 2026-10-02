-- Class-level pricing mode (opt-in 30-minute block rates).
-- Default per_session so every existing class keeps pre-block charge/allowance
-- behavior. per_session columns are permanent (#138 contract cancelled).

CREATE TYPE "ClassPricingMode" AS ENUM ('per_session', 'per_block');

ALTER TABLE "classes"
  ADD COLUMN "pricing_mode" "ClassPricingMode" NOT NULL DEFAULT 'per_session';
