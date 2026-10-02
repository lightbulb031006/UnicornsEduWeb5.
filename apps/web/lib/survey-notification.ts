/**
 * Build the plain-text "THÔNG BÁO KHẢO SÁT" message (same style as the Zalo
 * announcement template) from structured survey notification fields, so it
 * can be copied and pasted directly into a Zalo group.
 */
export interface SurveyNotificationFields {
  title: string | null | undefined;
  startDate: string | null | undefined;
  endDate: string | null | undefined;
  content: string | null | undefined;
  instructions: string | null | undefined;
  notes: string | null | undefined;
  teacherNote: string | null | undefined;
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "";
  const [, month, day] = value.slice(0, 10).split("-");
  if (!month || !day) return value;
  return `${day}/${month}`;
}

export function buildSurveyZaloMessage(fields: SurveyNotificationFields): string {
  const lines: string[] = [];

  if (fields.title?.trim()) {
    lines.push(`📢 ${fields.title.trim()}`);
  }

  const start = formatShortDate(fields.startDate);
  const end = formatShortDate(fields.endDate);
  if (start || end) {
    lines.push(`⏰ Thời gian: ${start}${start && end ? " → " : ""}${end}`);
  }

  if (fields.content?.trim()) {
    lines.push("📌 Nội dung:", fields.content.trim(), "");
  }

  if (fields.instructions?.trim()) {
    lines.push("📝 Hướng dẫn:", fields.instructions.trim(), "");
  }

  if (fields.notes?.trim()) {
    lines.push("⚠️ Lưu ý:", fields.notes.trim(), "");
  }

  if (fields.teacherNote?.trim()) {
    lines.push("📅 Gia sư:", fields.teacherNote.trim(), "");
  }

  return lines.join("\n").trim();
}

/**
 * Build the plain-text "BÁO CÁO KHẢO SÁT" message for a single class survey
 * report (survey_name/lần khảo sát + đánh giá kiến thức chung + nhận xét
 * từng học sinh), so it can be copied and pasted directly into a Zalo group.
 */
export interface ClassSurveyReportZaloFields {
  className: string | null | undefined;
  surveyName: string | null | undefined;
  reportDate: string | null | undefined;
  teacherName: string | null | undefined;
  knowledgeAssessment: string | null | undefined;
  students: { fullName: string; comment: string | null | undefined }[];
}

function formatFullDate(value: string | null | undefined): string {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function buildClassSurveyReportZaloMessage(
  fields: ClassSurveyReportZaloFields,
): string {
  const lines: string[] = ["📢 BÁO CÁO KHẢO SÁT"];

  if (fields.className?.trim()) {
    lines.push(`🏫 Lớp: ${fields.className.trim()}`);
  }
  if (fields.surveyName?.trim()) {
    lines.push(`📋 Bài khảo sát: ${fields.surveyName.trim()}`);
  }
  const reportDate = formatFullDate(fields.reportDate);
  if (reportDate) {
    lines.push(`📅 Ngày báo cáo: ${reportDate}`);
  }
  if (fields.teacherName?.trim()) {
    lines.push(`👨‍🏫 Người phụ trách: ${fields.teacherName.trim()}`);
  }

  lines.push(
    "",
    "📌 Đánh giá kiến thức:",
    fields.knowledgeAssessment?.trim() || "—",
  );

  const commentedStudents = fields.students.filter((item) =>
    item.comment?.trim(),
  );
  if (commentedStudents.length > 0) {
    lines.push("", "📝 Nhận xét học sinh:");
    for (const student of commentedStudents) {
      lines.push(`- ${student.fullName}: ${student.comment?.trim()}`);
    }
  }

  return lines.join("\n").trim();
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
