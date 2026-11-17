"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import StaffCard from "@/components/admin/staff/StaffCard";
import TutorPager from "@/components/staff/tutors/TutorPager";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryErrorToast } from "@/hooks/use-query-error-toast";
import {
  listTrainingTutorSessions,
  trainingTutorKeys,
} from "@/lib/apis/training-tutor.api";
import {
  formatTutorSessionDate,
  formatTutorSessionTimeRange,
} from "@/lib/training-tutor";

const SESSION_PAGE_SIZE = 20;

/** «Lịch sử buổi học» của gia sư (ngày, giờ, lớp — không có tiền, #270). */
export default function TrainingTutorSessionsCard({
  staffId,
  total,
}: {
  staffId: string;
  total: number;
}) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useQuery({
    queryKey: trainingTutorKeys.sessions(staffId, page),
    queryFn: () => listTrainingTutorSessions(staffId, page, SESSION_PAGE_SIZE),
    placeholderData: keepPreviousData,
  });
  useQueryErrorToast(isError, "Không tải được buổi dạy.");
  const sessions = data?.data ?? [];

  return (
    <StaffCard title={`Lịch sử buổi học (${total})`}>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-text-muted">Chưa có buổi dạy.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="font-medium text-text-primary sm:w-28">
                {formatTutorSessionDate(session.date)}
              </span>
              <span className="text-text-muted sm:w-32">
                {formatTutorSessionTimeRange(
                  session.startTime,
                  session.endTime,
                )}
              </span>
              <span className="min-w-0 truncate text-text-secondary">
                {session.class.name}
              </span>
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
    </StaffCard>
  );
}
