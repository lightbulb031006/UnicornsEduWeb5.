/**
 * Đọc cột / index bị vi phạm unique từ lỗi Prisma `P2002`.
 *
 * Prisma 7 + `@prisma/adapter-pg` không còn `meta.target`; tên cột nằm ở
 * `meta.driverAdapterError.cause.constraint.fields` (hoặc `.index` khi adapter
 * chỉ biết tên index). Đọc cả hai shape để code bắt lỗi trùng không âm thầm
 * rơi về 500 khi đổi engine.
 */
export function getUniqueConstraintFields(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) return [];
  if ((error as { code?: unknown }).code !== 'P2002') return [];

  const meta = (error as { meta?: Record<string, unknown> }).meta;
  if (!meta) return [];

  const target = meta.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];

  const constraint = (
    meta.driverAdapterError as
      | { cause?: { constraint?: { fields?: unknown; index?: unknown } } }
      | undefined
  )?.cause?.constraint;
  if (Array.isArray(constraint?.fields)) return constraint.fields.map(String);
  if (typeof constraint?.index === 'string') return [constraint.index];

  return [];
}

/**
 * `true` nếu lỗi là `P2002` trên cột `column`. Mặc định khớp cả tên index chứa
 * tên cột (`staff_info_cccd_number_key`); `exact` chỉ khớp đúng tên cột — dùng
 * cho cột ngắn như `id` để không nhầm sang `user_id`.
 */
export function isUniqueConstraintOn(
  error: unknown,
  column: string,
  options: { exact?: boolean } = {},
): boolean {
  return getUniqueConstraintFields(error).some((field) =>
    options.exact ? field === column : field.includes(column),
  );
}
