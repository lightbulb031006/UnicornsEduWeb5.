"use client";

import { useMemo } from "react";
import type { StudentSurveyItem } from "@/dtos/student-class.dto";
import { sanitizeRichTextContent } from "@/lib/sanitize";
import { formatVnDate } from "@/lib/formatters";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";

function formatDate(date: Date): string {
  return formatVnDate(new Date(date));
}

export default function StudentSurveyDetailDialog({
  survey,
  onClose,
}: {
  survey: StudentSurveyItem;
  onClose: () => void;
}) {
  const myAssessment = survey.studentAssessments?.[0];
  // Nội dung do giáo viên nhập (rich text) => sanitize trước khi inject HTML.
  const knowledgeAssessmentHtml = useMemo(
    () => sanitizeRichTextContent(myAssessment?.knowledgeAssessment ?? ""),
    [myAssessment?.knowledgeAssessment],
  );
  const commentHtml = useMemo(
    () => sanitizeRichTextContent(myAssessment?.comment ?? ""),
    [myAssessment?.comment],
  );

  return (
    <ResponsiveDialog onBackdropClick={onClose}>
      <ResponsiveDialogBody className="max-w-lg">
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-text-primary">Chi tiết khảo sát</h2>

          <div className="text-sm text-text-muted">
            {formatDate(survey.reportDate)}
          </div>

          {survey.survey?.name && (
            <div className="text-sm font-medium text-text-primary">
              {survey.survey.name}
            </div>
          )}

          {myAssessment?.knowledgeAssessment && (
            <div className="rounded-xl border border-border-default bg-bg-secondary/40 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
                Đánh giá kiến thức
              </h3>
              <div
                className="prose prose-sm max-w-none text-text-primary [&_a]:text-primary [&_a]:underline [&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-bold"
                dangerouslySetInnerHTML={{ __html: knowledgeAssessmentHtml }}
              />
            </div>
          )}

          {myAssessment?.comment && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1">
                Nhận xét dành riêng cho bạn
              </h3>
              <div
                className="prose prose-sm max-w-none text-text-primary [&_a]:text-primary [&_a]:underline [&_p]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-bold"
                dangerouslySetInnerHTML={{ __html: commentHtml }}
              />
            </div>
          )}

          {!myAssessment?.knowledgeAssessment && !myAssessment?.comment && (
            <p className="text-sm text-text-muted">
              Chưa có đánh giá cho bạn trong khảo sát này.
            </p>
          )}
        </div>
      </ResponsiveDialogBody>
    </ResponsiveDialog>
  );
}
