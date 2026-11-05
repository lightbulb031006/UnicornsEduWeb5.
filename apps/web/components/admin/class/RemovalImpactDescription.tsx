import type { ReactNode } from "react";

/**
 * Nội dung xác nhận gỡ khỏi lớp (tiết hoặc chuyên đề) kèm cảnh báo bài làm dở / chưa chấm.
 * Nằm trong `<p>` của AlertDialog nên chỉ dùng `<span>`.
 */
export default function RemovalImpactDescription({
  intro,
  subject,
  afterRemoval,
  loading,
  failed,
  ungradedEssayCount,
  inProgressStudentCount,
}: {
  intro: ReactNode;
  /** Chủ ngữ câu cảnh báo, vd. "Chuyên đề", "Tiết". */
  subject: string;
  /** Câu nối sau cảnh báo: hậu quả với trang Chấm bài. */
  afterRemoval: string;
  loading: boolean;
  failed: boolean;
  ungradedEssayCount: number;
  inProgressStudentCount: number;
}) {
  const warnings = [
    ungradedEssayCount > 0
      ? `${ungradedEssayCount} câu tự luận chưa chấm`
      : null,
    inProgressStudentCount > 0
      ? `${inProgressStudentCount} học sinh đang làm dở`
      : null,
  ].filter(Boolean);

  return (
    <span className="block space-y-2">
      <span className="block">{intro}</span>
      {loading ? (
        <span className="block text-text-muted">Đang kiểm tra bài làm...</span>
      ) : failed ? (
        <span className="block text-text-muted">
          Không kiểm tra được bài làm dở / chưa chấm.
        </span>
      ) : warnings.length > 0 ? (
        <span className="block rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 font-medium text-text-primary">
          {subject} còn {warnings.join(" và ")}. {afterRemoval}
        </span>
      ) : null}
    </span>
  );
}
