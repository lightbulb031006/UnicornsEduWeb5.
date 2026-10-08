"use client";

import Link from "next/link";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { Search } from "lucide-react";
import StaffAchievementsDialog, {
  StaffAchievementsButton,
} from "@/components/shared/achievement/StaffAchievementsDialog";
import TutorContactLines from "@/components/staff/tutors/TutorContactLines";
import TutorIdentity from "@/components/staff/tutors/TutorIdentity";
import TutorPager from "@/components/staff/tutors/TutorPager";
import { Skeleton } from "@/components/ui/skeleton";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { useQueryErrorToast } from "@/hooks/use-query-error-toast";
import type { StaffStatus } from "@/dtos/staff.dto";
import type { TrainingTutorSummary } from "@/dtos/training-tutor.dto";
import {
  listTrainingTutors,
  trainingTutorKeys,
} from "@/lib/apis/training-tutor.api";

const PAGE_SIZE = 20;
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
    useState<TrainingTutorSummary | null>(null);

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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : tutors.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-muted">
          {isError ? "Chưa có dữ liệu gia sư." : "Không có gia sư phù hợp."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tutors.map((tutor) => (
            <li
              key={tutor.id}
              className="flex flex-col gap-2 rounded-xl border border-border-default bg-bg-surface p-3"
            >
              <Link
                href={`/staff/tutors/${encodeURIComponent(tutor.id)}`}
                className="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <TutorIdentity tutor={tutor} />
              </Link>
              <TutorContactLines tutor={tutor} />
              <StaffAchievementsButton
                count={tutor.achievementCount}
                onOpen={() => setAchievementsTarget(tutor)}
                className="self-start"
              />
            </li>
          ))}
        </ul>
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
