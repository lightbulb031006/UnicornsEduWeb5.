/**
 * Áp thứ tự kéo-thả (chưa lưu) lên danh sách nhóm chuyên đề từ server.
 *
 * - `orderedIds = null`: giữ thứ tự server (`class_modules.sort_order`).
 * - Chuyên đề server có mà `orderedIds` chưa có (vừa thêm lúc đang kéo) lên đầu,
 *   khớp quy tắc "chuyên đề mới lên đầu"; id đã bị gỡ thì bỏ.
 * - Nhóm không có `moduleId` không kéo được, luôn ở cuối.
 */
export function applyModuleOrder<G extends { moduleId: string | null }>(
  groups: readonly G[],
  orderedIds: readonly string[] | null,
): G[] {
  if (!orderedIds) return [...groups];
  const byId = new Map<string, G>();
  const loose: G[] = [];
  for (const group of groups) {
    if (group.moduleId) byId.set(group.moduleId, group);
    else loose.push(group);
  }
  const known = new Set(orderedIds);
  const fresh = groups.filter((g) => g.moduleId && !known.has(g.moduleId));
  const ordered = orderedIds.flatMap((id) => {
    const group = byId.get(id);
    return group ? [group] : [];
  });
  return [...fresh, ...ordered, ...loose];
}
