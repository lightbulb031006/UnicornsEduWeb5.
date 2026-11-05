"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { Search } from "lucide-react";
import StaffAchievementsDialog, {
  StaffAchievementsButton,
} from "@/components/shared/achievement/StaffAchievementsDialog";
import TutorClassChips from "@/components/staff/tutors/TutorClassChips";
import TutorIdentity from "@/components/staff/tutors/TutorIdentity";
import TutorPager from "@/components/staff/tutors/TutorPager";
import TutorStatusBadge from "@/components/staff/tutors/TutorStatusBadge";
import UserAvatar from "@/components/ui/UserAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { useQueryErrorToast } from "@/hooks/use-query-error-toast";
import { useRowLink } from "@/hooks/use-row-link";
import { ROW_LINK_INTERACTION_CLASS } from "@/lib/row-link";
import type { StaffStatus } from "@/dtos/staff.dto";
import type { TrainingTutorListItem } from "@/dtos/training-tutor.dto";
import {
  listTrainingTutors,
  trainingTutorKeys,
} from "@/lib/apis/training-tutor.api";
import { pickAvatarUrl } from "@/lib/avatar";

const PAGE_SIZE = 20;
const TH_CLASS =
  "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary";
const tutorHref = (id: string) => `/staff/tutors/${encodeURIComponent(id)}`;
const tutorLabel = (tutor: TrainingTutorListItem) =>
  `Xem hồ sơ ${tutor.fullName.trim() || "gia sư"}`;
const STATUS_OPTIONS = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "active", label: "Hoạt động" },
  { value: "inactive", label: "Ngừng hoạt động" },
];

export default function StaffTutorsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search] = useDebounce(searchInput.trim(), 300);
  const [status, setStatus] = useState<"" | StaffStatus>("");
  const [page, setPage] = useState(1);
  const [achievementsTarget, setAchievementsTarget] =
    useState<TrainingTutorListItem | null>(null);
  const rowLink = useRowLink();

  const params = { page, limit: PAGE_SIZE, search, status };
  const { data, isLoading, isError } = useQuery({
    queryKey: trainingTutorKeys.list(params),
    queryFn: () => listTrainingTutors(params),
    placeholderData: keepPreviousData,
  });
  const tutors = data?.data ?? [];
  useQueryErrorToast(isError, "Không tải được danh sách gia sư.");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 bg-bg-primary p-4 pb-8 sm:p-6">
      <header>
        <h1 className="text-xl font-semibold text-text-primary">Gia sư</h1>
        <p className="text-sm text-text-muted">
          Hồ sơ gia sư cho Ban Đào Tạo, gồm cả gia sư đã ngừng hoạt động.
        </p>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex min-h-10 flex-1 items-center gap-2 rounded-md border border-border-default bg-bg-surface px-3 focus-within:ring-2 focus-within:ring-border-focus">
          <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
          <span className="sr-only">Tìm gia sư</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
            placeholder="Theo tên…"
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          />
        </label>
        <div className="sm:w-56">
          <UpgradedSelect
            name="tutor-filter-status"
            ariaLabel="Lọc trạng thái"
            value={status}
            options={STATUS_OPTIONS}
            onValueChange={(next) => {
              setStatus(next as "" | StaffStatus);
              setPage(1);
            }}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : tutors.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-muted">
          {isError ? "Chưa có dữ liệu gia sư." : "Không có gia sư phù hợp."}
        </p>
      ) : (
        <>
          <ul className="space-y-3 md:hidden" aria-label="Danh sách gia sư">
            {tutors.map((tutor) => (
              <li
                key={tutor.id}
                {...rowLink(tutorHref(tutor.id), tutorLabel(tutor))}
                className={`flex flex-col gap-3 rounded-xl border border-border-default bg-bg-surface p-4 ${ROW_LINK_INTERACTION_CLASS}`}
              >
                <TutorIdentity tutor={tutor} />
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-text-muted">
                    Lớp đang dạy
                  </span>
                  <TutorClassChips classes={tutor.currentClasses} />
                </div>
                <StaffAchievementsButton
                  count={tutor.achievementCount}
                  onOpen={() => setAchievementsTarget(tutor)}
                  className="self-start"
                />
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-xl border border-border-default bg-bg-surface md:block">
            <table className="w-full min-w-[720px] table-fixed border-collapse text-left text-sm">
              <caption className="sr-only">Danh sách gia sư</caption>
              <thead>
                <tr className="border-b border-border-default bg-bg-secondary/80">
                  <th scope="col" className="w-16 px-3 py-3">
                    <span className="sr-only">Ảnh đại diện</span>
                  </th>
                  <th scope="col" className={`w-[32%] ${TH_CLASS}`}>
                    Tên
                  </th>
                  <th scope="col" className={TH_CLASS}>
                    Lớp đang dạy
                  </th>
                  <th scope="col" className={`w-40 ${TH_CLASS}`}>
                    Thành tích
                  </th>
                </tr>
              </thead>
              <tbody>
                {tutors.map((tutor) => {
                  const name = tutor.fullName.trim() || "Gia sư";
                  return (
                    <tr
                      key={tutor.id}
                      {...rowLink(tutorHref(tutor.id), tutorLabel(tutor))}
                      className={`border-b border-border-default last:border-b-0 ${ROW_LINK_INTERACTION_CLASS}`}
                    >
                      <td className="px-3 py-3 align-top">
                        <UserAvatar
                          src={pickAvatarUrl(tutor.avatarUrl)}
                          fallback={name.charAt(0).toUpperCase()}
                          alt={name}
                          className="size-10 bg-bg-tertiary text-sm font-semibold text-text-primary"
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium wrap-anywhere text-text-primary">
                          {name}
                        </p>
                        <div className="mt-1">
                          <TutorStatusBadge status={tutor.status} />
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <TutorClassChips classes={tutor.currentClasses} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <StaffAchievementsButton
                          count={tutor.achievementCount}
                          onOpen={() => setAchievementsTarget(tutor)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {data ? (
        <TutorPager
          page={page}
          total={data.meta.total}
          limit={data.meta.limit}
          onPageChange={setPage}
        />
      ) : null}

      {achievementsTarget ? (
        <StaffAchievementsDialog
          mode="training"
          staffId={achievementsTarget.id}
          staffName={achievementsTarget.fullName}
          onClose={() => setAchievementsTarget(null)}
        />
      ) : null}
    </div>
  );
}
