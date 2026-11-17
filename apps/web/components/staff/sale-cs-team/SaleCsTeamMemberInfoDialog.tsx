"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
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
import StaffAvatarUploadField from "@/components/staff/StaffAvatarUploadField";
import { Switch } from "@/components/ui/switch";
import type {
  SaleCsTeamMemberDetail,
  SaleCsTeamRole,
  UpdateSaleCsTeamProfilePayload,
} from "@/dtos/sale-cs-team.dto";
import {
  saleCsTeamKeys,
  updateSaleCsTeamAccountStatus,
  updateSaleCsTeamProfile,
  updateSaleCsTeamRoles,
  uploadSaleCsTeamAvatar,
} from "@/lib/apis/sale-cs-team.api";
import {
  buildCustomerCareReleaseConfirm,
  formatCustomerCareReleasedToast,
  isRemovingCustomerCareRole,
} from "@/lib/customer-care-role-release";
import { getMutationErrorMessage } from "@/lib/mutation-feedback";
import {
  SALE_CS_TEAM_ROLES,
  getNonTeamRoles,
  getSaleCsTeamRoles,
  hasAnyRoleAfterTeamChange,
} from "@/lib/sale-cs-team";
import { ROLE_LABELS } from "@/lib/staff.constants";

type ProfileKey = keyof Required<UpdateSaleCsTeamProfilePayload>;

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

function initialProfile(
  member: SaleCsTeamMemberDetail,
): Record<ProfileKey, string> {
  return {
    lastName: member.lastName ?? "",
    firstName: member.firstName ?? "",
    university: member.university ?? "",
    highSchool: member.highSchool ?? "",
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

/**
 * Dialog «Thông tin nhân sự» của Trưởng phòng Sale & CSKH (mở khi bấm avatar /
 * tên, như `EditStaffPopup` ở `/admin/staffs/:id`). Gom hồ sơ chuyên môn, role
 * Sale/CSKH và khoá tài khoản vào một form; phần nào không có quyền thì chỉ đọc.
 * Ảnh đại diện đổi ngay khi chọn (cùng quyền `canEditProfile`).
 * Không có liên hệ, giấy tờ, ngân hàng, lương (#270 — backend cũng không nhận).
 */
export default function SaleCsTeamMemberInfoDialog({
  member,
  onClose,
}: {
  member: SaleCsTeamMemberDetail;
  onClose: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();
  const { permissions } = member;
  const canLock = permissions.canLockAccount && member.accountLocked != null;
  const canEditAnything =
    permissions.canEditProfile || permissions.canEditRoles || canLock;

  const [profileInitial] = useState(() => initialProfile(member));
  const [profile, setProfile] = useState(profileInitial);
  const [rolesInitial] = useState(() => getSaleCsTeamRoles(member.roles));
  const [roles, setRoles] = useState<SaleCsTeamRole[]>(rolesInitial);
  const [locked, setLocked] = useState(member.accountLocked ?? false);

  const changedProfile = PROFILE_FIELDS.filter(
    ({ key }) => profile[key].trim() !== profileInitial[key].trim(),
  );
  const rolesDirty =
    roles.length !== rolesInitial.length ||
    roles.some((role) => !rolesInitial.includes(role));
  const lockDirty = canLock && locked !== member.accountLocked;
  const isDirty = changedProfile.length > 0 || rolesDirty || lockDirty;

  const firstNameEmpty = profile.firstName.trim() === "";
  const hasAnyRole = hasAnyRoleAfterTeamChange(member.roles, roles);
  const releasesStudents =
    isRemovingCustomerCareRole(member.roles, roles) &&
    member.customerCareStudentCount > 0;
  const removedRoles = rolesInitial.filter((role) => !roles.includes(role));
  const readOnlyRoles = getNonTeamRoles(member.roles);
  const canSubmit = isDirty && !firstNameEmpty && hasAnyRole;

  const mutation = useMutation({
    // Ba endpoint riêng (#271); gọi tuần tự, lỗi giữa chừng thì phần trước đã lưu.
    mutationFn: async () => {
      if (changedProfile.length > 0) {
        const payload: UpdateSaleCsTeamProfilePayload = {};
        for (const { key } of changedProfile)
          payload[key] = profile[key].trim();
        await updateSaleCsTeamProfile(member.id, payload);
      }
      let released = 0;
      if (rolesDirty) {
        const result = await updateSaleCsTeamRoles(member.id, { roles });
        released = result.releasedCustomerCareStudentCount;
      }
      if (lockDirty) {
        await updateSaleCsTeamAccountStatus(member.id, { locked });
      }
      return released;
    },
    onSuccess: (released) => {
      const releasedText = formatCustomerCareReleasedToast(released);
      toast.success(
        releasedText
          ? `Đã cập nhật thông tin nhân sự. ${releasedText}`
          : "Đã cập nhật thông tin nhân sự.",
      );
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
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: saleCsTeamKeys.all }),
  });

  // Ảnh lưu ngay khi chọn (endpoint riêng), không đi qua nút «Lưu» của form.
  const avatarMutation = useMutation({
    mutationFn: (file: File) => uploadSaleCsTeamAvatar(member.id, file),
    onSuccess: () => {
      toast.success("Đã đổi ảnh đại diện.");
    },
    onError: (error) => {
      toast.error(
        getMutationErrorMessage(error, "Không đổi được ảnh đại diện."),
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: saleCsTeamKeys.all }),
  });

  const toggleRole = (role: SaleCsTeamRole, checked: boolean) => {
    setRoles((prev) =>
      checked
        ? SALE_CS_TEAM_ROLES.filter(
            (item) => item === role || prev.includes(item),
          )
        : prev.filter((item) => item !== role),
    );
  };

  const requestClose = async () => {
    if (mutation.isPending || avatarMutation.isPending) return;
    if (await confirmUnsavedClose(confirm, isDirty)) onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || mutation.isPending) return;
    const releaseConfirm = releasesStudents
      ? buildCustomerCareReleaseConfirm({
          staffName: member.fullName,
          studentCount: member.customerCareStudentCount,
        })
      : null;
    if (releaseConfirm && !(await confirm(releaseConfirm))) return;
    if (
      lockDirty &&
      locked &&
      !(await confirm({
        title: "Khoá tài khoản?",
        description: `${member.fullName.trim() || "Nhân sự này"} sẽ không đăng nhập được cho tới khi được mở khoá.`,
        confirmLabel: "Khoá",
        variant: "destructive",
      }))
    ) {
      return;
    }
    mutation.mutate();
  };

  const busy = mutation.isPending || avatarMutation.isPending;

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
            {member.fullName.trim() || "Nhân sự"} · Thông tin cá nhân, ngân
            hàng, lương do Admin quản lý.
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
                {firstNameEmpty ? (
                  <p className="text-xs text-error">Tên không được để trống.</p>
                ) : null}
              </DialogSection>

              <DialogSection
                title="Role"
                hint={
                  permissions.canEditRoles
                    ? "Bật/tắt Sale, CSKH. Role khác giữ nguyên."
                    : "Chỉ xem — không đổi được role của nhân sự này."
                }
              >
                <ul className="divide-y divide-border-subtle">
                  {SALE_CS_TEAM_ROLES.map((role) => {
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
                          checked={roles.includes(role)}
                          onCheckedChange={(checked) =>
                            toggleRole(role, checked)
                          }
                          disabled={busy || !permissions.canEditRoles}
                        />
                      </li>
                    );
                  })}
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
                ) : null}
                {removedRoles.length > 0 ? (
                  <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-text-secondary">
                    Tắt role sẽ xoá mức đè lương cứng riêng của role đó (nếu
                    có).
                  </p>
                ) : null}
                {releasesStudents ? (
                  <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-text-secondary">
                    CSKH này đang chăm sóc {member.customerCareStudentCount} học
                    sinh. Tắt role CSKH thì các học sinh này mất Người chăm sóc
                    ngay, chờ giao lại.
                  </p>
                ) : null}
                {!hasAnyRole ? (
                  <p className="text-xs text-error">
                    Nhân sự phải còn ít nhất một role.
                  </p>
                ) : null}
              </DialogSection>

              {member.accountLocked != null ? (
                <DialogSection
                  title="Tài khoản"
                  hint={
                    canLock
                      ? undefined
                      : "Chỉ khoá được nhân sự chỉ mang role Sale / CSKH."
                  }
                >
                  <div className="flex min-h-12 items-center justify-between gap-3">
                    <label
                      htmlFor={`${titleId}-locked`}
                      className="text-sm font-medium text-text-primary"
                    >
                      Khoá đăng nhập
                    </label>
                    <Switch
                      id={`${titleId}-locked`}
                      checked={locked}
                      onCheckedChange={setLocked}
                      disabled={busy || !canLock}
                    />
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
                {busy ? "Đang lưu…" : "Lưu"}
              </button>
            ) : null}
          </ResponsiveActionFooter>
        </form>
      </ResponsiveDialog>
      {dialog}
    </>
  );
}
