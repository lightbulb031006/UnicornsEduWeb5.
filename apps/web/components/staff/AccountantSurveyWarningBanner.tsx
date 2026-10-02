"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as surveysApi from "@/lib/apis/surveys.api";

const WARNINGS_QUERY_KEY = ["surveys", "accountant-warnings"] as const;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Banner cảnh báo cho kế toán chi: nhân sự (gia sư) chưa báo cáo bài khảo sát
 * đã quá hạn. "Đóng" chỉ ẩn tạm trong phiên hiện tại (state); "Đóng và không
 * hiển thị lại" gọi API lưu vĩnh viễn.
 */
export default function AccountantSurveyWarningBanner() {
  const queryClient = useQueryClient();
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const warningsQuery = useQuery({
    queryKey: WARNINGS_QUERY_KEY,
    queryFn: () => surveysApi.getAccountantSurveyWarnings(),
    staleTime: 30_000,
    retry: false,
  });

  const dismissMutation = useMutation({
    mutationFn: (params: { staffId: string; surveyId: string }) =>
      surveysApi.dismissAccountantSurveyWarning({
        staff_id: params.staffId,
        survey_id: params.surveyId,
        permanent: true,
      }),
    onSuccess: async () => {
      toast.success("Đã ẩn cảnh báo.");
      await queryClient.invalidateQueries({ queryKey: WARNINGS_QUERY_KEY });
    },
    onError: () => {
      toast.error("Không thể ẩn cảnh báo.");
    },
  });

  const warnings = (warningsQuery.data ?? []).filter(
    (item) => !hiddenKeys.has(`${item.staffId}::${item.surveyId}`),
  );

  if (warnings.length === 0) {
    return null;
  }

  const closeForSession = (key: string) => {
    setHiddenKeys((prev) => new Set(prev).add(key));
  };

  return (
    <section className="space-y-2 rounded-2xl border border-warning/40 bg-warning/10 p-4">
      <h2 className="text-sm font-semibold text-text-primary">
        ⚠️ Gia sư chưa báo cáo khảo sát quá hạn
      </h2>
      <div className="space-y-2">
        {warnings.map((item) => {
          const key = `${item.staffId}::${item.surveyId}`;
          return (
            <div
              key={key}
              className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="text-sm text-text-secondary">
                <p className="font-semibold text-text-primary">{item.staffName}</p>
                <p className="mt-0.5 text-xs">
                  Chưa báo cáo &quot;{item.surveyName}&quot; (hết hạn{" "}
                  {formatDate(item.endDate)}) cho lớp:{" "}
                  {item.classes.map((cls) => cls.name).join(", ")}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => closeForSession(key)}
                  className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  disabled={dismissMutation.isPending}
                  onClick={() =>
                    dismissMutation.mutate({
                      staffId: item.staffId,
                      surveyId: item.surveyId,
                    })
                  }
                  className="rounded-md border border-border-default px-3 py-1.5 text-xs font-semibold text-text-secondary hover:bg-bg-secondary disabled:opacity-50"
                >
                  Đóng và không hiển thị lại
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
