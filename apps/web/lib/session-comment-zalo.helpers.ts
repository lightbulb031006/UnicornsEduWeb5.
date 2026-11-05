import type {
  AttendanceReviewFields,
  HomeworkQuality,
  SessionAttendanceStatus,
  SessionProgressStatus,
  SessionReviewFields,
} from "@/dtos/session.dto";

export const SESSION_LESSON_CONTENT_PLACEHOLDER =
  "Ghi nội dung đã dạy: bài LEVEL/CONTEST, kiến thức chính, phần HS cần nắm vững…";

export const SESSION_HOMEWORK_PLACEHOLDER =
  "Ghi bài tập HS cần hoàn thành trước buổi sau (số bài, yêu cầu nộp nếu có)";

export const SESSION_TUTORIAL_PLACEHOLDER =
  "Ghi hướng dẫn/tài liệu tham khảo cho buổi học: link, bước làm bài, lưu ý kỹ thuật…";

const EXCUSED_ABSENCE_LABEL = "Vắng có phép";
const EMPTY_COMMENT_LABEL = "—";
const STUDENT_COMMENTS_SECTION_TITLE = "3️⃣ Nhận xét từng học sinh";
const STUDENT_COMMENT_LINE_INDENT = "  ";

export function attendanceStatusTemplateLabel(
  status: SessionAttendanceStatus,
): string {
  if (status === "present") return "học";
  if (status === "excused") return "nghỉ phép";
  if (status === "trial") return "học thử";
  return "vắng";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\u00a0/g, " ");
}

/** Chuyển <a href="URL">label</a> thành "label (URL)" (hoặc chỉ URL nếu label trùng URL) trước khi các bước sau strip mất href. */
function replaceAnchorsWithPlainText(value: string): string {
  return value.replace(
    /<a\b[^>]*\bhref=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, hrefRaw: string, innerHtml: string) => {
      const url = decodeHtmlEntities(hrefRaw).trim();
      const label = stripInlineHtml(innerHtml);

      if (!url) return label;
      if (!label || label === url) return url;
      return `${label} (${url})`;
    },
  );
}

function stripInlineHtml(value: string): string {
  return decodeHtmlEntities(
    replaceAnchorsWithPlainText(value)
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " "),
  ).trim();
}

function normalizePlainTextLines(value: string): string {
  return value
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Chuyển rich text sang plain text, giữ xuống dòng và gạch đầu dòng từ danh sách TipTap. */
export function richTextToPlainTextPreservingStructure(
  value: string | null | undefined,
): string {
  if (!value) return "";

  let html = replaceAnchorsWithPlainText(String(value));

  html = html.replace(
    /<ol[^>]*>([\s\S]*?)<\/ol>/gi,
    (_, listContent: string) => {
      let index = 0;
      return listContent.replace(
        /<li[^>]*>([\s\S]*?)<\/li>/gi,
        (_, itemContent: string) => {
          index += 1;
          const text = stripInlineHtml(itemContent);
          return text ? `${index}. ${text}\n` : "";
        },
      );
    },
  );

  html = html.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, listContent: string) =>
    listContent.replace(
      /<li[^>]*>([\s\S]*?)<\/li>/gi,
      (_, itemContent: string) => {
        const text = stripInlineHtml(itemContent);
        return text ? `- ${text}\n` : "";
      },
    ),
  );

  html = html.replace(
    /<li[^>]*>([\s\S]*?)<\/li>/gi,
    (_, itemContent: string) => {
      const text = stripInlineHtml(itemContent);
      return text ? `- ${text}\n` : "";
    },
  );

  return normalizePlainTextLines(
    decodeHtmlEntities(
      html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/\r\n/g, "\n"),
    ),
  );
}

function stripRichTextToPlainText(value: string | null | undefined): string {
  return richTextToPlainTextPreservingStructure(value);
}

function splitPlainTextLines(value: string): string[] {
  if (!value.trim()) return [];
  return value.split("\n").map((line) => line.trimEnd());
}

export function resolveStudentCommentLines(
  status: SessionAttendanceStatus,
  notesHtml: string | null | undefined,
): string[] {
  const noteLines = splitPlainTextLines(
    richTextToPlainTextPreservingStructure(notesHtml),
  );

  if (status === "excused") {
    return noteLines.length > 0
      ? [EXCUSED_ABSENCE_LABEL, ...noteLines]
      : [EXCUSED_ABSENCE_LABEL];
  }

  if (status === "absent") {
    return noteLines;
  }

  return noteLines.length > 0 ? noteLines : [EMPTY_COMMENT_LABEL];
}

function normalizeBulletContent(line: string): string {
  return line
    .trim()
    .replace(/^[-•*]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .trim();
}

function formatIndentedBulletCommentLine(line: string): string {
  const content = normalizeBulletContent(line);
  if (!content) return "";
  return `${STUDENT_COMMENT_LINE_INDENT}- ${content}`;
}

export function formatStudentCommentBlock(
  fullName: string,
  status: SessionAttendanceStatus,
  commentLines: string[],
): string {
  const nameLine = `${fullName.trim() || "—"} (${attendanceStatusTemplateLabel(status)})`;
  const commentBullets = commentLines
    .map(formatIndentedBulletCommentLine)
    .filter(Boolean);

  if (commentBullets.length === 0) {
    return nameLine;
  }

  return [nameLine, ...commentBullets].join("\n");
}

function formatVnDateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
  if (!match) return date;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function formatTimeLabel(time: string | null | undefined): string {
  if (!time) return "";

  const raw = time.trim();
  if (!raw) return "";

  const directMatch = raw.match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (directMatch) {
    return `${directMatch[1]}:${directMatch[2]}`;
  }

  const isoMatch = raw.match(/T(\d{2}):(\d{2})(?::\d{2})?/);
  if (isoMatch) {
    return `${isoMatch[1]}:${isoMatch[2]}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatSessionTimeRangeLabel(
  startTime?: string | null,
  endTime?: string | null,
): string {
  const startLabel = formatTimeLabel(startTime);
  const endLabel = formatTimeLabel(endTime);

  if (startLabel && endLabel) {
    return `${startLabel} - ${endLabel}`;
  }

  return startLabel || endLabel || "";
}

export type SessionCommentZaloStudent = AttendanceReviewFields & {
  fullName: string;
  status: SessionAttendanceStatus;
  notes?: string | null;
};

export type BuildSessionCommentZaloTextInput = {
  className: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  makeupOriginalDate?: string | null;
  lessonContent?: string | null;
  homework?: string | null;
  tutorial?: string | null;
  /** Số thứ tự buổi trong lớp; null khi chưa biết. */
  ordinal?: number | null;
  /** Có `progressStatus` ⇒ dựng theo format Nhận xét buổi học có cấu trúc. */
  review?: SessionReviewFields | null;
  /** Ép dùng template mới kể cả khi chưa chọn tiến độ (form đang nhập). */
  structured?: boolean;
  /** Buổi không điểm danh: bỏ hẳn phần nhận xét từng học sinh (mục 3️⃣). */
  noAttendance?: boolean;
  students: SessionCommentZaloStudent[];
};

export function buildSessionCommentZaloText(
  input: BuildSessionCommentZaloTextInput,
): string {
  if (input.noAttendance && input.students.length > 0) {
    return buildSessionCommentZaloText({ ...input, students: [] });
  }
  if (input.review && (input.structured || input.review.progressStatus)) {
    return buildStructuredSessionReviewText(input, input.review);
  }

  const dateLabel = formatVnDateLabel(input.date);
  const timeRange = formatSessionTimeRangeLabel(input.startTime, input.endTime);

  const makeupLabel = input.makeupOriginalDate
    ? formatVnDateLabel(input.makeupOriginalDate)
    : null;

  const dayReviewLine = makeupLabel
    ? `Buổi học ngày ${dateLabel} (bù ngày ${makeupLabel}).`
    : `Buổi học ngày ${dateLabel}.`;

  const lessonContent = richTextToPlainTextPreservingStructure(
    input.lessonContent,
  );
  const homework = richTextToPlainTextPreservingStructure(input.homework);
  const tutorial = richTextToPlainTextPreservingStructure(input.tutorial);

  const studentBlocks = input.students.map((student) =>
    formatStudentCommentBlock(
      student.fullName,
      student.status,
      resolveStudentCommentLines(student.status, student.notes),
    ),
  );

  const classLabel = input.className.trim() || "—";
  const lines: string[] = [
    `📚 Nhận xét buổi học lớp ${classLabel} — ${dateLabel}`,
  ];

  if (timeRange) {
    lines.push(`⏰ ${timeRange}`);
  }

  lines.push("", "1️⃣ Nhận xét ngày", dayReviewLine, "", "2️⃣ Nội dung bài học");

  lines.push(lessonContent || "—");

  if (!input.noAttendance) {
    lines.push(
      "",
      STUDENT_COMMENTS_SECTION_TITLE,
      studentBlocks.length > 0 ? studentBlocks.join("\n\n") : "—",
    );
  }

  lines.push(
    "",
    "4️⃣ Bài tập về nhà",
    homework || "—",
    "",
    "5️⃣ Tutorial các buổi học",
    tutorial || "—",
    "",
    "— UniEdu",
  );

  return lines.join("\n");
}

export function isRichTextNonEmpty(value: string | null | undefined): boolean {
  return stripRichTextToPlainText(value).length > 0;
}

export function isChargeableAttendanceStatus(
  status: SessionAttendanceStatus,
): boolean {
  return status === "present" || status === "excused";
}

export type SessionCommentZaloSource = SessionReviewFields & {
  className?: string | null;
  ordinal?: number | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  makeupOriginalDate?: string | null;
  notes?: string | null;
  lessonContent?: string | null;
  homework?: string | null;
  tutorial?: string | null;
  /** Snapshot cờ lớp không điểm danh của buổi. */
  snapshotNoAttendance?: boolean | null;
  attendance?: Array<
    AttendanceReviewFields & {
      status: SessionAttendanceStatus;
      notes?: string | null;
      student?: { fullName?: string | null } | null;
    }
  > | null;
};

export function buildSessionCommentZaloTextFromSession(
  session: SessionCommentZaloSource,
): string {
  return buildSessionCommentZaloText({
    className: session.className?.trim() || "—",
    date: session.date,
    startTime: session.startTime,
    endTime: session.endTime,
    makeupOriginalDate: session.makeupOriginalDate ?? null,
    lessonContent: session.lessonContent ?? session.notes ?? "",
    homework: session.homework ?? "",
    tutorial: session.tutorial ?? "",
    ordinal: session.ordinal ?? null,
    review: session,
    noAttendance: Boolean(session.snapshotNoAttendance),
    students: (session.attendance ?? []).map((attendanceItem) => ({
      ...attendanceItem,
      fullName: attendanceItem.student?.fullName?.trim() || "—",
    })),
  });
}

function looksLikeHtmlRichText(value: string): boolean {
  return /<[a-z][a-z0-9]*\b[^>]*>/i.test(value);
}

function looksLikeZaloCommentTemplate(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^📚\s*Nhận xét buổi học lớp/m.test(trimmed) ||
    /^📚\s*Buổi học/m.test(trimmed) ||
    /1️⃣\s*Nhận xét ngày/.test(trimmed) ||
    /3️⃣\s*(Cụ thể từng học sinh|Nhận xét từng học sinh)/.test(trimmed)
  );
}

/**
 * Bỏ mục 3️⃣ (nhận xét từng học sinh) khỏi nhận xét legacy lưu ở `notes`:
 * từ dòng tiêu đề 3️⃣ tới trước mục 4️⃣ (hoặc hết văn bản).
 */
export function stripLegacyStudentCommentsSection(text: string): string {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) =>
    /^\s*3️⃣\s*(Cụ thể từng học sinh|Nhận xét từng học sinh)/.test(line),
  );
  if (start < 0) return text;
  const nextOffset = lines
    .slice(start + 1)
    .findIndex((line) => /^\s*4️⃣/.test(line));
  const end = nextOffset < 0 ? lines.length : start + 1 + nextOffset;
  const kept = [...lines.slice(0, start), ...lines.slice(end)];
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type SessionCommentDisplayContent = {
  mode: "html" | "plain";
  text: string;
};

export function resolveSessionCommentDisplayContent(
  session: SessionCommentZaloSource,
): SessionCommentDisplayContent {
  if (session.progressStatus) {
    return {
      mode: "plain",
      text: buildSessionCommentZaloTextFromSession(session),
    };
  }

  const notes = session.notes?.trim() ?? "";
  const hasStructuredFields = Boolean(
    session.lessonContent?.trim() ||
    session.homework?.trim() ||
    session.tutorial?.trim(),
  );

  if (notes) {
    if (looksLikeHtmlRichText(notes) && !looksLikeZaloCommentTemplate(notes)) {
      return { mode: "html", text: notes };
    }
    return {
      mode: "plain",
      text: session.snapshotNoAttendance
        ? stripLegacyStudentCommentsSection(notes)
        : notes,
    };
  }

  if (hasStructuredFields) {
    return {
      mode: "plain",
      text: buildSessionCommentZaloTextFromSession(session),
    };
  }

  return { mode: "plain", text: "" };
}

/* ───────────── Nhận xét buổi học có cấu trúc ───────────── */

export const SESSION_PROGRESS_STATUS_LABELS: Record<
  SessionProgressStatus,
  string
> = {
  completed: "Hoàn thành",
  partial: "Một phần",
  not_completed: "Chưa hoàn thành",
};

export const HOMEWORK_QUALITY_LABELS: Record<HomeworkQuality, string> = {
  passed: "Đạt",
  needs_revision: "Cần sửa",
  failed: "Chưa đạt",
};

const REVIEW_SECTION_DIVIDER = "━━━━━━━━━━━━━━━";
const REVIEW_SIGNATURE = "— Gia sư Unicorns Edu";
const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

/** Tách textarea "mỗi dòng một ý" thành danh sách ý (bỏ dòng trống, bỏ gạch đầu dòng gõ tay). */
export function splitReviewLines(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(/\r?\n/)
    .map(normalizeBulletContent)
    .filter(Boolean);
}

function formatReviewBullets(value: string | null | undefined): string[] {
  return splitReviewLines(value).map((line) => `• ${line}`);
}

/** `• Nhãn: ý` khi 1 ý; nhiều ý thì xuống dòng thụt lề. */
function formatLabeledReviewLines(
  label: string,
  value: string | null | undefined,
): string[] {
  const items = splitReviewLines(value);
  if (items.length === 0) return [];
  if (items.length === 1) return [`• ${label}: ${items[0]}`];
  return [
    `• ${label}:`,
    ...items.map((item) => `${STUDENT_COMMENT_LINE_INDENT}- ${item}`),
  ];
}

/** "HH:mm dd/MM/yyyy" theo giờ Việt Nam. */
export function formatHomeworkDueAtLabel(
  value: string | null | undefined,
): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: VN_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`;
}

export function formatTestScoreLabel(
  correct: number | null | undefined,
  total: number | null | undefined,
): string {
  if (correct == null || !total) return "";
  return `${correct}/${total} câu – ${Math.round((correct / total) * 100)}%`;
}

function formatStructuredStudentBlock(
  student: SessionCommentZaloStudent,
  review: SessionReviewFields,
): string {
  const nameLine = `👤 ${student.fullName.trim() || "—"} (${attendanceStatusTemplateLabel(student.status)})`;
  if (student.status !== "present" && student.status !== "trial") {
    return nameLine;
  }

  const lines = [nameLine];
  if (review.hasInClassTest) {
    const score = formatTestScoreLabel(
      student.testCorrectCount,
      review.inClassTestTotal,
    );
    const comment = student.testComment?.trim();
    lines.push(
      `🧪 Kết quả: ${[score || "—", comment].filter(Boolean).join(" · ")}`,
    );
  }

  lines.push("✅ Điểm tốt:", ...formatReviewBullets(student.strengths));
  lines.push("⚠️ Cần cải thiện:", ...formatReviewBullets(student.improvements));

  if (student.status === "present") {
    const quality = student.homeworkQuality
      ? HOMEWORK_QUALITY_LABELS[student.homeworkQuality]
      : "—";
    const comment = student.homeworkComment?.trim();
    lines.push(
      `📝 Chất lượng BTVN buổi trước: ${comment ? `${quality} – ${comment}` : quality}`,
    );
  }

  return lines.join("\n");
}

function buildStructuredSessionReviewText(
  input: BuildSessionCommentZaloTextInput,
  review: SessionReviewFields,
): string {
  const dateLabel = formatVnDateLabel(input.date);
  const timeRange = formatSessionTimeRangeLabel(input.startTime, input.endTime);
  const makeupLabel = input.makeupOriginalDate
    ? formatVnDateLabel(input.makeupOriginalDate).slice(0, 5)
    : null;
  const sessionLabel = [
    input.ordinal ? `Buổi ${input.ordinal} – ${dateLabel}` : dateLabel,
    timeRange,
  ]
    .filter(Boolean)
    .join(" | ");

  const lines: string[] = [
    "📚 NHẬN XÉT BUỔI HỌC",
    `🏫 Lớp: ${input.className.trim() || "—"}`,
    `📅 ${sessionLabel}${makeupLabel ? ` (bù ngày ${makeupLabel})` : ""}`,
    "",
    "📖 Nội dung:",
    richTextToPlainTextPreservingStructure(input.lessonContent) || "—",
    "",
    `📊 Tiến độ: ${review.progressStatus ? SESSION_PROGRESS_STATUS_LABELS[review.progressStatus] : "—"}`,
  ];

  if (review.progressStatus !== "completed") {
    lines.push(
      ...formatLabeledReviewLines("Đã xong", review.progressDone),
      ...formatLabeledReviewLines("Chưa xong", review.progressRemaining),
    );
  }

  if (review.hasInClassTest) {
    const content = review.inClassTestContent?.trim() || "—";
    const total = review.inClassTestTotal
      ? ` (${review.inClassTestTotal} câu)`
      : "";
    lines.push("", `🧪 Kiểm tra trong buổi: ${content}${total}`);
  }

  if (input.students.length > 0) {
    lines.push(
      "",
      REVIEW_SECTION_DIVIDER,
      input.students
        .map((student) => formatStructuredStudentBlock(student, review))
        .join("\n\n"),
    );
  }

  const dueLabel = formatHomeworkDueAtLabel(review.homeworkDueAt);
  const retest = review.hasRetest
    ? review.retestContent?.trim() || "—"
    : "Không";
  lines.push(
    "",
    REVIEW_SECTION_DIVIDER,
    "📌 BTVN được giao:",
    richTextToPlainTextPreservingStructure(input.homework) || "—",
  );
  if (dueLabel) {
    lines.push(`⏰ Hạn: ${dueLabel}`);
  }
  lines.push(
    "",
    `🔜 Buổi sau: ${splitReviewLines(review.nextSessionPlan).join("; ") || "—"}`,
    `🔁 Kiểm tra lại: ${retest}`,
    "",
    "📎 Tutorial:",
    richTextToPlainTextPreservingStructure(input.tutorial) || "—",
    "",
    REVIEW_SIGNATURE,
  );

  return lines.join("\n");
}

/**
 * Như `findSessionReviewFormError` nhưng bỏ qua field bắt buộc còn trống — chỉ bắt giá trị
 * sai định dạng/khoảng. Dùng khi admin/trợ lí/kế toán lưu buổi (`PUT /sessions/:id` skipRequired).
 */
export function findSessionReviewFormFormatError(
  review: SessionReviewFields,
  students: SessionCommentZaloStudent[],
): string | null {
  const total = review.hasInClassTest ? review.inClassTestTotal : null;
  if (total != null && total < 1) return "Tổng số câu kiểm tra phải ≥ 1.";
  if (!review.hasInClassTest) return null;

  for (const student of students) {
    if (student.status !== "present" && student.status !== "trial") continue;
    const correct = student.testCorrectCount;
    if (correct == null) continue;
    if (
      !Number.isInteger(correct) ||
      correct < 0 ||
      (total != null && correct > total)
    ) {
      const name = student.fullName.trim() || "học sinh";
      return `Số câu đúng của ${name} phải trong khoảng 0–${total ?? 0}.`;
    }
  }
  return null;
}

/**
 * Lỗi đầu tiên của form Nhận xét buổi học (để toast), null khi hợp lệ.
 * Khớp quy tắc `SessionValidationService` ở API.
 */
export function findSessionReviewFormError(
  review: SessionReviewFields,
  students: SessionCommentZaloStudent[],
): string | null {
  if (!review.progressStatus) return "Vui lòng chọn tiến độ buổi.";
  if (review.progressStatus !== "completed") {
    if (
      review.progressStatus === "partial" &&
      splitReviewLines(review.progressDone).length === 0
    ) {
      return "Vui lòng nhập phần «Đã xong».";
    }
    if (splitReviewLines(review.progressRemaining).length === 0) {
      return "Vui lòng nhập phần «Chưa xong» kèm lý do.";
    }
  }
  if (review.hasInClassTest) {
    if (!review.inClassTestContent?.trim())
      return "Vui lòng nhập nội dung kiểm tra.";
    if (!review.inClassTestTotal || review.inClassTestTotal < 1) {
      return "Tổng số câu kiểm tra phải ≥ 1.";
    }
  }
  if (!review.nextSessionPlan?.trim())
    return "Vui lòng nhập nội dung buổi sau.";
  if (review.hasRetest && !review.retestContent?.trim()) {
    return "Vui lòng nhập nội dung kiểm tra lại.";
  }

  for (const student of students) {
    const name = student.fullName.trim() || "học sinh";
    if (student.status === "excused" && !student.notes?.trim()) {
      return `Vui lòng nhập lý do nghỉ phép của ${name}.`;
    }
    if (student.status !== "present" && student.status !== "trial") continue;
    if (review.hasInClassTest) {
      const total = review.inClassTestTotal ?? 0;
      const correct = student.testCorrectCount;
      if (
        correct == null ||
        !Number.isInteger(correct) ||
        correct < 0 ||
        correct > total
      ) {
        return `Số câu đúng của ${name} phải trong khoảng 0–${total}.`;
      }
      if (!student.testComment?.trim())
        return `Vui lòng nhận xét kết quả kiểm tra của ${name}.`;
    }
    if (splitReviewLines(student.strengths).length === 0) {
      return `Vui lòng nhập điểm tốt của ${name}.`;
    }
    if (splitReviewLines(student.improvements).length === 0) {
      return `Vui lòng nhập phần cần cải thiện của ${name}.`;
    }
    if (student.status === "present") {
      if (!student.homeworkQuality)
        return `Vui lòng chọn chất lượng BTVN của ${name}.`;
      if (!student.homeworkComment?.trim())
        return `Vui lòng nhận xét BTVN của ${name}.`;
    }
  }
  return null;
}
