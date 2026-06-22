import type { SessionAttendanceStatus } from "@/dtos/session.dto";

export const SESSION_LESSON_CONTENT_PLACEHOLDER =
  "Ghi nội dung đã dạy: bài LEVEL/CONTEST, kiến thức chính, phần HS cần nắm vững…";

export const SESSION_HOMEWORK_PLACEHOLDER =
  "Ghi bài tập HS cần hoàn thành trước buổi sau (số bài, yêu cầu nộp nếu có)";

export function sessionStudentCommentPlaceholder(fullName: string): string {
  return `Nhận xét về ${fullName}: tiến độ, điểm làm tốt và phần cần cải thiện trong buổi này`;
}

function stripRichTextToPlainText(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatVnDateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
  if (!match) return date;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function formatTimeLabel(time: string | null | undefined): string {
  if (!time) return "";
  const match = /^(\d{2}):(\d{2})/.exec(time.trim());
  return match ? `${match[1]}:${match[2]}` : time.trim();
}

function attendanceStatusLabel(status: SessionAttendanceStatus): string {
  if (status === "present") return "Học";
  if (status === "excused") return "Phép";
  return "Vắng";
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
  const startLabel = formatTimeLabel(input.startTime);
  const endLabel = formatTimeLabel(input.endTime);
  const timeRange =
    startLabel && endLabel
      ? `${startLabel}–${endLabel}`
      : startLabel || endLabel || "";

  const makeupLabel = input.makeupOriginalDate
    ? formatVnDateLabel(input.makeupOriginalDate)
    : null;

  const dayReviewLine = makeupLabel
    ? `Buổi học ngày ${dateLabel} (bù ngày ${makeupLabel}).`
    : `Buổi học ngày ${dateLabel}.`;

  const lessonContent = stripRichTextToPlainText(input.lessonContent);
  const homework = stripRichTextToPlainText(input.homework);

  const studentLines = input.students
    .filter((student) => {
      const note = stripRichTextToPlainText(student.notes);
      const chargeable =
        student.status === "present" || student.status === "excused";
      return chargeable && note.length > 0;
    })
    .map((student) => {
      const note = stripRichTextToPlainText(student.notes);
      return `${student.fullName} (${attendanceStatusLabel(student.status)}): ${note}`;
    });

  const lines: string[] = [
    `📚 Buổi học ${input.className.trim() || "—"} — ${dateLabel}`,
  ];

  if (timeRange) {
    lines.push(`⏰ ${timeRange}`);
  }

  lines.push("", "1️⃣ Nhận xét ngày", dayReviewLine, "", "2️⃣ Nội dung bài học");

  lines.push(lessonContent || "—", "", "3️⃣ Cụ thể từng học sinh");

  if (studentLines.length > 0) {
    lines.push(...studentLines);
  } else {
    lines.push("—");
  }

  lines.push("", "4️⃣ Bài tập về nhà", homework || "—", "", "— Unicorns Edu");

  return lines.join("\n");
}

export function isRichTextNonEmpty(value: string | null | undefined): boolean {
  return stripRichTextToPlainText(value).length > 0;
}
