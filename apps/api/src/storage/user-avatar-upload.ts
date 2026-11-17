import {
  bakeDiagonalWatermark,
  buildAvatarWatermarkedPath,
} from 'src/storage/image-watermark';
import {
  AVATAR_PUBLIC_BUCKET,
  AVATAR_STORAGE_BUCKET,
} from 'src/storage/media-buckets';
import {
  removeStorageObjects,
  type UploadableFile,
  uploadStorageObject,
  validateImageFile,
} from 'src/storage/supabase-storage';

const AVATAR_STORAGE_PATH_SEGMENT = 'avatar';

export type UserAvatarPaths = {
  avatarPath: string;
  avatarWatermarkedPath: string;
};

/**
 * Tải ảnh đại diện của một user lên storage: bản gốc (bucket private) + bản
 * watermark (bucket public). Lỗi ở bản watermark thì gỡ bản gốc vừa tải.
 * Chỉ lo storage — người gọi tự kiểm quyền, ghi `users.avatar_path*` và audit.
 * Dùng cho các trưởng đổi ảnh nhân sự dưới cấp (Trưởng ban Đào tạo, Trưởng
 * phòng Sale & CSKH).
 */
export async function uploadUserAvatarFiles(
  userId: string,
  file: UploadableFile,
): Promise<UserAvatarPaths> {
  validateImageFile(file, 'Ảnh đại diện');

  const avatarPath = `users/${userId}/${AVATAR_STORAGE_PATH_SEGMENT}`;
  const avatarWatermarkedPath = buildAvatarWatermarkedPath(userId);
  const watermarked = await bakeDiagonalWatermark(file.buffer);

  await uploadStorageObject({
    bucket: AVATAR_STORAGE_BUCKET,
    path: avatarPath,
    body: file.buffer,
    contentType: file.mimetype,
    upsert: true,
  });
  try {
    await uploadStorageObject({
      bucket: AVATAR_PUBLIC_BUCKET,
      path: avatarWatermarkedPath,
      body: watermarked.buffer,
      contentType: watermarked.contentType,
      upsert: true,
    });
  } catch (error) {
    await removeStorageObjects({
      bucket: AVATAR_STORAGE_BUCKET,
      paths: [avatarPath],
    }).catch(() => undefined);
    throw error;
  }

  return { avatarPath, avatarWatermarkedPath };
}
