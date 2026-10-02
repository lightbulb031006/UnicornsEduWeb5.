export type QuestionBankEmptyModuleCopy = {
  title: string;
  body: string;
  actionLabel: string | null;
};

/**
 * Copy when a course has zero modules. Gating uses
 * `canViewContentTab` from `resolveCourseWorkspaceCapabilities` — not a
 * second role matrix. Lesson-plan members cannot create modules, so they
 * get a contact-assistant path instead of a dead-end form.
 */
export function resolveQuestionBankEmptyModuleCopy(
  canViewContentTab: boolean,
): QuestionBankEmptyModuleCopy {
  if (canViewContentTab) {
    return {
      title: "Chưa có chuyên đề",
      body: "Mọi câu hỏi phải thuộc một chuyên đề. Hãy tạo chuyên đề ở tab Nội dung rồi quay lại đây.",
      actionLabel: "Mở tab Nội dung",
    };
  }
  return {
    title: "Chưa có chuyên đề",
    body: "Khoá học này chưa có chuyên đề nên chưa thể tạo câu hỏi. Liên hệ trợ lí để tạo chuyên đề trước.",
    actionLabel: null,
  };
}
