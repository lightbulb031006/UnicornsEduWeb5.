"use client";

import { useId, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDebounce } from "use-debounce";
import { ChevronRight, Search } from "lucide-react";
import TutorPager from "@/components/staff/tutors/TutorPager";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { TrainingRoleCandidate } from "@/dtos/training-tutor.dto";
import { useQueryErrorToast } from "@/hooks/use-query-error-toast";
import {
  listTrainingRoleCandidates,
  trainingTutorKeys,
} from "@/lib/apis/training-tutor.api";
import { formatStaffRoleLabels } from "@/lib/training-head-roles";
import { ROLE_LABELS } from "@/lib/staff.constants";

const PAGE_SIZE = 20;

type Props = {
  onPick: (candidate: TrainingRoleCandidate) => void;
  onClose: () => void;
};

/**
 * Trưởng ban Đào tạo chọn nhân sự thường ngoài ba nhóm (vd CSKH thuần) để bật
 * role gia sư / Ban Chuyên môn / Đào Tạo (follow-up 13/11 mục 2.2). Backend lọc
 * ứng viên và chỉ trả họ tên + role hiện có.
 */
export default function TrainingRoleCandidatePicker({
  onPick,
  onClose,
}: Props) {
  const titleId = useId();
  const descId = useId();
  const [searchInput, setSearchInput] = useState("");
  const [search] = useDebounce(searchInput.trim(), 300);
  const [page, setPage] = useState(1);
  const params = { page, limit: PAGE_SIZE, search };
  const { data, isLoading, isError } = useQuery({
    queryKey: trainingTutorKeys.roleCandidates(params),
    queryFn: () => listTrainingRoleCandidates(params),
    placeholderData: keepPreviousData,
  });
  useQueryErrorToast(isError, "Không tải được danh sách nhân sự.");
  const candidates = data?.data ?? [];

  return (
    <ResponsiveDialog
      size="md"
      labelledBy={titleId}
      describedBy={descId}
      onBackdropClick={onClose}
    >
      <div className="border-b border-border-default px-4 py-3 sm:px-5">
        <h2 id={titleId} className="text-base font-semibold text-text-primary">
          Bật role cho nhân sự khác
        </h2>
        <p id={descId} className="mt-1 text-sm text-text-secondary">
          Nhân sự đang hoạt động, chưa thuộc Gia sư / Ban Chuyên môn / Đào Tạo.
          Chọn một người để bật role.
        </p>
      </div>
      <ResponsiveDialogBody>
        <label className="flex min-h-10 items-center gap-2 rounded-md border border-border-default bg-bg-surface px-3 focus-within:ring-2 focus-within:ring-border-focus">
          <Search className="size-4 shrink-0 text-text-muted" aria-hidden />
          <span className="sr-only">Tìm nhân sự</span>
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

        <ul className="mt-3 divide-y divide-border-subtle">
          {isLoading
            ? Array.from({ length: 4 }, (_, index) => (
                <li key={index} className="py-3">
                  <Skeleton className="h-10 w-full" />
                </li>
              ))
            : candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => onPick(candidate)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-text-primary wrap-anywhere">
                        {candidate.fullName.trim() || "Nhân sự"}
                      </span>
                      <span className="block text-xs text-text-muted wrap-anywhere">
                        {formatStaffRoleLabels(candidate.roles, ROLE_LABELS) ||
                          "Chưa có role"}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-text-muted"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
        </ul>
        {!isLoading && candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            Không có nhân sự phù hợp.
          </p>
        ) : null}
        <TutorPager
          page={page}
          total={data?.meta.total ?? 0}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      </ResponsiveDialogBody>
    </ResponsiveDialog>
  );
}
