import type { SessionAttendanceStatus } from "@/dtos/session.dto";

export const SESSION_LESSON_CONTENT_PLACEHOLDER =
  "Ghi nội dung đã dạy: bài LEVEL/CONTEST, kiến thức chính, phần HS cần nắm vững…";

export const SESSION_HOMEWORK_PLACEHOLDER =
  "Ghi bài tập HS cần hoàn thành trước buổi sau (số bài, yêu cầu nộp nếu có)";

export function sessionStudentCommentPlaceholder(fullName: string): string {
  return `Nhận xét về ${fullName}: tiến độ, điểm làm tốt và phần cần cải thiện trong buổi này`;
}

const EXCUSED_ABSENCE_LABEL = "Vắng có phép";
const EMPTY_COMMENT_LABEL = "—";
const STUDENT_COMMENTS_SECTION_TITLE = "3️⃣ Nhận xét từng học sinh";
const STUDENT_COMMENT_LINE_INDENT = "  ";

export function attendanceStatusTemplateLabel(
  status: SessionAttendanceStatus,
): string {
  if (status === "present") return "học";
  if (status === "excused") return "nghỉ phép";
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

function stripInlineHtml(value: string): string {
  return decodeHtmlEntities(
    value
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

  let html = String(value);

  html = html.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, listContent: string) => {
    let index = 0;
    return listContent.replace(
      /<li[^>]*>([\s\S]*?)<\/li>/gi,
      (_, itemContent: string) => {
        index += 1;
        const text = stripInlineHtml(itemContent);
        return text ? `${index}. ${text}\n` : "";
      },
    );
  });

  html = html.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, listContent: string) =>
    listContent.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, itemContent: string) => {
      const text = stripInlineHtml(itemContent);
      return text ? `- ${text}\n` : "";
    }),
  );

  html = html.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, itemContent: string) => {
    const text = stripInlineHtml(itemContent);
    return text ? `- ${text}\n` : "";
  });

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

export type SessionCommentZaloStudent = {
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
  students: SessionCommentZaloStudent[];
};

export function buildSessionCommentZaloText(
  input: BuildSessionCommentZaloTextInput,
): string {
  const dateLabel = formatVnDateLabel(input.date);
  const timeRange = formatSessionTimeRangeLabel(input.startTime, input.endTime);

  const makeupLabel = input.makeupOriginalDate
    ? formatVnDateLabel(input.makeupOriginalDate)
    : null;

  const dayReviewLine = makeupLabel
    ? `Buổi học ngày ${dateLabel} (bù ngày ${makeupLabel}).`
    : `Buổi học ngày ${dateLabel}.`;

  const lessonContent = richTextToPlainTextPreservingStructure(input.lessonContent);
  const homework = richTextToPlainTextPreservingStructure(input.homework);

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

  lines.push(lessonContent || "—", "", STUDENT_COMMENTS_SECTION_TITLE);

  if (studentBlocks.length > 0) {
    lines.push(studentBlocks.join("\n\n"));
  } else {
    lines.push("—");
  }

  lines.push("", "4️⃣ Bài tập về nhà", homework || "—", "", "— Unicorns Edu");

  return lines.join("\n");
}

export function isRichTextNonEmpty(value: string | null | undefined): boolean {
  return stripRichTextToPlainText(value).length > 0;
}

export type SessionCommentZaloSource = {
  className?: string | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  makeupOriginalDate?: string | null;
  notes?: string | null;
  lessonContent?: string | null;
  homework?: string | null;
  attendance?: Array<{
    status: SessionAttendanceStatus;
    notes?: string | null;
    student?: { fullName?: string | null } | null;
  }> | null;
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
    students: (session.attendance ?? []).map((attendanceItem) => ({
      fullName: attendanceItem.student?.fullName?.trim() || "—",
      status: attendanceItem.status,
      notes: attendanceItem.notes,
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

export type SessionCommentDisplayContent = {
  mode: "html" | "plain";
  text: string;
};

export function resolveSessionCommentDisplayContent(
  session: SessionCommentZaloSource,
): SessionCommentDisplayContent {
  const notes = session.notes?.trim() ?? "";
  const hasStructuredFields = Boolean(
    session.lessonContent?.trim() || session.homework?.trim(),
  );

  if (notes) {
    if (looksLikeHtmlRichText(notes) && !looksLikeZaloCommentTemplate(notes)) {
      return { mode: "html", text: notes };
    }
    return { mode: "plain", text: notes };
  }

  if (hasStructuredFields) {
    return {
      mode: "plain",
      text: buildSessionCommentZaloTextFromSession(session),
    };
  }

  return { mode: "plain", text: "" };
}
