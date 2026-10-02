import { currentTimePrefillValue } from "@/components/ui/time-input.helpers";

/** Matches BE `PRACTICE_DURATION_*` on class content lần giao. */
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
    durationMinutes: "60",
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
