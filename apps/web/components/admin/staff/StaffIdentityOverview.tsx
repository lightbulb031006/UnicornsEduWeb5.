"use client";

import { useId, type ReactNode } from "react";
import AchievementListEditor from "@/components/shared/achievement/AchievementListEditor";
import StaffMeetActionButton from "./StaffMeetActionButton";
import StaffQrCard from "./StaffQrCard";

function InlineFact({ label, value }: { label: string; value: ReactNode }) {
  const display =
    value === undefined || value === null || value === "" ? "—" : value;
  return (
    <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5">
      <span className="shrink-0 text-sm text-text-secondary">{label}</span>
      <span className="min-w-0 break-words text-sm text-text-primary">
        {display}
      </span>
    </span>
  );
}

function FactRow({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5 sm:gap-x-2.5">
      {items.map((item, index) => (
        <span
          key={item.label}
          className="inline-flex max-w-full items-baseline gap-x-2 sm:gap-x-2.5"
        >
          {index > 0 ? (
            <span className="select-none text-text-muted/30" aria-hidden>
              ·
            </span>
          ) : null}
          <InlineFact label={item.label} value={item.value} />
        </span>
      ))}
    </div>
  );
}

/** Matches in-page section titles e.g. "Thống kê thu nhập". */
const SECTION_HEADING =
  "text-sm font-semibold uppercase tracking-wide text-text-primary";

export type StaffIdentityOverviewProps = {
  staffId: string;
  /**
   * Admin detail uses admin APIs; staff self profile uses /users/me/achievements;
   * `saleCsTeam`: Trưởng phòng Sale & CSKH đọc qua /sale-cs-team (chỉ đọc);
   * `training`: Ban Đào Tạo qua /training/tutors (sửa được với cấp dưới).
   */
  achievementMode?: "admin" | "self" | "saleCsTeam" | "training";
  email?: string | null;
  phone?: string | null;
  accountHandle?: string | null;
  /** 16/11: có thì hiện nút «Đổi» cạnh Handle (người xem có quyền đổi tên đăng nhập). */
  onEditAccountHandle?: () => void;
  birthDateLabel: string;
  province: React.ReactNode;
  ethnicity?: string | null;
  gender?: string | null;
  cccdNumber?: string | null;
  cccdIssuedDateLabel?: string | null;
  cccdIssuedPlace?: string | null;
  currentAddress?: string | null;
  university?: string | null;
  highSchool?: string | null;
  bankAccount?: string | null;
  googleMeetLink?: string | null;
  /** Chỉ dùng khi `showBankInfo` (mặc định true). */
  qrLink?: string | null;
  onQrEdit?: () => void;
  /** When false, QR block is view-only (no edit / add link). Default true. */
  allowQrEdit?: boolean;
  /** When false, achievements render read-only. Default follows allowQrEdit. */
  allowAchievementEdit?: boolean;
  /**
   * #270: false → ẩn email, SĐT, ngày sinh, dân tộc, giới tính, CCCD, địa chỉ
   * (backend đã không trả các trường này). Mặc định true.
   */
  showPersonalInfo?: boolean;
  /** #270: false → ẩn số tài khoản + QR ngân hàng. Mặc định true. */
  showBankInfo?: boolean;
};

function getGenderLabel(gender?: string | null): string {
  if (gender === "female") return "Nữ";
  if (gender === "male") return "Nam";
  return "—";
}

export default function StaffIdentityOverview({
  staffId,
  achievementMode = "admin",
  email,
  phone,
  accountHandle,
  onEditAccountHandle,
  birthDateLabel,
  province,
  ethnicity,
  gender,
  cccdNumber,
  cccdIssuedDateLabel,
  cccdIssuedPlace,
  currentAddress,
  university,
  highSchool,
  bankAccount,
  googleMeetLink,
  qrLink = null,
  onQrEdit = () => {},
  allowQrEdit = true,
  allowAchievementEdit,
  showPersonalInfo = true,
  showBankInfo = true,
}: StaffIdentityOverviewProps) {
  const sectionTitleId = useId();
  const achievementsTitleId = useId();
  const trimmedGoogleMeetLink = googleMeetLink?.trim() || null;
  const canEditAchievements = allowAchievementEdit ?? allowQrEdit;

  return (
    <section
      className="rounded-lg border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5"
      aria-labelledby={sectionTitleId}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={sectionTitleId} className={`min-w-0 flex-1 ${SECTION_HEADING}`}>
          Hồ sơ nhân sự
        </h2>
        {showBankInfo ? (
          <StaffQrCard
            qrLink={qrLink}
            onEditClick={onQrEdit}
            size="minimal"
            embedded
            className="shrink-0"
            allowEdit={allowQrEdit}
          />
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        <FactRow
          items={[
            ...(showPersonalInfo
              ? [
                  { label: "Email", value: email?.trim() },
                  { label: "SĐT", value: phone?.trim() },
                ]
              : []),
            {
              label: "Handle",
              value: onEditAccountHandle ? (
                <span className="inline-flex flex-wrap items-baseline gap-x-2">
                  <span>
                    {accountHandle?.trim() ? `@${accountHandle.trim()}` : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={onEditAccountHandle}
                    className="inline-flex min-h-9 items-center rounded-md px-2 text-sm font-medium text-primary transition hover:bg-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:py-0.5"
                    aria-label="Đổi tên đăng nhập"
                  >
                    Đổi
                  </button>
                </span>
              ) : accountHandle?.trim() ? (
                `@${accountHandle.trim()}`
              ) : null,
            },
          ]}
        />
        <FactRow
          items={
            showPersonalInfo
              ? [
                  { label: "Ngày sinh", value: birthDateLabel },
                  { label: "Tỉnh / TP", value: province },
                  { label: "Dân tộc", value: ethnicity?.trim() },
                  { label: "Giới tính", value: getGenderLabel(gender) },
                ]
              : [{ label: "Tỉnh / TP", value: province }]
          }
        />
        {showPersonalInfo ? (
          <FactRow
            items={[
              { label: "Số CCCD", value: cccdNumber?.trim() },
              { label: "Ngày cấp", value: cccdIssuedDateLabel },
              { label: "Nơi cấp", value: cccdIssuedPlace?.trim() },
            ]}
          />
        ) : null}
        <FactRow
          items={[
            { label: "Trường ĐH", value: university?.trim() },
            { label: "Trường THPT", value: highSchool?.trim() },
          ]}
        />
        {showPersonalInfo ? (
          <InlineFact label="Địa chỉ hiện tại" value={currentAddress?.trim()} />
        ) : null}
        {showBankInfo ? (
          <InlineFact label="Số tài khoản" value={bankAccount?.trim()} />
        ) : null}
        {!showPersonalInfo ? (
          <p className="text-xs text-text-muted">
            Thông tin cá nhân (CCCD, liên hệ, địa chỉ, ngày sinh) chỉ Admin và
            chính nhân sự được xem.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-border-default pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Google Meet
          </p>
          <p
            className="mt-1 truncate text-sm text-text-primary"
            title={trimmedGoogleMeetLink ?? undefined}
          >
            {trimmedGoogleMeetLink ?? "Chưa có link Google Meet"}
          </p>
        </div>
        <StaffMeetActionButton
          meetLink={trimmedGoogleMeetLink}
          className="shrink-0"
        />
      </div>

      <div className="mt-5 border-t border-border-default pt-4">
        <h3 id={achievementsTitleId} className={SECTION_HEADING}>
          Thành tích
        </h3>
        <div className="mt-3" aria-labelledby={achievementsTitleId}>
          <AchievementListEditor
            owner={
              achievementMode === "self"
                ? { kind: "staff", mode: "self" }
                : { kind: "staff", mode: achievementMode, staffId }
            }
            editable={canEditAchievements}
            heading=""
          />
        </div>
      </div>
    </section>
  );
}
