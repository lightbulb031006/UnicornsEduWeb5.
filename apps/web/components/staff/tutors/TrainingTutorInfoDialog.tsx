"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import StaffMeetActionButton from "@/components/admin/staff/StaffMeetActionButton";
import StaffAvatarUploadField from "@/components/staff/StaffAvatarUploadField";
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
import type {
  TrainingTutorDetail,
  UpdateTrainingTutorProfilePayload,
} from "@/dtos/training-tutor.dto";
import { regenerateStaffMeetLink } from "@/lib/apis/staff.api";
import {
  trainingTutorKeys,
  updateStaffTrainingRoles,
  updateTrainingTutorAccountStatus,
  updateTrainingTutorProfile,
  updateTrainingTutorStatus,
  uploadTrainingTutorAvatar,
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

type ProfileKey = keyof Required<UpdateTrainingTutorProfilePayload>;

const PROFILE_FIELDS: {
  key: ProfileKey;
  label: string;
  maxLength: number;
  required?: boolean;
}[] = [
  { key: "lastName", label: "Họ", maxLength: 100 },
  { key: "firstName", label: "Tên", maxLength: 100, required: true },
  { key: "university", label: "Trường đại học", maxLength: 255 },
  { key: "highSchool", label: "Trường THPT", maxLength: 255 },
];

const INPUT_CLASS =
  "min-h-11 w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:bg-bg-secondary disabled:text-text-secondary aria-invalid:border-error";

const BUTTON_SECONDARY =
  "min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_PRIMARY =
  "min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50";

const ACTION_CLASS =
  "min-h-10 rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50";

function initialProfile(
  tutor: TrainingTutorDetail,
): Record<ProfileKey, string> {
  return {
    lastName: tutor.management?.lastName ?? "",
    firstName: tutor.management?.firstName ?? "",
    university: tutor.university ?? "",
    highSchool: tutor.highSchool ?? "",
  };
}

function DialogSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-b border-border-subtle pb-4 last:border-b-0 last:pb-0">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-text-primary">
          {title}
        </h3>
        {hint ? <p className="mt-0.5 text-xs text-text-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SwitchRow({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 py-2">
      <label htmlFor={id} className="text-sm font-medium text-text-primary">
        {label}
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * Dialog «Thông tin nhân sự» của Trưởng ban Đào tạo trên cấp dưới (mở khi bấm
 * avatar / tên, như `EditStaffPopup` ở `/admin/staffs/:id`). Gom hồ sơ chuyên
 * môn + ảnh, role Gia sư / Ban Chuyên môn / Đào tạo, trạng thái, khoá tài khoản
 * và link Meet. Phần nào không có quyền (`management.permissions`, #278) thì
 * chỉ đọc. Không có liên hệ, giấy tờ, ngân hàng, lương (#270).
 */
export default function TrainingTutorInfoDialog({
  tutor,
  onClose,
}: {
  tutor: TrainingTutorDetail & {
    management: NonNullable<TrainingTutorDetail["management"]>;
  };
  onClose: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();
  const { management } = tutor;
  const { permissions } = management;
  const name = tutor.fullName.trim() || "Nhân sự này";
  const canLock =
    permissions.canLockAccount && management.accountLocked != null;
  const canEditAnything =
    permissions.canEditProfile ||
    permissions.canEditRoles ||
    permissions.canChangeStatus ||
    canLock;

  const [profileInitial] = useState(() => initialProfile(tutor));
  const [profile, setProfile] = useState(profileInitial);
  const [rolesInitial] = useState(() => getManageableRoles(tutor.roles));
  const [roles, setRoles] =
    useState<TrainingHeadManageableRole[]>(rolesInitial);
  const [inactive, setInactive] = useState(tutor.status === "inactive");
  const [locked, setLocked] = useState(management.accountLocked ?? false);

  const changedProfile = PROFILE_FIELDS.filter(
    ({ key }) => profile[key].trim() !== profileInitial[key].trim(),
  );
  const rolesDirty =
    roles.length !== rolesInitial.length ||
    roles.some((role) => !rolesInitial.includes(role));
  const statusDirty =
    permissions.canChangeStatus && inactive !== (tutor.status === "inactive");
  const lockDirty = canLock && locked !== management.accountLocked;
  const isDirty =
    changedProfile.length > 0 || rolesDirty || statusDirty || lockDirty;

  const firstNameEmpty = profile.firstName.trim() === "";
  const hasAnyRole = hasAnyRoleAfterChange(
    tutor.roles,
    roles,
    management.hasOtherRoles,
  );
  const removedRoles = rolesInitial.filter((role) => !roles.includes(role));
  const readOnlyRoles = getReadOnlyRoles(tutor.roles);
  const canSubmit = isDirty && !firstNameEmpty && hasAnyRole;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trainingTutorKeys.all });

  const mutation = useMutation({
    // Endpoint riêng cho từng phần (#278); gọi tuần tự, lỗi giữa chừng thì phần
    // trước đã lưu — `onSettled` tải lại để giao diện khớp backend.
    mutationFn: async () => {
      if (changedProfile.length > 0) {
        const payload: UpdateTrainingTutorProfilePayload = {};
        for (const { key } of changedProfile)
          payload[key] = profile[key].trim();
        await updateTrainingTutorProfile(tutor.id, payload);
      }
      if (rolesDirty) await updateStaffTrainingRoles(tutor.id, { roles });
      if (statusDirty) {
        await updateTrainingTutorStatus(tutor.id, {
          status: inactive ? "inactive" : "active",
        });
      }
      if (lockDirty) await updateTrainingTutorAccountStatus(tutor.id, locked);
    },
    onSuccess: () => {
      toast.success("Đã cập nhật thông tin nhân sự.");
      onClose();
    },
    onError: (error) => {
      toast.error(
        getMutationErrorMessage(
          error,
          "Không cập nhật được thông tin nhân sự.",
        ),
      );
    },
    onSettled: () => invalidate(),
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => uploadTrainingTutorAvatar(tutor.id, file),
    onSuccess: async () => {
      toast.success("Đã đổi ảnh đại diện.");
      await invalidate();
    },
    onError: (error) => {
      toast.error(
        getMutationErrorMessage(error, "Không đổi được ảnh đại diện."),
      );
    },
  });

  const meetMutation = useMutation({
    mutationFn: () => regenerateStaffMeetLink(tutor.id),
    onSuccess: async () => {
      toast.success("Đã tạo lại link Meet.");
      await invalidate();
    },
    onError: (error) => {
      toast.error(
        getMutationErrorMessage(error, "Không tạo lại được link Meet."),
      );
    },
  });

  const busy =
    mutation.isPending || avatarMutation.isPending || meetMutation.isPending;

  const toggleRole = (role: TrainingHeadManageableRole, checked: boolean) => {
    setRoles((prev) =>
      checked
        ? TRAINING_HEAD_MANAGEABLE_ROLES.filter(
            (item) => item === role || prev.includes(item),
          )
        : prev.filter((item) => item !== role),
    );
  };

  const requestClose = async () => {
    if (busy) return;
    if (await confirmUnsavedClose(confirm, isDirty)) onClose();
  };

  const requestMeetRegenerate = async () => {
    if (busy) return;
    const ok = await confirm({
      title: "Tạo lại link Meet?",
      description:
        "Link cũ sẽ ngừng dùng; lịch dạy và buổi bù của nhân sự được cập nhật sang link mới.",
      confirmLabel: "Tạo lại",
    });
    if (ok) meetMutation.mutate();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || busy) return;
    if (
      statusDirty &&
      inactive &&
      !(await confirm({
        title: "Chuyển sang đã nghỉ?",
        description: `${name} sẽ được đánh dấu đã nghỉ; lịch dạy sắp tới bị gỡ.`,
        confirmLabel: "Chuyển sang đã nghỉ",
        variant: "destructive",
      }))
    ) {
      return;
    }
    if (
      lockDirty &&
      locked &&
      !(await confirm({
        title: "Khoá tài khoản?",
        description: `${name} sẽ không đăng nhập được cho tới khi được mở khoá.`,
        confirmLabel: "Khoá",
        variant: "destructive",
      }))
    ) {
      return;
    }
    mutation.mutate();
  };

  const showAccountSection =
    permissions.canChangeStatus || management.accountLocked != null;

  return (
    <>
      <ResponsiveDialog
        size="md"
        labelledBy={titleId}
        describedBy={descId}
        onBackdropClick={() => void requestClose()}
      >
        <div className="border-b border-border-default px-4 py-3 sm:px-5">
          <h2
            id={titleId}
            className="text-base font-semibold text-text-primary"
          >
            Thông tin nhân sự
          </h2>
          <p
            id={descId}
            className="mt-1 text-sm text-text-secondary wrap-anywhere"
          >
            {tutor.fullName.trim() || "Nhân sự"} · Thông tin cá nhân, ngân hàng,
            lương do Admin quản lý.
          </p>
        </div>
        <form
          onSubmit={(event) => void handleSubmit(event)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ResponsiveDialogBody>
            <div className="flex flex-col gap-4">
              <DialogSection
                title="Hồ sơ chuyên môn"
                hint={
                  permissions.canEditProfile
                    ? undefined
                    : "Chỉ xem — không sửa được hồ sơ nhân sự này."
                }
              >
                {permissions.canEditProfile ? (
                  <StaffAvatarUploadField
                    disabled={busy}
                    isPending={avatarMutation.isPending}
                    onFileSelected={(file) => avatarMutation.mutate(file)}
                  />
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  {PROFILE_FIELDS.map(({ key, label, maxLength, required }) => {
                    const inputId = `${titleId}-${key}`;
                    return (
                      <div key={key} className="flex flex-col gap-1.5">
                        <label
                          htmlFor={inputId}
                          className="text-sm font-medium text-text-primary"
                        >
                          {label}
                          {required && permissions.canEditProfile ? (
                            <span className="text-error"> *</span>
                          ) : null}
                        </label>
                        <input
                          id={inputId}
                          type="text"
                          className={INPUT_CLASS}
                          value={profile[key]}
                          maxLength={maxLength}
                          disabled={busy || !permissions.canEditProfile}
                          aria-invalid={required && firstNameEmpty}
                          onChange={(event) =>
                            setProfile((prev) => ({
                              ...prev,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
                {firstNameEmpty && permissions.canEditProfile ? (
                  <p className="text-xs text-error">Tên không được để trống.</p>
                ) : null}
              </DialogSection>

              <DialogSection
                title="Role"
                hint={
                  permissions.canEditRoles
                    ? "Bật/tắt Gia sư, Ban Chuyên môn, Đào tạo. Role khác giữ nguyên."
                    : "Chỉ xem — không đổi được role của nhân sự này."
                }
              >
                <ul className="divide-y divide-border-subtle">
                  {TRAINING_HEAD_MANAGEABLE_ROLES.map((role) => (
                    <li key={role}>
                      <SwitchRow
                        id={`${titleId}-${role}`}
                        label={ROLE_LABELS[role] ?? role}
                        checked={roles.includes(role)}
                        disabled={busy || !permissions.canEditRoles}
                        onCheckedChange={(checked) => toggleRole(role, checked)}
                      />
                    </li>
                  ))}
                </ul>
                {readOnlyRoles.length > 0 ? (
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
                ) : management.hasOtherRoles ? (
                  <p className="text-xs text-text-muted">
                    Nhân sự còn role khác ngoài ba nhóm (giữ nguyên).
                  </p>
                ) : null}
                {removedRoles.length > 0 ? (
                  <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-text-secondary">
                    Tắt role sẽ xoá mức đè lương cứng riêng của role đó (nếu
                    có).
                  </p>
                ) : null}
                {!hasAnyRole ? (
                  <p className="text-xs text-error">
                    Nhân sự phải còn ít nhất một role.
                  </p>
                ) : null}
              </DialogSection>

              {showAccountSection ? (
                <DialogSection
                  title="Tài khoản"
                  hint={
                    management.hasOtherRoles
                      ? "Nhân sự kiêm role ngoài Gia sư / Ban Chuyên môn / Đào tạo: đổi trạng thái và khoá tài khoản do Admin thực hiện."
                      : undefined
                  }
                >
                  <div className="divide-y divide-border-subtle">
                    <SwitchRow
                      id={`${titleId}-inactive`}
                      label="Đã nghỉ"
                      checked={inactive}
                      disabled={busy || !permissions.canChangeStatus}
                      onCheckedChange={setInactive}
                    />
                    {management.accountLocked != null ? (
                      <SwitchRow
                        id={`${titleId}-locked`}
                        label="Khoá đăng nhập"
                        checked={locked}
                        disabled={busy || !canLock}
                        onCheckedChange={setLocked}
                      />
                    ) : null}
                  </div>
                </DialogSection>
              ) : null}

              {permissions.canManageMeetLink ? (
                <DialogSection
                  title="Link Google Meet"
                  hint="Tạo lại link được áp dụng ngay, không cần bấm Lưu."
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                      {management.googleMeetLink?.trim() || "Chưa có link."}
                    </span>
                    <div className="flex items-center gap-2">
                      <StaffMeetActionButton
                        meetLink={management.googleMeetLink}
                      />
                      <button
                        type="button"
                        className={ACTION_CLASS}
                        disabled={busy}
                        onClick={() => void requestMeetRegenerate()}
                      >
                        {meetMutation.isPending ? "Đang tạo…" : "Tạo lại link"}
                      </button>
                    </div>
                  </div>
                </DialogSection>
              ) : null}
            </div>
          </ResponsiveDialogBody>
          <ResponsiveActionFooter>
            <button
              type="button"
              onClick={() => void requestClose()}
              disabled={busy}
              className={BUTTON_SECONDARY}
            >
              {canEditAnything ? "Hủy" : "Đóng"}
            </button>
            {canEditAnything ? (
              <button
                type="submit"
                disabled={!canSubmit || busy}
                className={BUTTON_PRIMARY}
              >
                {mutation.isPending ? "Đang lưu…" : "Lưu"}
              </button>
            ) : null}
          </ResponsiveActionFooter>
        </form>
      </ResponsiveDialog>
      {dialog}
    </>
  );
}
