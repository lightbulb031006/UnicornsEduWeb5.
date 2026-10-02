/**
 * Product caps for rich-text and URL fields.
 * Keep in sync with `apps/api/src/dtos/content-limits.ts`.
 */
export const CONTENT_LIMITS = {
  essayAnswer: 20_000,
  feedback: 4_000,
  theoryContent: 100_000,
  /** @deprecated Use theoryContent */
  lectureContent: 100_000,
  sessionRichText: 20_000,
  url: 2_048,
  attendanceNotes: 500,
} as const;

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function overLimitMessage(label: string, max: number): string {
  return `${label} tối đa ${max.toLocaleString("vi-VN")} ký tự.`;
}

export function firstOverLimit(
  fields: Array<{ label: string; value: string; max: number }>,
): string | null {
  for (const field of fields) {
    if (field.value.length > field.max) {
      return overLimitMessage(field.label, field.max);
    }
  }
  return null;
}
