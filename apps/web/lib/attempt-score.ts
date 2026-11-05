import type { AttemptScoringDto } from "@/dtos/attempt.dto";

/**
 * Hiển thị điểm Bài làm theo thang điểm (ADR it-absolute-scoring).
 * - `absolute_it`: lưu đơn vị 1/100 điểm → hiện 2 chữ số thập phân, dấu phẩy (vd 8,75).
 * - `equal_100`: thang 100/N, giữ số nguyên như cũ.
 */
export function formatScoreValue(
  value: number,
  scoring: AttemptScoringDto,
): string {
  if (scoring !== "absolute_it") return String(Math.round(value * 100) / 100);
  return (value / 100).toLocaleString("vi-VN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** `điểm/tối đa`, vd `8,75/10,00` (IT) hoặc `72/100` (JP/ENG). */
export function formatScore(
  score: number,
  max: number,
  scoring: AttemptScoringDto,
): string {
  return `${formatScoreValue(score, scoring)}/${formatScoreValue(max, scoring)}`;
}

/**
 * Nhãn điểm một lượt làm cho học sinh: tổng = trắc nghiệm + tự luận đã chấm.
 * Còn câu tự luận chưa chấm thì vẫn hiện phần đã có, kèm nhãn chờ chấm.
 */
export function attemptScoreLabel(
  attempt: {
    status: string;
    score: number | null;
    scoreMax: number;
    scoring: AttemptScoringDto;
    hasUngradedEssay: boolean;
  },
): string {
  if (attempt.status === "in_progress") return "—";
  if (attempt.score == null) return "—";
  const total = `${formatScore(attempt.score, attempt.scoreMax, attempt.scoring)} điểm`;
  return attempt.hasUngradedEssay ? `${total} · chờ chấm tự luận` : total;
}

/** Giá trị điền sẵn ô chấm điểm theo đơn vị hiển thị (IT: `0,25`; JP/ENG: `5`). */
export function scoreInputValue(
  value: number | null | undefined,
  scoring: AttemptScoringDto,
): string {
  if (value == null) return "";
  if (scoring !== "absolute_it") return String(value);
  return String(value / 100).replace(".", ",");
}

/**
 * Đọc ô chấm điểm (đơn vị hiển thị) → giá trị lưu (IT: 1/100 điểm). Trả null
 * khi không hợp lệ: không phải số, âm, hoặc lẻ hơn đơn vị lưu (IT quá 2 chữ số
 * thập phân, JP/ENG không nguyên).
 */
export function parseScoreInput(
  text: string,
  scoring: AttemptScoringDto,
): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  const raw = scoring === "absolute_it" ? value * 100 : value;
  const rounded = Math.round(raw);
  if (Math.abs(raw - rounded) > 1e-6) return null;
  return rounded;
}
