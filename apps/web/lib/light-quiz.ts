import type { LessonQuizAnswer } from "@/dtos/course-content.dto";
import { assertNever } from "@/lib/assert-never";
import { allBlanksAccepted } from "@/lib/fill-blank";
import { isOrderCorrect } from "@/lib/ordering";

type GradableAnswer = Pick<
  LessonQuizAnswer,
  "choiceIndex" | "tfChoices" | "blankAnswers" | "orderAnswer"
> & {
  question: Pick<
    LessonQuizAnswer["question"],
    "type" | "options" | "correctIndex" | "tfAnswerKey" | "blankAnswerKey"
  >;
};

/** Câu trả lời ôn nhẹ đúng hay sai — chỉ để tô màu khi xem lại (tự luận luôn false). */
export function isLightQuizAnswerCorrect(ans: GradableAnswer): boolean {
  const { question } = ans;
  switch (question.type) {
    case "single_choice":
      return (
        ans.choiceIndex !== null && ans.choiceIndex === question.correctIndex
      );
    case "essay":
      return false;
    case "true_false":
      return ans.tfChoices?.[0] === question.tfAnswerKey?.[0];
    case "true_false_group":
      return (question.tfAnswerKey ?? []).every(
        (k, i) => ans.tfChoices?.[i] === k,
      );
    case "fill_blank":
      return allBlanksAccepted(ans.blankAnswers, question.blankAnswerKey);
    case "ordering":
      return isOrderCorrect(ans.orderAnswer, question.options ?? []);
    default:
      return assertNever(question.type, "question type");
  }
}
