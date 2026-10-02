/**
 * Product caps for rich-text and URL request fields.
 * Keep in sync with `apps/web/dtos/content-limits.ts`.
 */
export const CONTENT_LIMITS = {
  /** Student essay answer (Attempt + lecture quiz). */
  essayAnswer: 20_000,
  /** Teacher grading comment on one essay answer. Matches notification body. */
  feedback: 4_000,
  /** Theory lesson HTML (TipTap + LaTeX). */
  theoryContent: 100_000,
  /** Session lessonContent / homework / tutorial HTML. */
  sessionRichText: 20_000,
  /** http(s) URL (lecture video, session recording, resource link). */
  url: 2_048,
  /** Per-student attendance note. Matches existing FE cap. */
  attendanceNotes: 500,
} as const;

export const HTTP_URL_OPTIONS = {
  require_protocol: true,
  require_tld: true,
} as const;
