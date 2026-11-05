import { api } from "@/lib/client";
import type { ExamPrintFile, ExamPrintTarget } from "@/dtos/exam-print.dto";

function examPrintPath(target: ExamPrintTarget): string {
  switch (target.kind) {
    case "lesson":
      return `/lessons/${encodeURIComponent(target.lessonId)}/print.pdf`;
    case "staff-assignment":
      return `/staff-ops/classes/${encodeURIComponent(target.classId)}/assignments/${encodeURIComponent(target.assignmentId)}/print.pdf`;
    case "student-assignment":
      return `/users/me/student-classes/${encodeURIComponent(target.classId)}/assignments/${encodeURIComponent(target.assignmentId)}/print.pdf`;
  }
}

/**
 * Lỗi của request `responseType: "blob"` cũng về dạng Blob — đọc JSON ra
 * `response.data` để `getMutationErrorMessage` lấy được message của API.
 */
async function unwrapBlobError(error: unknown): Promise<never> {
  const response = (error as { response?: { data?: unknown } })?.response;
  if (response?.data instanceof Blob) {
    try {
      response.data = JSON.parse(await response.data.text());
    } catch {
      // Không phải JSON → giữ lỗi gốc.
    }
  }
  throw error;
}

/** Tải PDF Đề in. `withAnswers` chỉ có nghĩa ở phía dạy (học sinh luôn nhận bản Đề). */
export async function downloadExamPrint(
  target: ExamPrintTarget,
  withAnswers = false,
): Promise<ExamPrintFile> {
  const response = await api
    .get<Blob>(examPrintPath(target), {
      params:
        target.kind !== "student-assignment" && withAnswers
          ? { answers: true }
          : undefined,
      responseType: "blob",
    })
    .catch(unwrapBlobError);
  const contentDisposition = response.headers["content-disposition"] as
    string | undefined;
  const filename =
    contentDisposition?.match(/filename="?([^"]+)"?/)?.[1] ?? "de.pdf";
  return { blob: response.data, filename };
}
