"use client";

import { useState, type SyntheticEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import type { ClassDetail, UpdateClassTuitionPayload } from "@/dtos/class.dto";
import * as classApi from "@/lib/apis/class.api";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import ClassTuitionFields, { useClassTuitionForm } from "./ClassTuitionFields";
import {
  classEditorModalPrimaryButtonClassName,
  classEditorModalSecondaryButtonClassName,
} from "./classEditorModalStyles";

const TITLE_ID = "edit-class-tuition-title";
const DESCRIPTION_ID = "edit-class-tuition-description";

const INPUT_CLASS =
  "min-h-11 w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";

type Props = {
  open: boolean;
  onClose: () => void;
  classDetail: ClassDetail;
  /**
   * #273: mở từ luồng thêm học sinh đầu tiên vào lớp chưa có học phí — bắt
   * buộc điền (0đ tính là đã điền) và gọi `onSaved` để mở tiếp popup học sinh.
   */
  requiredBeforeFirstStudent?: boolean;
  /**
   * Lớp đang có học sinh học. Lớp bán một lần còn trống được để trống Tổng gói
   * (follow-up grill 13/11); mặc định `true` để không nới lỏng nhầm.
   */
  hasActiveStudents?: boolean;
  onSaved?: () => void;
};

/**
 * **Học phí lớp** bắt buộc điền trước học sinh đầu tiên (#273). Sửa học phí
 * thường ngày nằm trong dialog Thông tin lớp (13/11: bỏ card Học phí lớp).
 */
export default function EditClassTuitionPopup({ open, ...props }: Props) {
  if (!open) return null;
  // Mount lại mỗi lần mở để form lấy số mới nhất của lớp.
  return <EditClassTuitionForm {...props} />;
}

function EditClassTuitionForm({
  onClose,
  classDetail,
  requiredBeforeFirstStudent = false,
  hasActiveStudents = true,
  onSaved,
}: Omit<Props, "open">) {
  const queryClient = useQueryClient();
  const pricingMode = classDetail.pricingMode ?? "per_session";
  const tuitionForm = useClassTuitionForm(classDetail);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const isDirty = tuitionForm.isDirty(pricingMode);

  const mutation = useMutation({
    mutationFn: (payload: UpdateClassTuitionPayload) =>
      classApi.updateClassTuition(classDetail.id, payload),
    onSuccess: async () => {
      toast.success("Đã lưu học phí lớp.");
      onClose();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["class", "detail", classDetail.id] }),
        queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
      ]);
      onSaved?.();
    },
    onError: (error: unknown) => {
      toast.error(getMutationErrorMessage(error, "Không thể cập nhật học phí lớp."));
    },
  });

  const requestClose = () => {
    if (mutation.isPending) return;
    if (isDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    onClose();
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mutation.isPending) return;
    if (!isDirty && !requiredBeforeFirstStudent) {
      onClose();
      return;
    }

    const payload = tuitionForm.buildPayload({
      pricingMode,
      requiredBeforeFirstStudent,
      hasActiveStudents,
    });
    if (!payload) return;
    mutation.mutate(payload);
  };

  return (
    <>
      <ResponsiveDialog
        size="lg"
        labelledBy={TITLE_ID}
        describedBy={DESCRIPTION_ID}
        onBackdropClick={requestClose}
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <ResponsiveDialogBody className="flex flex-col gap-4">
            <div>
              <h2 id={TITLE_ID} className="text-base font-semibold text-text-primary">
                Học phí lớp
              </h2>
              <p id={DESCRIPTION_ID} className="mt-1 text-sm text-text-secondary">
                {requiredBeforeFirstStudent
                  ? "Lớp chưa có học phí. Điền Học phí lớp trước khi thêm học sinh đầu tiên — 0đ vẫn tính là đã điền, học phí riêng của học sinh không thay được học phí lớp."
                  : pricingMode === "one_time"
                    ? "Học phí chung của lớp. Lớp bán một lần chốt gói lúc học sinh vào lớp: học sinh đang học giữ gói đã chốt, gói mới chỉ áp cho học sinh vào sau."
                    : "Học phí chung của lớp. Học sinh có học phí riêng giữ nguyên số riêng."}
              </p>
            </div>

            <ClassTuitionFields
              form={tuitionForm}
              pricingMode={pricingMode}
              inputClassName={INPUT_CLASS}
            />
          </ResponsiveDialogBody>

          <ResponsiveActionFooter>
            <button
              type="button"
              onClick={requestClose}
              disabled={mutation.isPending}
              className={classEditorModalSecondaryButtonClassName}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className={classEditorModalPrimaryButtonClassName}
            >
              {mutation.isPending
                ? "Đang lưu..."
                : requiredBeforeFirstStudent
                  ? "Lưu và thêm học sinh"
                  : "Lưu"}
            </button>
          </ResponsiveActionFooter>
        </form>
      </ResponsiveDialog>
      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="Bỏ thay đổi học phí?"
        description="Học phí lớp vừa nhập chưa được lưu."
        confirmLabel="Bỏ"
        cancelLabel="Tiếp tục sửa"
        variant="destructive"
        onConfirm={onClose}
      />
    </>
  );
}
