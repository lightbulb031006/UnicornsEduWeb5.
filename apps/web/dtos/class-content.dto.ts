export interface ClassContentItemDto {
  id: string;
  lessonId: string;
  kind: "lesson";
  lessonKind: "theory" | "practice";
  sortOrder: number;
  title: string;
  kindLabel: string;
  source: "course" | "class";
  moduleTitle?: string;
  openAt: string | null;
  durationMinutes: number | null;
  isOpen: boolean;
  hiddenAt: string | null;
  hiddenByStaffId: string | null;
}

export interface ClassContentCreatePayload {
  lessonId?: string;
  title?: string;
  kind?: "theory" | "practice";
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
