"use client";

import HeadCreateStaffButton from "@/components/staff/HeadCreateStaffButton";

/**
 * `/staff/staffs` cho Trưởng ban Chuyên môn (14/11): chưa có danh sách nhân sự
 * riêng — trang chỉ để tạo hồ sơ nhân sự mới (mọi role trừ Admin / role trưởng).
 */
export default function LessonPlanHeadStaffPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <section className="rounded-xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
              Nhân sự
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Tạo hồ sơ nhân sự cho user đã có tài khoản. Được gán mọi role trừ
              Admin và role trưởng; mức % thu nhập do Admin đặt sau.
            </p>
          </div>
          <HeadCreateStaffButton />
        </div>
      </section>
    </div>
  );
}
