"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SetAccountHandleDialog } from "@/components/admin/user";
import MonthNav from "@/components/admin/MonthNav";
import StaffIdentityOverview from "@/components/admin/staff/StaffIdentityOverview";
import StaffBonusViewCard from "@/components/staff/detail/StaffBonusViewCard";
import StaffDetailBackLink from "@/components/staff/detail/StaffDetailBackLink";
import StaffDetailHero from "@/components/staff/detail/StaffDetailHero";
import StaffDetailSkeleton from "@/components/staff/detail/StaffDetailSkeleton";
import SaleCsTeamMemberInfoDialog from "@/components/staff/sale-cs-team/SaleCsTeamMemberInfoDialog";
import SaleCsTeamSaleAllowancesSection from "@/components/staff/sale-cs-team/SaleCsTeamSaleAllowancesSection";
import SaleCsTeamWorkCard, {
  SALE_ALLOWANCES_ANCHOR,
} from "@/components/staff/sale-cs-team/SaleCsTeamWorkCard";
import TrainingTutorClassesCard from "@/components/staff/tutors/TrainingTutorClassesCard";
import TrainingTutorInfoDialog from "@/components/staff/tutors/TrainingTutorInfoDialog";
import TrainingTutorSessionsCard from "@/components/staff/tutors/TrainingTutorSessionsCard";
import { Badge } from "@/components/ui/badge";
import {
  getSaleCsTeamMember,
  saleCsTeamKeys,
  updateSaleCsTeamAccountHandle,
} from "@/lib/apis/sale-cs-team.api";
import {
  getTrainingTutor,
  trainingTutorKeys,
  updateTrainingTutorAccountHandle,
} from "@/lib/apis/training-tutor.api";
import { getDefaultMonthKey } from "@/lib/month-format";
import { formatCustomerCarePercent } from "@/lib/sale-cs-team";
import { hasSaleCsHeadAccess } from "@/lib/sale-cs-head-access";
import { hasTrainingAccess } from "@/lib/training-access";

const PAGE_CLASS =
  "flex min-h-0 flex-1 flex-col gap-4 bg-bg-primary p-4 pb-8 sm:p-6";

/**
 * Hồ sơ nhân sự `/staff/staffs/:id` cho các trưởng (không phải Admin / Kế toán
 * chi — hai nhóm đó thấy trang admin đầy đủ). Bố cục theo `/admin/staffs/:id`,
 * dữ liệu lấy từ API theo phạm vi từng trưởng (backend lọc quyền, #270):
 * - Trưởng phòng Sale & CSKH: thành viên đội Sale/CSKH (`/sale-cs-team`);
 * - Ban Đào Tạo: gia sư, Trưởng ban thêm Ban Chuyên môn / Đào tạo
 *   (`/training/tutors`).
 * Không email, SĐT, CCCD, ngân hàng, thu nhập, lương cứng, thuế, thanh toán.
 * Bấm avatar / tên mở «Thông tin nhân sự» khi có quyền chỉnh.
 */
export default function HeadStaffDetailPage({
  staffId,
  viewerRoles,
}: {
  staffId: string;
  viewerRoles: readonly string[];
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [accountHandleOpen, setAccountHandleOpen] = useState(false);
  const [month, setMonth] = useState(getDefaultMonthKey);
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);
  const viewerIsSaleHead = hasSaleCsHeadAccess(viewerRoles);
  const viewerIsTraining = hasTrainingAccess(viewerRoles);
  const viewerIsTrainingHead = viewerRoles.includes("training_head");

  // Nhân sự ngoài phạm vi → backend trả 404; không retry, không toast.
  const saleQuery = useQuery({
    queryKey: saleCsTeamKeys.detail(staffId),
    queryFn: () => getSaleCsTeamMember(staffId),
    enabled: Boolean(staffId) && viewerIsSaleHead,
    retry: false,
  });
  const trainingQuery = useQuery({
    queryKey: trainingTutorKeys.detail(staffId),
    queryFn: () => getTrainingTutor(staffId),
    enabled: Boolean(staffId) && viewerIsTraining,
    retry: false,
  });

  const member = saleQuery.data;
  const tutor = trainingQuery.data;
  const isLoading = saleQuery.isLoading || trainingQuery.isLoading;
  const backLink = member ? (
    <StaffDetailBackLink
      href="/staff/staffs"
      label="Quay lại danh sách nhân sự"
    />
  ) : viewerIsTraining ? (
    <StaffDetailBackLink
      href="/staff/staffs"
      label={viewerIsTrainingHead ? "Danh sách nhân sự" : "Danh sách gia sư"}
    />
  ) : (
    <StaffDetailBackLink
      href="/staff/staffs"
      label="Quay lại danh sách nhân sự"
    />
  );

  if (isLoading || (!member && !tutor)) {
    return (
      <div className={PAGE_CLASS}>
        {backLink}
        {isLoading ? (
          <StaffDetailSkeleton />
        ) : (
          <p className="py-10 text-center text-sm text-text-muted">
            Không tìm thấy nhân sự trong phạm vi bạn quản lý.
          </p>
        )}
      </div>
    );
  }

  const roles = Array.from(
    new Set([
      ...(member?.roles ?? []),
      ...(viewerIsTrainingHead && tutor ? tutor.roles : []),
    ]),
  );
  const isSale = Boolean(member?.roles.includes("sale"));
  const isCustomerCare = Boolean(member?.roles.includes("customer_care"));
  const trainingManagement = tutor?.management?.isSubordinate
    ? tutor.management
    : undefined;
  // Ưu tiên dữ liệu đào tạo cho avatar: dialog đào tạo đổi được ảnh và chỉ
  // làm mới cache `/training/tutors`.
  const avatarUrl = tutor?.avatarUrl ?? member?.avatarUrl ?? null;
  const accountLocked =
    member?.accountLocked ?? trainingManagement?.accountLocked ?? null;
  const bonusSource = member
    ? "saleCsTeam"
    : tutor?.management?.permissions.canViewBonuses
      ? "training"
      : null;
  const hasMonthlySection = Boolean(member) || bonusSource != null;
  const canOpenInfo = Boolean(member) || Boolean(trainingManagement);
  // 16/11: đổi tên đăng nhập — cùng phạm vi khoá tài khoản; ưu tiên route
  // Sale & CSKH nếu người xem là Trưởng phòng và nhân sự thuộc đội.
  const accountHandle =
    member?.accountHandle ?? trainingManagement?.accountHandle ?? null;
  const accountHandleEditor = member?.permissions.canEditAccountHandle
    ? {
        mutationFn: (value: string) =>
          updateSaleCsTeamAccountHandle(staffId, { accountHandle: value }),
        invalidateKeys: [saleCsTeamKeys.all],
      }
    : trainingManagement?.permissions.canEditAccountHandle
      ? {
          mutationFn: (value: string) =>
            updateTrainingTutorAccountHandle(staffId, { accountHandle: value }),
          invalidateKeys: [trainingTutorKeys.all],
        }
      : null;
  const workCard = member ? (
    <SaleCsTeamWorkCard member={member} month={month} />
  ) : null;
  const classesCard = tutor ? (
    <TrainingTutorClassesCard
      currentClasses={tutor.currentClasses}
      pastClasses={tutor.pastClasses}
      linkable={viewerIsTrainingHead}
    />
  ) : null;
  // Ô trái lưới hai cột: «Lớp phụ trách» (như admin) hoặc «Công việc» nếu chỉ
  // có dữ liệu Sale & CSKH; còn lại xuống dòng riêng.
  const gridLeft = classesCard ?? workCard;

  return (
    <div className={PAGE_CLASS}>
      {backLink}

      <StaffDetailHero
        fullName={member?.fullName ?? tutor?.fullName ?? ""}
        avatarUrl={avatarUrl}
        status={tutor?.status ?? member?.status ?? "active"}
        roles={roles.length > 0 ? roles : undefined}
        onIdentityClick={canOpenInfo ? () => setShowInfo(true) : undefined}
        badges={
          accountLocked ? (
            <Badge variant="destructive">Đã khoá tài khoản</Badge>
          ) : null
        }
        meta={
          member && isCustomerCare ? (
            <>
              % mặc định CSKH:{" "}
              <span className="font-medium text-text-primary">
                {formatCustomerCarePercent(
                  member.customerCareDefaultProfitPercent,
                )}
              </span>
            </>
          ) : null
        }
      />

      <StaffIdentityOverview
        staffId={staffId}
        achievementMode={tutor ? "training" : "saleCsTeam"}
        accountHandle={accountHandle}
        onEditAccountHandle={
          accountHandleEditor ? () => setAccountHandleOpen(true) : undefined
        }
        birthDateLabel="—"
        province={member?.province?.trim() || "—"}
        university={tutor?.university ?? member?.university}
        highSchool={tutor?.highSchool ?? member?.highSchool}
        googleMeetLink={
          member?.googleMeetLink ?? trainingManagement?.googleMeetLink
        }
        allowQrEdit={false}
        // Ban Đào Tạo sửa được thành tích (trang này đã chuyển hướng khi xem
        // chính mình); Trưởng phòng Sale & CSKH sửa được nhân sự dưới cấp
        // (thành viên đội, không phải Admin / trưởng) theo cờ từ API.
        allowAchievementEdit={
          tutor ? true : Boolean(member?.permissions.canEditAchievements)
        }
        showPersonalInfo={false}
        showBankInfo={false}
      />

      {hasMonthlySection ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-primary">
            Công việc & thưởng
          </h2>
          <MonthNav
            value={month}
            onChange={setMonth}
            monthPopupOpen={monthPopupOpen}
            setMonthPopupOpen={setMonthPopupOpen}
          />
        </div>
      ) : null}

      {gridLeft || bonusSource ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {gridLeft}
          {bonusSource ? (
            <StaffBonusViewCard
              source={bonusSource}
              staffId={staffId}
              month={month}
            />
          ) : null}
        </div>
      ) : null}

      {classesCard ? workCard : null}

      {isSale ? (
        <SaleCsTeamSaleAllowancesSection
          staffId={staffId}
          month={month}
          anchorId={SALE_ALLOWANCES_ANCHOR}
        />
      ) : null}

      {tutor ? (
        <TrainingTutorSessionsCard
          staffId={staffId}
          total={tutor.taughtSessionCount}
        />
      ) : null}

      {showInfo && member ? (
        <SaleCsTeamMemberInfoDialog
          member={member}
          onClose={() => setShowInfo(false)}
        />
      ) : null}
      {accountHandleEditor ? (
        <SetAccountHandleDialog
          displayName={member?.fullName ?? tutor?.fullName ?? "Nhân sự"}
          currentHandle={accountHandle}
          open={accountHandleOpen}
          onClose={() => setAccountHandleOpen(false)}
          mutationFn={accountHandleEditor.mutationFn}
          invalidateKeys={accountHandleEditor.invalidateKeys}
        />
      ) : null}
      {showInfo && !member && tutor && trainingManagement ? (
        <TrainingTutorInfoDialog
          tutor={{ ...tutor, management: trainingManagement }}
          onClose={() => setShowInfo(false)}
        />
      ) : null}
    </div>
  );
}
