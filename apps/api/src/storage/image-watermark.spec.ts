import { readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { bakeDiagonalWatermark } from './image-watermark';
import { createPublicStorageUrl } from './supabase-storage';

describe('image watermark + public URL', () => {
  it('bakes a jpeg twin larger than empty input metadata', async () => {
    const logo = readFileSync(join(__dirname, 'assets', 'watermark-logo.webp'));
    // Use a photo-sized base so the rotated tile fits (sharp requires tile ≤ base).
    const photo = await sharp(logo)
      .resize(640, 480, { fit: 'cover' })
      .jpeg()
      .toBuffer();
    const result = await bakeDiagonalWatermark(photo);
    expect(result.contentType).toBe('image/jpeg');
    expect(result.buffer.length).toBeGreaterThan(1000);
  });

  it('builds public storage URLs', () => {
    const previous = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    expect(
      createPublicStorageUrl({
        bucket: 'avatars-public',
        path: 'users/u1/avatar.jpg',
      }),
    ).toBe(
      'https://example.supabase.co/storage/v1/object/public/avatars-public/users/u1/avatar.jpg',
    );
    expect(
      createPublicStorageUrl({ bucket: 'avatars-public', path: null }),
    ).toBeNull();
    process.env.SUPABASE_URL = previous;
  });
});
