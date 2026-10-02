import { BadRequestException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

export type UploadableFile = {
  buffer: Buffer;
  mimetype: string;
  size: number;
};

export const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const ALLOWED_HTTP_URL_PROTOCOLS = new Set(['http:', 'https:']);

type MulterLikeFile = {
  fieldname?: string;
  mimetype?: string;
};

type MulterFileFilterCallback = (
  error: Error | null,
  acceptFile: boolean,
) => void;

export function tryGetSupabaseAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

export function getSupabaseAdminClient() {
  const client = tryGetSupabaseAdminClient();
  if (!client) {
    throw new BadRequestException(
      'Thiếu cấu hình SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  return client;
}

export function validateImageFile(
  file: UploadableFile | undefined,
  fieldLabel: string,
  maxBytes = DEFAULT_MAX_IMAGE_BYTES,
) {
  if (!file) {
    return;
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
    throw new BadRequestException(
      `${fieldLabel} chỉ hỗ trợ JPEG, PNG hoặc WEBP.`,
    );
  }

  if (file.size > maxBytes) {
    throw new BadRequestException(
      `${fieldLabel} vượt quá giới hạn ${Math.floor(maxBytes / (1024 * 1024))}MB.`,
    );
  }
}

export function normalizeHttpHttpsUrl(
  value: string | null | undefined,
  fieldLabel: string,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new BadRequestException(`${fieldLabel} không phải URL hợp lệ.`);
  }

  if (!ALLOWED_HTTP_URL_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new BadRequestException(
      `${fieldLabel} chỉ hỗ trợ URL bắt đầu bằng http:// hoặc https://.`,
    );
  }

  return trimmed;
}

export function buildImageUploadFileFilter(options?: {
  defaultFieldLabel?: string;
  labelsByFieldName?: Record<string, string>;
}) {
  const defaultFieldLabel = options?.defaultFieldLabel ?? 'Tệp ảnh';
  const labelsByFieldName = options?.labelsByFieldName ?? {};

  return (
    _req: unknown,
    file: MulterLikeFile,
    callback: MulterFileFilterCallback,
  ) => {
    const fieldLabel = file.fieldname
      ? (labelsByFieldName[file.fieldname] ?? defaultFieldLabel)
      : defaultFieldLabel;

    if (!file.mimetype || !ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      callback(
        new BadRequestException(
          `${fieldLabel} chỉ hỗ trợ JPEG, PNG hoặc WEBP.`,
        ),
        false,
      );
      return;
    }

    callback(null, true);
  };
}

export async function createSignedStorageUrl(options: {
  bucket: string;
  path?: string | null;
  expiresIn: number;
}) {
  if (!options.path) {
    return null;
  }

  const supabase = tryGetSupabaseAdminClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(options.bucket)
    .createSignedUrl(options.path, options.expiresIn);

  if (error) {
    return null;
  }

  return data.signedUrl ?? null;
}

/** Public object URL for watermarked twins (bucket must be public-read). */
export function createPublicStorageUrl(options: {
  bucket: string;
  path?: string | null;
}): string | null {
  if (!options.path?.trim()) {
    return null;
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  if (!supabaseUrl) {
    return null;
  }

  const encodedPath = options.path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `${supabaseUrl}/storage/v1/object/public/${options.bucket}/${encodedPath}`;
}

export async function uploadStorageObject(options: {
  bucket: string;
  path: string;
  body: Buffer;
  contentType: string;
  upsert?: boolean;
}) {
  const supabase = getSupabaseAdminClient();
  const uploadResult = await supabase.storage
    .from(options.bucket)
    .upload(options.path, options.body, {
      upsert: options.upsert ?? true,
      contentType: options.contentType,
    });

  if (uploadResult.error) {
    throw new BadRequestException(
      uploadResult.error.message || 'Không thể tải tệp lên storage.',
    );
  }
}

export async function removeStorageObjects(options: {
  bucket: string;
  paths: Array<string | null | undefined>;
}) {
  const paths = options.paths.filter((path): path is string =>
    Boolean(path && path.trim()),
  );
  if (paths.length === 0) {
    return;
  }

  const supabase = getSupabaseAdminClient();
  const deleteResult = await supabase.storage
    .from(options.bucket)
    .remove(paths);

  if (deleteResult.error) {
    throw new BadRequestException(
      deleteResult.error.message || 'Không thể xoá tệp trên storage.',
    );
  }
}
