/** Chấm câu tự luận trên màn Bài làm (chế độ Chấm điểm). */
export interface GradeEssayAnswerPayload {
  pointsAwarded: number;
  feedback?: string | null;
}
