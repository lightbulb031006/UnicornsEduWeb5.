"use client";

import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { ClassModuleDto } from "@/dtos/course-content.dto";
import * as classApi from "@/lib/apis/class.api";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import { classKeys, classTimelineKeys } from "@/lib/query-keys";

const rowButtonClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-9";

type ClassModulesDialogProps = {
  classId: string;
  onClose: () => void;
};

/**
 * Thêm/gỡ Chuyên đề của khoá vào lớp. Thêm chuyên đề kéo mọi tiết lý thuyết của nó và
 * đưa nhóm lên đầu; tiết thực hành vẫn giao từng tiết. Gỡ = coi như chưa từng thêm.
 */
export default function ClassModulesDialog({
  classId,
  onClose,
}: ClassModulesDialogProps) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const descriptionId = useId();
  const [removeTarget, setRemoveTarget] = useState<ClassModuleDto | null>(null);

  const modulesQuery = useQuery<ClassModuleDto[]>({
    queryKey: classKeys.modules(classId),
    queryFn: () => classApi.getClassModules(classId),
    enabled: Boolean(classId),
  });

  const applyModules = (modules: ClassModuleDto[]) => {
    queryClient.setQueryData(classKeys.modules(classId), modules);
    void queryClient.invalidateQueries({
      queryKey: classTimelineKeys.list(classId),
    });
    void queryClient.invalidateQueries({ queryKey: ["class-content", classId] });
    void queryClient.invalidateQueries({
      queryKey: classKeys.courseLessons(classId),
    });
  };

  const addMutation = useMutation({
    mutationFn: (moduleId: string) => classApi.addClassModule(classId, moduleId),
    onSuccess: (modules) => {
      applyModules(modules);
      toast.success("Đã thêm chuyên đề vào lớp.");
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Không thêm được chuyên đề.")),
  });

  const removeMutation = useMutation({
    mutationFn: (moduleId: string) =>
      classApi.removeClassModule(classId, moduleId),
    onSuccess: (modules) => {
      applyModules(modules);
      setRemoveTarget(null);
      toast.success("Đã gỡ chuyên đề khỏi lớp.");
    },
    onError: (error) =>
      toast.error(getMutationErrorMessage(error, "Không gỡ được chuyên đề.")),
  });

  const removalImpactQuery = useQuery({
    queryKey: classKeys.moduleRemovalImpact(
      classId,
      removeTarget?.moduleId ?? "",
    ),
    queryFn: () =>
      classApi.getClassModuleRemovalImpact(classId, removeTarget!.moduleId),
    enabled: removeTarget !== null,
    staleTime: 0,
  });

  const busy = addMutation.isPending || removeMutation.isPending;
  const modules = modulesQuery.data ?? [];

  return (
    <ResponsiveDialog
      onBackdropClick={onClose}
      size="2xl"
      labelledBy={titleId}
      describedBy={descriptionId}
    >
      <ResponsiveDialogBody className="flex max-h-[92vh] flex-col overflow-hidden p-4 sm:p-6">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-default pb-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-lg font-bold text-text-primary sm:text-xl"
            >
              Chuyên đề của lớp
            </h2>
            <p id={descriptionId} className="mt-0.5 text-xs text-text-muted">
              Thêm chuyên đề để đưa mọi tiết lý thuyết của nó vào lớp; tiết lý
              thuyết thêm vào chuyên đề sau này cũng tự hiện. Tiết thực hành giao
              từng tiết.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain py-4 [scrollbar-width:thin]">
          {modulesQuery.isLoading ? (
            Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))
          ) : modulesQuery.isError ? (
            <p className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              Không tải được danh sách chuyên đề.
            </p>
          ) : modules.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-default bg-bg-secondary/20 p-6 text-center text-sm text-text-muted">
              Khoá của lớp chưa có chuyên đề.
            </p>
          ) : (
            modules.map((module) => (
              <ClassModuleRow
                key={module.moduleId}
                module={module}
                disabled={busy}
                adding={
                  addMutation.isPending &&
                  addMutation.variables === module.moduleId
                }
                onAdd={() => addMutation.mutate(module.moduleId)}
                onRemove={() => setRemoveTarget(module)}
              />
            ))
          )}
        </div>
      </ResponsiveDialogBody>

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
        title={`Gỡ chuyên đề “${removeTarget?.title ?? ""}” khỏi lớp?`}
        description={
          <RemovalImpactDescription
            loading={removalImpactQuery.isLoading}
            failed={removalImpactQuery.isError}
            ungradedEssayCount={removalImpactQuery.data?.ungradedEssayCount ?? 0}
            inProgressStudentCount={
              removalImpactQuery.data?.inProgressStudentCount ?? 0
            }
          />
        }
        confirmLabel="Gỡ chuyên đề"
        variant="destructive"
        confirmPending={removeMutation.isPending}
        onConfirm={() => {
          if (removeTarget) removeMutation.mutate(removeTarget.moduleId);
        }}
      />
    </ResponsiveDialog>
  );
}

/** Nội dung xác nhận gỡ; nằm trong `<p>` của AlertDialog nên chỉ dùng `<span>`. */
function RemovalImpactDescription({
  loading,
  failed,
  ungradedEssayCount,
  inProgressStudentCount,
}: {
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
      <span className="block">
        Nhóm chuyên đề biến mất khỏi lớp: tiết lý thuyết và tiết thực hành đã giao
        đều ẩn với học sinh. Bài làm, điểm và lượt xem giữ nguyên; thêm lại chuyên
        đề sẽ hiện lại.
      </span>
      {loading ? (
        <span className="block text-text-muted">Đang kiểm tra bài làm...</span>
      ) : failed ? (
        <span className="block text-text-muted">
          Không kiểm tra được bài làm dở / chưa chấm.
        </span>
      ) : warnings.length > 0 ? (
        <span className="block rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 font-medium text-text-primary">
          Chuyên đề còn {warnings.join(" và ")}. Sau khi gỡ, trang Chấm bài của
          các tiết này không còn lối vào cho tới khi thêm lại chuyên đề.
        </span>
      ) : null}
    </span>
  );
}

function ClassModuleRow({
  module,
  disabled,
  adding,
  onAdd,
  onRemove,
}: {
  module: ClassModuleDto;
  disabled: boolean;
  adding: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border-default bg-bg-surface p-3 sm:p-3.5">
      <Layers className="size-4 shrink-0 text-text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-text-primary">
            {module.title}
          </p>
          {module.added ? <Badge variant="success">Đã thêm</Badge> : null}
        </div>
        <p className="mt-0.5 text-xs text-text-muted">
          {module.theoryLessonCount} tiết lý thuyết ·{" "}
          {module.practiceLessonCount} tiết thực hành
        </p>
      </div>
      {module.added ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className={`${rowButtonClass} border-error/40 bg-bg-surface text-error hover:bg-error/5`}
        >
          <Minus className="size-3.5" aria-hidden />
          Gỡ
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={onAdd}
          className={`${rowButtonClass} border-border-default bg-bg-surface text-text-primary hover:bg-bg-secondary`}
        >
          <Plus className="size-3.5" aria-hidden />
          {adding ? "Đang thêm..." : "Thêm"}
        </button>
      )}
    </div>
  );
}
