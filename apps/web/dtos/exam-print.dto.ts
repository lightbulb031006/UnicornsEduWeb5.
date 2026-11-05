/** Ba đường xuất Đề in (CONTEXT.md — Đề in). */
export type ExamPrintTarget =
  /** Trang tiết cấp khoá — admin/trợ lí, đội giáo án của khoá. */
  | { kind: "lesson"; lessonId: string }
  /** Lần giao trên lớp, phía dạy — admin/trợ lí, gia sư phụ trách lớp. */
  | { kind: "staff-assignment"; classId: string; assignmentId: string }
  /** Lần giao, học sinh — chỉ bản Đề. */
  | { kind: "student-assignment"; classId: string; assignmentId: string };

export interface ExamPrintFile {
  blob: Blob;
  filename: string;
}
