import { createPublicStorageUrl } from 'src/storage/supabase-storage';
import { STUDENT_GALLERY_PUBLIC_BUCKET } from 'src/storage/media-buckets';
import type { LandingStudentGalleryItemDto } from 'src/dtos/landing-profile.dto';

type GalleryLandingRow = {
  id: string;
  caption: string | null;
  imageWatermarkedPath: string | null;
  sortOrder: number;
};

/** Map gallery rows to landing DTOs using watermarked public URLs only. */
export function mapLandingStudentGallery(
  rows: GalleryLandingRow[],
): LandingStudentGalleryItemDto[] {
  return rows.map((row) => ({
    id: row.id,
    caption: row.caption,
    imagePath: row.imageWatermarkedPath,
    imageUrl: createPublicStorageUrl({
      bucket: STUDENT_GALLERY_PUBLIC_BUCKET,
      path: row.imageWatermarkedPath,
    }),
    sortOrder: row.sortOrder,
  }));
}
