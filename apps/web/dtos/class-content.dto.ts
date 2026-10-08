export interface ClassContentItemDto {
  id: string;
  lessonId: string;
  kind: "lesson";
  lessonKind: "theory" | "practice";
  sortOrder: number;
  title: string;
  kindLabel: string;
  source: "course" | "class";
  moduleId?: string;
  moduleTitle?: string;
  openAt: string | null;
  durationMinutes: number | null;
  isOpen: boolean;
  hiddenAt: string | null;
  hiddenByStaffId: string | null;
}

/** Nội dung lớp gom theo chuyên đề (`GET /class/:id/content/groups`). */
export interface ClassContentModuleGroupDto {
  /** `null` = nhóm item không thuộc chuyên đề nào (xếp cuối). */
  moduleId: string | null;
  title: string;
  /** `true` với mọi chuyên đề lớp đang có (đã gỡ thì không trả nhóm); `false` chỉ ở nhóm `null`. */
  added: boolean;
  /** Theo thứ tự tiết trong chuyên đề. */
  theoryItems: ClassContentItemDto[];
  practiceItems: ClassContentItemDto[];
}

/** Giao một tiết thực hành có sẵn của khoá; tiết lý thuyết vào lớp theo chuyên đề. */
export interface ClassContentCreatePayload {
  lessonId: string;
  /** ISO 8601. Omit for practice to default openAt to server time when the item is added. */
  openAt?: string;
  /** Required for practice. Integer 1–720. */
  durationMinutes?: number;
}

export interface ClassContentScheduleUpdatePayload {
  openAt: string;
  /** Integer 1–720. */
  durationMinutes: number;
}

/** Tiết lý thuyết cần mở dialog Tiến độ (roster đã xem / hoàn thành). */
export interface TheoryProgressTarget {
  contentItemId: string;
  title: string;
}
