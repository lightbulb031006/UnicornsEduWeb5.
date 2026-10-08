"use client";

import { useQuery } from "@tanstack/react-query";
import { getStaffSurveyDeadlineBlockWarnings } from "@/lib/apis/staff.api";
import { formatVnDate } from "@/lib/formatters";

type Props = {
  staffId: string;
  className?: string;
};

/**
 * Cảnh báo kế toán chi trên màn trả trợ cấp: gia sư đang trong khung **chặn khảo
 * sát sắp hạn** còn lớp chưa nộp. Chỉ thông tin, không chặn thao tác trả.
 */
export default function SurveyDeadlineBlockPaymentWarning({ staffId, className }: Props) {
  const { data: warnings = [] } = useQuery({
    queryKey: ["staff", "survey-deadline-block-warnings", staffId],
    queryFn: () => getStaffSurveyDeadlineBlockWarnings(staffId),
    enabled: Boolean(staffId),
    staleTime: 60_000,
    retry: false,
  });

  if (warnings.length === 0) {
    return null;
  }

  return (
    <div
      role="status"
      className={`rounded-xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm text-text-primary ${className ?? ""}`}
    >
      <p className="font-semibold">⚠️ Gia sư chưa nộp khảo sát sắp hạn</p>
      <ul className="mt-1 space-y-0.5 text-xs text-text-secondary">
        {warnings.map((item) => (
          <li key={item.surveyId}>
            • {item.surveyName} (hạn {formatVnDate(item.endDate)}): {item.classNames.join(", ")}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs font-medium text-text-primary">
        Trả trợ cấp lúc này là trách nhiệm của kế toán.
      </p>
    </div>
  );
}
