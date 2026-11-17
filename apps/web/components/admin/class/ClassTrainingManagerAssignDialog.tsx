"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ClassDetail } from "@/dtos/class.dto";
import * as trainingManagerApi from "@/lib/apis/training-manager.api";
import { buildClassManagerOptions } from "@/lib/class-manager-options";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import {
  classEditorModalCloseButtonClassName,
  classEditorModalPrimaryButtonClassName,
  classEditorModalSecondaryButtonClassName,
  classEditorModalTitleClassName,
} from "./classEditorModalStyles";

type Props = {
  classDetail: ClassDetail;
  onClose: () => void;
  /** Gọi sau khi lưu để làm mới dữ liệu lớp. */
  onChanged: () => Promise<unknown>;
};

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    (err as Error)?.message ??
    fallback
  );
}

/**
 * #277 — Trưởng ban Đào tạo (và Admin) giao / gỡ Quản lý lớp trên mọi lớp.
 * Chỉ gửi `trainingManagerStaffId`; % trợ cấp quản lý lớp chỉ Admin sửa ở
 * form admin. Backend chặn 403 với role khác.
 */
export default function ClassTrainingManagerAssignDialog({
  classDetail,
  onClose,
  onChanged,
}: Props) {
  const initialManagerId = classDetail.trainingManager?.id ?? "";
  const [managerId, setManagerId] = useState(initialManagerId);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const isDirty = managerId !== initialManagerId;

  const { data: trainingStaff = [], isLoading } = useQuery({
    // Ban Đào Tạo đang hoạt động (`training` / `training_head`, backend lọc).
    queryKey: ["staff", "training-manager-options", { limit: 50 }],
    queryFn: () => trainingManagerApi.getTrainingManagerOptions({ limit: 50 }),
    staleTime: 60_000,
  });

  const options = buildClassManagerOptions({
    trainingStaff,
    classTeachers: classDetail.teachers ?? [],
    currentManager: classDetail.trainingManager,
  });

  const saveMutation = useMutation({
    mutationFn: (nextManagerId: string) =>
      trainingManagerApi.updateClassTrainingManager(classDetail.id, {
        trainingManagerStaffId: nextManagerId || null,
      }),
    onSuccess: async (_data, nextManagerId) => {
      toast.success(nextManagerId ? "Đã giao Quản lý lớp." : "Đã gỡ Quản lý lớp.");
      await onChanged();
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, "Không thể lưu Quản lý lớp.")),
  });

  const requestClose = () => {
    if (saveMutation.isPending) return;
    if (isDirty) {
      setDiscardConfirmOpen(true);
      return;
    }
    onClose();
  };

  return (
    <>
      <ResponsiveDialog
        size="md"
        labelledBy="class-training-manager-assign-title"
        onBackdropClick={requestClose}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle p-4 sm:p-5">
          <div className="min-w-0">
            <h2
              id="class-training-manager-assign-title"
              className={classEditorModalTitleClassName}
            >
              Quản lý lớp
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              Giao hoặc gỡ người quản lý lớp. % trợ cấp quản lý lớp do Admin đặt.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className={classEditorModalCloseButtonClassName}
            aria-label="Đóng"
          >
            <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ResponsiveDialogBody className="space-y-2">
          <span
            id="class-training-manager-assign-label"
            className="ml-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-text-muted"
          >
            Người quản lý
          </span>
          <UpgradedSelect
            name="class-training-manager"
            labelId="class-training-manager-assign-label"
            value={managerId}
            onValueChange={setManagerId}
            options={options}
            searchable
            disabled={isLoading || saveMutation.isPending}
            buttonClassName="min-h-11 w-full rounded-xl border border-border-default bg-bg-primary px-3 py-2 text-sm"
          />
        </ResponsiveDialogBody>

        <ResponsiveActionFooter className="sm:flex sm:justify-end">
          <button
            type="button"
            onClick={requestClose}
            className={classEditorModalSecondaryButtonClassName}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate(managerId)}
            disabled={!isDirty || saveMutation.isPending}
            className={classEditorModalPrimaryButtonClassName}
          >
            {saveMutation.isPending ? "Đang lưu..." : "Lưu"}
          </button>
        </ResponsiveActionFooter>
      </ResponsiveDialog>

      <ConfirmDialog
        open={discardConfirmOpen}
        onOpenChange={setDiscardConfirmOpen}
        title="Bỏ thay đổi chưa lưu?"
        description="Quản lý lớp vừa chọn sẽ không được lưu."
        confirmLabel="Bỏ thay đổi"
        cancelLabel="Tiếp tục sửa"
        variant="destructive"
        onConfirm={() => {
          setDiscardConfirmOpen(false);
          onClose();
        }}
      />
    </>
  );
}
