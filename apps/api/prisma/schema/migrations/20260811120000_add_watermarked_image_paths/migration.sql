-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_watermarked_path" TEXT;

-- AlterTable
ALTER TABLE "staff_achievements" ADD COLUMN IF NOT EXISTS "image_watermarked_path" TEXT;

-- AlterTable
ALTER TABLE "student_achievements" ADD COLUMN IF NOT EXISTS "image_watermarked_path" TEXT;
