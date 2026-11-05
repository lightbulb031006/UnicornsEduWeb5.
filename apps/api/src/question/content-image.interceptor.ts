import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { mergeMap, type Observable } from 'rxjs';
import { QUESTION_IMAGE_STORAGE_BUCKET } from '../storage/media-buckets';
import { tryGetSupabaseAdminClient } from '../storage/supabase-storage';
import {
  collectContentImagePaths,
  signContentImages,
  stripContentImages,
} from './content-images';

/** Đủ dài cho một lượt làm bài; tải lại trang sẽ nhận URL mới. */
const IMAGE_URL_TTL_SECONDS = 6 * 60 * 60;
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export async function signImagePaths(
  paths: string[],
): Promise<Map<string, string>> {
  const supabase = tryGetSupabaseAdminClient();
  if (!supabase || paths.length === 0) return new Map();
  const { data, error } = await supabase.storage
    .from(QUESTION_IMAGE_STORAGE_BUCKET)
    .createSignedUrls(paths, IMAGE_URL_TTL_SECONDS);
  if (error || !data) return new Map();
  return new Map(
    data.flatMap((d) =>
      d.path && d.signedUrl && !d.error ? [[d.path, d.signedUrl] as const] : [],
    ),
  );
}

/**
 * Ảnh nội dung câu hỏi ở bucket private, cho mọi endpoint (không sót đường đọc
 * nào: ngân hàng, tiết, bài làm, ôn nhẹ, xem lại…):
 * - Request ghi: bỏ `src` (URL có token) của ảnh trong bucket trước khi lưu.
 * - Response: ký URL cho mọi path ảnh, gắn vào `src`. Ai nhận được nội dung
 *   (đã qua kiểm quyền của endpoint) thì nhận URL ảnh trong nội dung đó.
 */
@Injectable()
export class ContentImageInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<Request>();
    if (
      WRITE_METHODS.has(request.method) &&
      collectContentImagePaths(request.body).length > 0
    ) {
      request.body = stripContentImages<unknown>(request.body);
    }
    return next.handle().pipe(
      mergeMap(async (data: unknown) => {
        const paths = collectContentImagePaths(data);
        if (paths.length === 0) return data;
        return signContentImages(data, await signImagePaths(paths));
      }),
    );
  }
}
