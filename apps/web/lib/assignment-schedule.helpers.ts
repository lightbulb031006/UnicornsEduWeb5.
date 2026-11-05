import { currentTimePrefillValue } from "@/components/ui/time-input.helpers";
import type { AssignmentCloseAtDraft } from "@/dtos/class-content.dto";

/** Matches BE `PRACTICE_DURATION_*` on practice lesson duration. */
export const ASSIGNMENT_DURATION_MIN_MINUTES = 1;
export const ASSIGNMENT_DURATION_MAX_MINUTES = 720;

export const ASSIGNMENT_DURATION_OPTIONS = [
  { value: "15", label: "15 phút" },
  { value: "30", label: "30 phút" },
  { value: "45", label: "45 phút" },
  { value: "60", label: "60 phút" },
  { value: "90", label: "90 phút" },
  { value: "120", label: "120 phút" },
  { value: "150", label: "150 phút" },
  { value: "180", label: "180 phút" },
];

export function todayDateValue(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function defaultAssignmentSchedule() {
  return {
    openDate: todayDateValue(),
    openTime: currentTimePrefillValue(),
  };
}

export function toOpenAtIso(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, 0).toISOString();
}

export function fromOpenAtIso(iso: string): { date: string; time: string } {
  const parsed = new Date(iso);
  const fallback = defaultAssignmentSchedule();
  if (Number.isNaN(parsed.getTime())) {
    return { date: fallback.openDate, time: fallback.openTime };
  }
  const date = todayDateValue(parsed);
  const hh = String(parsed.getHours()).padStart(2, "0");
  const mm = String(parsed.getMinutes()).padStart(2, "0");
  return { date, time: `${hh}:${mm}:00` };
}

export function parseAssignmentDurationMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (
    !Number.isInteger(n) ||
    n < ASSIGNMENT_DURATION_MIN_MINUTES ||
    n > ASSIGNMENT_DURATION_MAX_MINUTES
  ) {
    return null;
  }
  return n;
}

export function isOpenAtPairComplete(date: string, time: string): boolean {
  return Boolean(date.trim() && time.trim());
}

export function isOpenAtPairPartial(date: string, time: string): boolean {
  const hasDate = Boolean(date.trim());
  const hasTime = Boolean(time.trim());
  return hasDate !== hasTime;
}

/** Draft hạn làm bài từ `closeAt` đã lưu (dialog sửa lần giao). */
export function closeAtDraftFromIso(
  iso: string | null,
): AssignmentCloseAtDraft {
  if (!iso) return { mode: "none", date: "", time: "" };
  const { date, time } = fromOpenAtIso(iso);
  return { mode: "custom", date, time };
}

/**
 * Giá trị `closeAt` gửi API: `undefined` = để server lấy hạn lớp,
 * `null` = không có hạn, ISO = hạn tự chọn. Tự chọn mà thiếu ngày/giờ → `false` (chưa hợp lệ).
 */
export function closeAtPayload(
  draft: AssignmentCloseAtDraft,
): string | null | undefined | false {
  if (draft.mode === "class") return undefined;
  if (draft.mode === "none") return null;
  if (!isOpenAtPairComplete(draft.date, draft.time)) return false;
  return toOpenAtIso(draft.date, draft.time);
}
