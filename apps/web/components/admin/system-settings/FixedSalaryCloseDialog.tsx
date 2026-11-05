"use client";

import { useId, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import type {
  CloseFixedSalaryMonthResponse,
  FixedSalaryCloseCandidate,
} from "@/dtos/fixed-salary-settings.dto";
import * as fixedSalarySettingsApi from "@/lib/apis/fixed-salary-settings.api";
import {
  filterFixedSalaryCloseCandidates,
  fixedSalaryInputClassName,
  formatFixedSalaryVnd,
  getFixedSalaryApiErrorMessage,
  getUnclosedFixedSalaryStaffIds,
  isFixedSalaryCandidateFullyClosed,
} from "@/lib/fixed-salary-settings.helpers";
import { ROLE_LABELS } from "@/lib/staff.constants";
import { cn } from "@/lib/utils";

export const FIXED_SALARY_CLOSE_CANDIDATES_QUERY_KEY = [
  "fixed-salary-settings",
  "close-candidates",
] as const;

const PAYABLES_QUERY_KEY = ["fixed-salary-settings", "payables"] as const;

function FixedSalaryCloseCandidateRow({
  candidate,
  expanded,
  onToggle,
  canEdit,
  closing,
  disabled,
  onClose,
}: {
  candidate: FixedSalaryCloseCandidate;
  expanded: boolean;
  onToggle: () => void;
  canEdit: boolean;
  closing: boolean;
  disabled: boolean;
  onClose: () => void;
}) {
  const fullyClosed = isFixedSalaryCandidateFullyClosed(candidate);
  const partiallyClosed = !fullyClosed && candidate.closedRoleCount > 0;
  const rolesId = useId();

  return (
    <li className="rounded-xl border border-border-default bg-bg-secondary/45">
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={rolesId}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 shrink-0 text-text-muted transition-transform",
              expanded && "rotate-180",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-semibold text-text-primary">
              {candidate.staffFullName}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
              <span className="tabular-nums text-text-secondary">
                {formatFixedSalaryVnd(candidate.totalGrossAmount)}
              </span>
              <span>· {candidate.roles.length} role</span>
              {partiallyClosed ? (
                <Badge variant="warning">
                  Đã chốt {candidate.closedRoleCount}/{candidate.roles.length}{" "}
                  role
                </Badge>
              ) : null}
            </span>
          </span>
        </button>
        {fullyClosed ? (
          <Badge variant="success" className="self-start sm:self-center">
            Đã chốt
          </Badge>
        ) : (
          <button
            type="button"
            onClick={onClose}
            disabled={!canEdit || disabled}
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-text-inverse transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 sm:w-auto"
          >
            {closing ? "Đang chốt…" : "Chốt lương"}
          </button>
        )}
      </div>
      {expanded ? (
        <ul
          id={rolesId}
          className="space-y-1.5 border-t border-border-subtle px-3 py-2.5"
        >
          {candidate.roles.map((role) => (
            <li
              key={role.roleType}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm"
            >
              <span className="text-text-primary">
                {ROLE_LABELS[role.roleType] ?? role.roleType}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-text-secondary">
                  {formatFixedSalaryVnd(role.grossAmount)}
                </span>
                <Badge
                  variant={role.status === "closed" ? "success" : "secondary"}
                >
                  {role.status === "closed" ? "Đã chốt" : "Chưa chốt"}
                </Badge>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FixedSalaryCloseDialog({
  canEdit,
  onClose,
  onClosed,
}: {
  canEdit: boolean;
  onClose: () => void;
  onClosed: (result: CloseFixedSalaryMonthResponse) => void;
}) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const [search, setSearch] = useState("");
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);

  const candidatesQuery = useQuery({
    queryKey: FIXED_SALARY_CLOSE_CANDIDATES_QUERY_KEY,
    queryFn: fixedSalarySettingsApi.getFixedSalaryCloseCandidates,
    // Danh sách quyết định sinh khoản tiền: mỗi lần mở dialog lấy số mới,
    // không dùng cache 30s mặc định.
    refetchOnMount: "always",
  });

  const closeMutation = useMutation({
    mutationFn: (variables: { staffIds: string[]; label: string }) =>
      fixedSalarySettingsApi.closeFixedSalaryMonth({
        staffIds: variables.staffIds,
      }),
    onSuccess: async (result, variables) => {
      onClosed(result);
      setConfirmAllOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: FIXED_SALARY_CLOSE_CANDIDATES_QUERY_KEY,
        }),
        queryClient.invalidateQueries({ queryKey: PAYABLES_QUERY_KEY }),
      ]);
      toast.success(
        `Đã chốt lương tháng ${result.month} cho ${variables.label}: sinh ${result.createdCount} khoản.`,
      );
    },
    onError: (error) => {
      toast.error(
        getFixedSalaryApiErrorMessage(error, "Không chốt được lương tháng này."),
      );
    },
  });

  const allCandidates = useMemo(
    () => candidatesQuery.data?.items ?? [],
    [candidatesQuery.data],
  );
  const visibleCandidates = useMemo(
    () => filterFixedSalaryCloseCandidates(allCandidates, search),
    [allCandidates, search],
  );
  const unclosedStaffIds = useMemo(
    () => getUnclosedFixedSalaryStaffIds(allCandidates),
    [allCandidates],
  );
  const month = candidatesQuery.data?.month ?? "này";
  const pendingStaffIds = closeMutation.isPending
    ? closeMutation.variables?.staffIds ?? []
    : [];

  const requestClose = () => {
    if (closeMutation.isPending) return;
    onClose();
  };

  return (
    <ResponsiveDialog
      size="2xl"
      labelledBy={titleId}
      onBackdropClick={requestClose}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-4 sm:p-5">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-base font-semibold text-text-primary sm:text-lg"
          >
            Chốt lương tháng {month}
          </h2>
          <p className="mt-1 text-xs text-text-secondary sm:text-sm">
            Chốt từng người: chỉ sinh khoản cho role chưa chốt, khoản đã chốt
            giữ nguyên số. Ngày 28 hệ thống tự chốt nốt người còn lại.
          </p>
        </div>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Đóng"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-bg-secondary sm:size-9"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <div className="border-b border-border-subtle p-4 sm:px-5 sm:py-3">
        <label className="relative block">
          <span className="sr-only">Tìm theo tên nhân sự</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo tên…"
            className={cn(fixedSalaryInputClassName, "pl-9")}
          />
        </label>
      </div>

      <ResponsiveDialogBody>
        {candidatesQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-16 animate-pulse rounded-xl border border-border-default bg-bg-secondary/45"
              />
            ))}
          </div>
        ) : candidatesQuery.isError ? (
          <p className="text-sm text-error" role="alert">
            Không tải được danh sách nhân sự. Đóng lại và thử lần nữa.
          </p>
        ) : allCandidates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-default px-4 py-6 text-sm text-text-muted">
            Không có nhân sự nào có lương cứng tháng này.
          </p>
        ) : visibleCandidates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-default px-4 py-6 text-sm text-text-muted">
            Không tìm thấy nhân sự khớp «{search.trim()}».
          </p>
        ) : (
          <ul className="space-y-2">
            {visibleCandidates.map((candidate) => (
              <FixedSalaryCloseCandidateRow
                key={candidate.staffId}
                candidate={candidate}
                expanded={expandedStaffId === candidate.staffId}
                onToggle={() =>
                  setExpandedStaffId((current) =>
                    current === candidate.staffId ? null : candidate.staffId,
                  )
                }
                canEdit={canEdit}
                closing={
                  pendingStaffIds.length === 1 &&
                  pendingStaffIds[0] === candidate.staffId
                }
                disabled={closeMutation.isPending}
                onClose={() =>
                  closeMutation.mutate({
                    staffIds: [candidate.staffId],
                    label: candidate.staffFullName,
                  })
                }
              />
            ))}
          </ul>
        )}
      </ResponsiveDialogBody>

      <div className="flex flex-col gap-2 border-t border-border-subtle p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <p className="text-xs text-text-muted sm:text-sm">
          {unclosedStaffIds.length} / {allCandidates.length} người chưa chốt đủ
        </p>
        <button
          type="button"
          onClick={() => setConfirmAllOpen(true)}
          disabled={
            !canEdit || closeMutation.isPending || unclosedStaffIds.length === 0
          }
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 sm:w-auto"
        >
          Chốt tất cả người chưa chốt ({unclosedStaffIds.length})
        </button>
      </div>

      <ConfirmDialog
        open={confirmAllOpen}
        onOpenChange={(open) => {
          if (!closeMutation.isPending) setConfirmAllOpen(open);
        }}
        title={`Chốt lương cho ${unclosedStaffIds.length} người?`}
        description="Sinh khoản lương cứng tháng này cho mọi role chưa chốt của những người còn lại. Khoản đã chốt giữ nguyên số."
        confirmLabel="Chốt tất cả"
        confirmPending={closeMutation.isPending}
        onConfirm={() =>
          closeMutation.mutate({
            staffIds: unclosedStaffIds,
            label: `${unclosedStaffIds.length} người`,
          })
        }
      />
    </ResponsiveDialog>
  );
}
