/** Lớp có hơn ngần này học sinh đang học thì roster mặc định thu gọn. */
export const ROSTER_COLLAPSE_THRESHOLD = 7;

/** Roster trang chi tiết lớp (admin/staff) mặc định thu gọn khi lớp đông. */
export function isRosterCollapsedByDefault(activeStudentCount: number) {
  return activeStudentCount > ROSTER_COLLAPSE_THRESHOLD;
}
