-- Giới hạn nghe (hồ sơ JP): cấu hình trên từng audio, đếm lần phát theo lượt làm.
ALTER TABLE "audio_assets" ADD COLUMN "max_plays" INTEGER,
ADD COLUMN "allow_seek" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "attempt_audio_plays" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "audio_id" TEXT NOT NULL,
    "play_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attempt_audio_plays_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attempt_audio_plays_attempt_id_audio_id_key" ON "attempt_audio_plays"("attempt_id", "audio_id");

ALTER TABLE "attempt_audio_plays" ADD CONSTRAINT "attempt_audio_plays_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attempt_audio_plays" ADD CONSTRAINT "attempt_audio_plays_audio_id_fkey" FOREIGN KEY ("audio_id") REFERENCES "audio_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
