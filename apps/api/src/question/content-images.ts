/**
 * Ảnh trong nội dung câu hỏi / Bộ câu hỏi nằm ở bucket private: HTML lưu
 * `<img data-question-image="{courseId}/{uuid}.{ext}">` (không lưu URL), API ký
 * URL ngắn hạn và gắn vào `src` mỗi lần trả nội dung.
 */
export const CONTENT_IMAGE_ATTR = 'data-question-image';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATH_RE = new RegExp(`^${UUID}/${UUID}\\.(?:jpg|png|webp)$`);
const IMG_TAG_RE = /<img\b[^>]*>/gi;
const PATH_ATTR_RE = new RegExp(`\\s${CONTENT_IMAGE_ATTR}="([^"]*)"`, 'i');
const SRC_ATTR_RE = /\ssrc="[^"]*"/i;

export function isContentImagePath(path: string): boolean {
  return PATH_RE.test(path);
}

function pathOfTag(tag: string): string | null {
  const path = PATH_ATTR_RE.exec(tag)?.[1];
  return path && isContentImagePath(path) ? path : null;
}

/** Bỏ `src` của ảnh trong bucket trước khi lưu — DB không giữ URL có token. */
export function stripContentImageSrc(html: string): string {
  if (!html.includes(CONTENT_IMAGE_ATTR)) return html;
  return html.replace(IMG_TAG_RE, (tag) =>
    pathOfTag(tag) ? tag.replace(SRC_ATTR_RE, '') : tag,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/** Đi qua chuỗi trong mảng / object thường (bỏ qua Date, Buffer…). */
function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]),
    );
  }
  return value;
}

/** Gọi `fn` cho từng chuỗi lồng nhau, không dựng lại cây (chạy trên mọi response). */
function eachString(value: unknown, fn: (s: string) => void): void {
  if (typeof value === 'string') fn(value);
  else if (Array.isArray(value)) value.forEach((v) => eachString(v, fn));
  else if (isPlainObject(value)) {
    for (const v of Object.values(value)) eachString(v, fn);
  }
}

/** Mọi path ảnh hợp lệ trong giá trị (lồng nhau), không trùng. */
export function collectContentImagePaths(value: unknown): string[] {
  const paths = new Set<string>();
  eachString(value, (s) => {
    if (!s.includes(CONTENT_IMAGE_ATTR)) return;
    for (const tag of s.match(IMG_TAG_RE) ?? []) {
      const path = pathOfTag(tag);
      if (path) paths.add(path);
    }
  });
  return [...paths];
}

/** Bỏ `src` của ảnh trong bucket ở mọi chuỗi lồng nhau (body request ghi). */
export function stripContentImages<T>(value: T): T {
  return mapStrings(value, stripContentImageSrc) as T;
}

/** Bản sao `value` với `src` = signed URL; path chưa ký được → ảnh không `src`. */
export function signContentImages<T>(
  value: T,
  urls: ReadonlyMap<string, string>,
): T {
  return mapStrings(value, (s) => {
    if (!s.includes(CONTENT_IMAGE_ATTR)) return s;
    return s.replace(IMG_TAG_RE, (tag) => {
      const path = pathOfTag(tag);
      const url = path ? urls.get(path) : undefined;
      if (!path) return tag;
      const bare = tag.replace(SRC_ATTR_RE, '');
      return url ? bare.replace(/^<img\b/i, `<img src="${url}"`) : bare;
    });
  }) as T;
}
