-- New enum value must commit before any statement uses it.
ALTER TYPE "ClassPricingMode" ADD VALUE IF NOT EXISTS 'one_time';
