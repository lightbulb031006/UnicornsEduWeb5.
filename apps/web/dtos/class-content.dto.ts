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
  /** Hạn làm bài của lần giao; null = không có hạn. */
  closeAt: string | null;
  durationMinutes: number | null;
  /** Đảo câu + đảo phương án mỗi lượt làm. */
  shuffleQuestions: boolean;
  isOpen: boolean;
  hiddenAt: string | null;
  hiddenByStaffId: string | null;
  /** `module_removed` = ẩn kèm khi gỡ khỏi lớp (item đã gỡ không trả về); `manual` = gia sư Ẩn. */
  hiddenReason: "manual" | "module_removed" | null;
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

/** Thêm lẻ một tiết có sẵn của khoá; tiết thực hành thành lần giao (lịch tuỳ chọn). */
export interface ClassContentCreatePayload {
  lessonId: string;
  /** ISO 8601. Omit for practice to default openAt to server time when the item is added. */
  openAt?: string;
  /** ISO 8601. Bỏ qua = lấy hạn xem nội dung của lớp; null = không có hạn. */
  closeAt?: string | null;
  /** Mặc định true. */
  shuffleQuestions?: boolean;
}

export interface ClassContentScheduleUpdatePayload {
  openAt: string;
  /** ISO 8601. Bỏ qua = giữ hạn hiện tại; null = không có hạn. */
  closeAt?: string | null;
  shuffleQuestions?: boolean;
}

/**
 * Cách đặt hạn làm bài trong dialog lần giao:
 * `class` = theo hạn xem nội dung của lớp (chỉ khi giao mới), `custom` = tự chọn ngày giờ,
 * `none` = không có hạn.
 */
export type AssignmentCloseAtMode = "class" | "custom" | "none";

export interface AssignmentCloseAtDraft {
  mode: AssignmentCloseAtMode;
  date: string;
  time: string;
}

/** Tiết lý thuyết cần mở dialog Tiến độ (roster đã xem / hoàn thành). */
/** Tiết đang chờ xác nhận **Gỡ khỏi lớp**. */
export interface ClassContentRemovalTarget {
  id: string;
  title: string;
}

export interface TheoryProgressTarget {
  contentItemId: string;
  title: string;
}
