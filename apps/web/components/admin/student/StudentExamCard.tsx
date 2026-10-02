"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { StudentExamScheduleItem } from "@/dtos/student.dto";
import * as authApi from "@/lib/apis/auth.api";
import * as studentApi from "@/lib/apis/student.api";
import { invalidateCalendarScopedQueries } from "@/lib/query-invalidation";
import StudentExamSchedulePopup from "./StudentExamSchedulePopup";
import StudentInfoCard from "./StudentInfoCard";
import { formatVnDate } from "@/lib/formatters";
export type StudentExamItem = StudentExamScheduleItem;

type Props = {
  studentId: string;
  className?: string;
  editable?: boolean;
  selfService?: boolean;
};

function formatDateOnly(iso: string): string {
  if (!iso) return "—";
  try {
    return formatVnDate(new Date(iso));
  } catch {
    return iso;
  }
}

function normalizeExamDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? trimmed : "";
}

export default function StudentExamCard({
  studentId,
  className = "",
  editable = false,
  selfService = false,
}: Props) {
  const queryClient = useQueryClient();
  const [editorItems, setEditorItems] = useState<StudentExamItem[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);

  const queryKey = selfService
    ? ["student", "self", "exam-schedules"]
    : ["student", "exam-schedules", studentId];

  const {
    data: items = [],
    isLoading,
    isError,
    error,
  } = useQuery<StudentExamItem[], Error>({
    queryKey,
    queryFn: () =>
      selfService
        ? authApi.getMyStudentExamSchedules()
        : studentApi.getStudentExamSchedules(studentId),
    enabled: selfService || Boolean(studentId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (isError && error) {
      toast.error(error.message || "Không thể tải lịch thi.");
    }
  }, [error, isError]);

  const saveMutation = useMutation({
    mutationFn: async (nextItems: StudentExamItem[]) => {
      const payload = {
        items: nextItems.map((item) => ({
          ...(item.id && !item.id.startsWith("local-exam-") ? { id: item.id } : {}),
          examDate: item.examDate,
          note: item.note?.trim() || undefined,
        })),
      };

      return selfService
        ? authApi.updateMyStudentExamSchedules(payload)
        : studentApi.updateStudentExamSchedules(studentId, payload);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["student", "detail", studentId] }),
        queryClient.invalidateQueries({ queryKey: ["student", "self", "detail"] }),
        invalidateCalendarScopedQueries(queryClient),
      ]);
      toast.success("Đã lưu lịch thi.");
      setEditorOpen(false);
    },
    onError: (mutationError: Error) => {
      toast.error(mutationError.message || "Không lưu được lịch thi.");
    },
  });

  const openEditor = () => {
    setEditorItems(items.map((item) => ({ ...item })));
    setEditorOpen(true);
  };

  const handleSaveEditor = (nextItems: StudentExamItem[]) => {
    const normalizedItems = nextItems.map((item) => ({
      ...item,
      examDate: normalizeExamDate(item.examDate),
      note: item.note?.trim() || "",
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
    }));

    saveMutation.mutate(normalizedItems);
  };

  const sorted = useMemo(() => {
    return [...items]
      .filter((item) => item?.examDate)
      .sort((a, b) => {
        const at = new Date(a.examDate).getTime();
        const bt = new Date(b.examDate).getTime();
        if (Number.isFinite(at) && Number.isFinite(bt)) return at - bt;
        if (Number.isFinite(at)) return -1;
        if (Number.isFinite(bt)) return 1;
        return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      });
  }, [items]);

  return (
    <StudentInfoCard title="Lịch thi" className={className}>
      <StudentExamSchedulePopup
        open={editorOpen}
        onClose={() => {
          if (!saveMutation.isPending) {
            setEditorOpen(false);
          }
        }}
        items={editorItems}
        onItemsChange={setEditorItems}
        onSave={handleSaveEditor}
      />

      {editable ? (
        <div className="mb-4 flex flex-col items gap-3">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={openEditor}
              disabled={isLoading || saveMutation.isPending}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 ${
                sorted.length > 0
                  ? "bg-primary hover:bg-primary-hover"
                  : "bg-info hover:brightness-95"
              }`}
            >
              {isLoading
                ? "Đang tải lịch thi…"
                : sorted.length > 0
                  ? "Điều chỉnh lịch thi"
                  : "Thêm lịch thi"}
            </button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border-default bg-bg-secondary/40 px-3.5 py-4 text-sm text-text-muted">
          Đang tải lịch thi…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-secondary/40 px-3.5 py-4 text-sm text-text-muted">
          {editable
            ? "Chưa có lịch thi. Mở popup để tạo lịch thi đầu tiên."
            : "Chưa có lịch thi."}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-border-default bg-bg-surface px-3.5 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">
                    {formatDateOnly(item.examDate)}
                  </p>
                  {item.note?.trim() ? (
                    <p className="mt-1 text-xs text-text-muted">{item.note.trim()}</p>
                  ) : null}
                </div>
                {editable ? (
                  <button
                    type="button"
                    onClick={openEditor}
                    disabled={saveMutation.isPending}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg border border-border-default px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Sửa
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </StudentInfoCard>
  );
}
