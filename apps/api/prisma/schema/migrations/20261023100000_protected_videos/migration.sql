-- Video bảo vệ (ADR docs/adr/2026-10-18-protected-video-via-unioj-sync.md).
CREATE TYPE "ProtectedVideoStatus" AS ENUM ('pending', 'queued', 'downloading', 'transcoding', 'uploading', 'ready', 'failed');

CREATE TABLE "protected_videos" (
    "youtube_id" TEXT NOT NULL,
    "video_id" TEXT,
    "status" "ProtectedVideoStatus" NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "last_sync_error" TEXT,
    "queue_position" INTEGER,
    "queue_total" INTEGER,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "protected_videos_pkey" PRIMARY KEY ("youtube_id")
);

CREATE INDEX "protected_videos_status_requested_at_idx" ON "protected_videos"("status", "requested_at");
CREATE INDEX "protected_videos_status_synced_at_idx" ON "protected_videos"("status", "synced_at");

-- Backfill: mọi link YouTube đang có ở tiết lý thuyết và recording buổi học thành dòng `pending`.
-- `requested_at` = lần sửa gần nhất của nơi dùng → cron gửi mới nhất trước.
-- Regex mirror `extractYouTubeId` (src/protected-video/youtube-id.ts).
INSERT INTO "protected_videos" ("youtube_id", "requested_at", "updated_at")
SELECT src."youtube_id", MAX(src."touched_at"), NOW()
FROM (
  SELECT
    COALESCE(
      (regexp_match(u."url", '(youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/v/|youtube\.com/shorts/)([^&?#[:space:]]+)'))[2],
      CASE WHEN btrim(u."url") ~ '^[A-Za-z0-9_-]{11}$' THEN btrim(u."url") END
    ) AS "youtube_id",
    u."touched_at"
  FROM (
    SELECT "video_url" AS "url", "updated_at" AS "touched_at"
    FROM "lessons"
    WHERE "video_url" IS NOT NULL AND btrim("video_url") <> ''
    UNION ALL
    SELECT "recording_url", "updated_at"
    FROM "sessions"
    WHERE "recording_url" IS NOT NULL AND btrim("recording_url") <> ''
  ) u
) src
WHERE src."youtube_id" ~ '^[A-Za-z0-9_-]{11}$'
GROUP BY src."youtube_id";
