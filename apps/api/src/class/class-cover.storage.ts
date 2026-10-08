import { BadRequestException } from '@nestjs/common';
import { CLASS_COVER_STORAGE_BUCKET } from 'src/storage/media-buckets';
import { createSignedStorageUrl } from 'src/storage/supabase-storage';

const CLASS_COVER_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const CLASS_COVER_FIELD_LABEL = 'Ảnh bìa lớp';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Signed URL ảnh bìa lớp; null khi lớp chưa có ảnh hoặc storage chưa cấu hình. */
export function createClassCoverSignedUrl(path: string | null | undefined) {
  return createSignedStorageUrl({
    bucket: CLASS_COVER_STORAGE_BUCKET,
    path,
    expiresIn: CLASS_COVER_SIGNED_URL_TTL_SECONDS,
  });
}

export function buildClassCoverPath(classId: string, mimetype: string) {
  const extension = EXTENSION_BY_MIME[mimetype];
  if (!extension) {
    throw new BadRequestException(
      `${CLASS_COVER_FIELD_LABEL} phải là JPG, PNG hoặc WEBP.`,
    );
  }
  return `${classId}/cover.${extension}`;
}
