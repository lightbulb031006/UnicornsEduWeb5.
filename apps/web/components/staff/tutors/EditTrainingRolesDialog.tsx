"use client";

import { useId, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  confirmUnsavedClose,
  useConfirmDialog,
} from "@/components/ui/ConfirmDialog";
import {
  ResponsiveActionFooter,
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import { Switch } from "@/components/ui/switch";
import {
  trainingTutorKeys,
  updateStaffTrainingRoles,
} from "@/lib/apis/training-tutor.api";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import { ROLE_LABELS } from "@/lib/staff.constants";
import {
  TRAINING_HEAD_MANAGEABLE_ROLES,
  getManageableRoles,
  getReadOnlyRoles,
  hasAnyRoleAfterChange,
  type TrainingHeadManageableRole,
} from "@/lib/training-head-roles";

type Props = {
  staff: {
    id: string;
    fullName: string;
    roles: string[];
    management?: { hasOtherRoles: boolean };
  };
  onClose: () => void;
};

/**
 * Trưởng ban Đào tạo bật/tắt role gia sư, Ban Chuyên môn, Đào Tạo. Role khác chỉ
 * đọc. Tắt role thì mức đè lương cứng của role đó bị xoá (backend ghi lịch sử).
 */
export default function EditTrainingRolesDialog({ staff, onClose }: Props) {
  const titleId = useId();
  const descId = useId();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();
  const initial = getManageableRoles(staff.roles);
  const readOnlyRoles = getReadOnlyRoles(staff.roles);
  const [selected, setSelected] =
    useState<TrainingHeadManageableRole[]>(initial);

  const isDirty =
    selected.length !== initial.length ||
    selected.some((role) => !initial.includes(role));
  const hasOtherRoles = staff.management?.hasOtherRoles ?? false;
  const hasAnyRole = hasAnyRoleAfterChange(
    staff.roles,
    selected,
    hasOtherRoles,
  );

  const mutation = useMutation({
    mutationFn: () => updateStaffTrainingRoles(staff.id, { roles: selected }),
    onSuccess: async () => {
      toast.success("Đã cập nhật role nhân sự.");
      await queryClient.invalidateQueries({ queryKey: trainingTutorKeys.all });
      onClose();
    },
    onError: (error) => {
      toast.error(
        getMutationErrorMessage(error, "Không cập nhật được role nhân sự."),
      );
    },
  });

  const toggle = (role: TrainingHeadManageableRole, checked: boolean) => {
    setSelected((prev) =>
      checked
        ? TRAINING_HEAD_MANAGEABLE_ROLES.filter(
            (item) => item === role || prev.includes(item),
          )
        : prev.filter((item) => item !== role),
    );
  };

  const requestClose = async () => {
    if (mutation.isPending) return;
    if (await confirmUnsavedClose(confirm, isDirty)) onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isDirty || !hasAnyRole || mutation.isPending) return;
    mutation.mutate();
  };

  const removed = initial.filter((role) => !selected.includes(role));

  return (
    <>
      <ResponsiveDialog
        size="sm"
        labelledBy={titleId}
        describedBy={descId}
        onBackdropClick={() => void requestClose()}
      >
        <div className="border-b border-border-default px-4 py-3 sm:px-5">
          <h2
            id={titleId}
            className="text-base font-semibold text-text-primary"
          >
            Sửa role
          </h2>
          <p
            id={descId}
            className="mt-1 text-sm text-text-secondary wrap-anywhere"
          >
            {staff.fullName.trim() || "Nhân sự"}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <ResponsiveDialogBody>
            <ul className="divide-y divide-border-subtle">
              {TRAINING_HEAD_MANAGEABLE_ROLES.map((role) => {
                const switchId = `${titleId}-${role}`;
                return (
                  <li
                    key={role}
                    className="flex min-h-12 items-center justify-between gap-3 py-2"
                  >
                    <label
                      htmlFor={switchId}
                      className="text-sm font-medium text-text-primary"
                    >
                      {ROLE_LABELS[role] ?? role}
                    </label>
                    <Switch
                      id={switchId}
                      checked={selected.includes(role)}
                      onCheckedChange={(checked) => toggle(role, checked)}
                      disabled={mutation.isPending}
                    />
                  </li>
                );
              })}
            </ul>

            {readOnlyRoles.length > 0 ? (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-text-muted">
                  Role khác (giữ nguyên)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {readOnlyRoles.map((role) => (
                    <span
                      key={role}
                      className="rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs text-text-secondary"
                    >
                      {ROLE_LABELS[role] ?? role}
                    </span>
                  ))}
                </div>
              </div>
            ) : hasOtherRoles ? (
              <p className="mt-4 text-xs text-text-muted">
                Nhân sự còn role khác ngoài ba nhóm (giữ nguyên).
              </p>
            ) : null}

            {removed.length > 0 ? (
              <p className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-xs text-text-secondary">
                Tắt role sẽ xoá mức đè lương cứng riêng của role đó (nếu có).
              </p>
            ) : null}
            {!hasAnyRole ? (
              <p className="mt-2 text-xs text-error">
                Nhân sự phải còn ít nhất một role.
              </p>
            ) : null}
          </ResponsiveDialogBody>
          <ResponsiveActionFooter>
            <button
              type="button"
              onClick={() => void requestClose()}
              disabled={mutation.isPending}
              className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!isDirty || !hasAnyRole || mutation.isPending}
              className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              {mutation.isPending ? "Đang lưu…" : "Lưu"}
            </button>
          </ResponsiveActionFooter>
        </form>
      </ResponsiveDialog>
      {dialog}
    </>
  );
}
