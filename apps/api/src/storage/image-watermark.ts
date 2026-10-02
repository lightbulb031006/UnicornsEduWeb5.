import { BadRequestException } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

const WATERMARK_TILE_MAX_EDGE = 180;
/** Overlay fade for tiled brand mark (lower = more transparent). */
const WATERMARK_ALPHA = 0.05;

let cachedLogoTile: Buffer | null = null;

function resolveWatermarkLogoPath(): string {
  const candidates = [
    join(__dirname, '..', 'mail', 'assets', 'logo_math_sm.png'),
    join(process.cwd(), 'src', 'mail', 'assets', 'logo_math_sm.png'),
    join(process.cwd(), 'dist', 'mail', 'assets', 'logo_math_sm.png'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new BadRequestException(
    'Thiếu logo Toán để tạo watermark (mail/assets/logo_math_sm.png).',
  );
}

async function getWatermarkTile(): Promise<Buffer> {
  if (cachedLogoTile) {
    return cachedLogoTile;
  }

  const logo = readFileSync(resolveWatermarkLogoPath());
  // Source mark is small (≈80px); upscale to tile size so diagonal tiles stay readable.
  const resized = await sharp(logo)
    .resize({
      width: WATERMARK_TILE_MAX_EDGE,
      height: WATERMARK_TILE_MAX_EDGE,
      fit: 'inside',
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Preserve the asset's own alpha (transparent mark). Only fade for overlay —
  // do not luma-key: black outlines on the graffiti mark must stay opaque.
  const pixels = Buffer.from(resized.data);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i + 3] = Math.round(pixels[i + 3] * WATERMARK_ALPHA);
  }

  const faded = await sharp(pixels, {
    raw: {
      width: resized.info.width,
      height: resized.info.height,
      channels: 4,
    },
  })
    .png()
    .toBuffer();

  cachedLogoTile = await sharp(faded)
    .rotate(-30, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return cachedLogoTile;
}

/**
 * Bake a diagonal tiled brand watermark into the image.
 * Returns JPEG buffer for stable public twin paths (always `.jpg`).
 */
export async function bakeDiagonalWatermark(
  input: Buffer,
): Promise<{ buffer: Buffer; contentType: 'image/jpeg' }> {
  try {
    const base = sharp(input).rotate();
    const meta = await base.metadata();
    const inputMinEdge = Math.min(meta.width ?? 0, meta.height ?? 0);

    let tile = await getWatermarkTile();
    const tileMeta = await sharp(tile).metadata();
    const tileMaxEdge = Math.max(tileMeta.width ?? 0, tileMeta.height ?? 0);
    // sharp requires each composite input to be <= base dimensions.
    if (inputMinEdge > 0 && tileMaxEdge > inputMinEdge) {
      tile = await sharp(tile)
        .resize({
          width: inputMinEdge,
          height: inputMinEdge,
          fit: 'inside',
        })
        .png()
        .toBuffer();
    }

    const buffer = await base
      .composite([
        {
          input: tile,
          tile: true,
          blend: 'over',
        },
      ])
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    return { buffer, contentType: 'image/jpeg' };
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException(
      'Không thể tạo ảnh watermark. Vui lòng thử lại với ảnh khác.',
    );
  }
}

export function buildAvatarWatermarkedPath(userId: string): string {
  return `users/${userId}/avatar.jpg`;
}

export function buildAchievementWatermarkedPath(
  ownerKind: 'staff' | 'student',
  ownerId: string,
  achievementId: string,
): string {
  return `${ownerKind}/${ownerId}/${achievementId}.jpg`;
}

export function buildStudentGalleryWatermarkedPath(
  studentId: string,
  itemId: string,
): string {
  return `student/${studentId}/${itemId}.jpg`;
}
