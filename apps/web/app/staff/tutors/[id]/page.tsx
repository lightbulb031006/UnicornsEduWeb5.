"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import StaffAchievementsDialog, {
  StaffAchievementsButton,
} from "@/components/shared/achievement/StaffAchievementsDialog";
import TutorContactLines from "@/components/staff/tutors/TutorContactLines";
import TutorIdentity from "@/components/staff/tutors/TutorIdentity";
import TutorPager from "@/components/staff/tutors/TutorPager";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryErrorToast } from "@/hooks/use-query-error-toast";
import type { TrainingTutorClass } from "@/dtos/training-tutor.dto";
import {
  getTrainingTutor,
  listTrainingTutorSessions,
  trainingTutorKeys,
} from "@/lib/apis/training-tutor.api";
import {
  formatTutorSessionDate,
  formatTutorSessionTimeRange,
} from "@/lib/training-tutor";

const SESSION_PAGE_SIZE = 20;

export default function StaffTutorDetailPage() {
  const params = useParams<{ id: string }>();
  const tutorId = decodeURIComponent(params.id ?? "");
  const [showAchievements, setShowAchievements] = useState(false);

  const {
    data: tutor,
    isLoading,
    isError,
  } = useQuery({
    queryKey: trainingTutorKeys.detail(tutorId),
    queryFn: () => getTrainingTutor(tutorId),
    enabled: Boolean(tutorId),
  });
  useQueryErrorToast(isError, "Không tải được hồ sơ gia sư.");

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 bg-bg-primary p-4 pb-8 sm:p-6">
      <Link
        href="/staff/tutors"
        className="inline-flex min-h-10 items-center gap-1.5 self-start text-sm text-text-muted hover:text-text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Danh sách gia sư
      </Link>

      {isLoading ? (
        <Skeleton className="h-36 w-full rounded-xl" />
      ) : isError || !tutor ? (
        <p className="py-10 text-center text-sm text-text-muted">
          Chưa có dữ liệu hồ sơ.
        </p>
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-xl border border-border-default bg-bg-surface p-4">
            <TutorIdentity tutor={tutor} size="lg" />
            <TutorContactLines tutor={tutor} />
            <StaffAchievementsButton
              count={tutor.achievementCount}
              onOpen={() => setShowAchievements(true)}
              className="self-start"
            />
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <TutorClassList
              title="Lớp đang dạy"
              classes={tutor.currentClasses}
            />
            <TutorClassList title="Lớp đã dạy" classes={tutor.pastClasses} />
          </div>

          <TutorSessionHistory
            tutorId={tutor.id}
            total={tutor.taughtSessionCount}
          />

          {showAchievements ? (
            <StaffAchievementsDialog
              mode="training"
              staffId={tutor.id}
              staffName={tutor.fullName}
              onClose={() => setShowAchievements(false)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function TutorClassList({
  title,
  classes,
}: {
  title: string;
  classes: TrainingTutorClass[];
}) {
  return (
    <section className="rounded-xl border border-border-default bg-bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold text-text-primary">
        {title} ({classes.length})
      </h2>
      {classes.length === 0 ? (
        <p className="text-sm text-text-muted">Chưa có lớp.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {classes.map((item) => (
            <li
              key={item.id}
              className="rounded-full bg-bg-secondary px-3 py-1 text-xs text-text-primary"
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TutorSessionHistory({
  tutorId,
  total,
}: {
  tutorId: string;
  total: number;
}) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useQuery({
    queryKey: trainingTutorKeys.sessions(tutorId, page),
    queryFn: () => listTrainingTutorSessions(tutorId, page, SESSION_PAGE_SIZE),
    placeholderData: keepPreviousData,
  });
  const sessions = data?.data ?? [];
  useQueryErrorToast(isError, "Không tải được buổi dạy.");

  return (
    <section className="rounded-xl border border-border-default bg-bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold text-text-primary">
        Buổi đã dạy ({total})
      </h2>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-text-muted">Chưa có buổi dạy.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:items-center sm:gap-4"
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
    </section>
  );
}
