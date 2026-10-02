"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getMyClassDetail } from "@/lib/apis/student-class.api";
import { Skeleton } from "@/components/ui/skeleton";
import StudentClassTimelineList from "@/components/student/StudentClassTimelineList";

export default function StudentClassDetailPage() {
  const params = useParams();
  const classId = params.id as string;

  const { data: classDetail, isLoading: classDetailLoading } = useQuery({
    queryKey: ["student-class-detail", classId],
    queryFn: () => getMyClassDetail(classId),
    staleTime: 60_000,
  });

  const header = (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-text-muted">
        <Link
          href="/student"
          className="inline-flex items-center gap-1 font-medium text-text-muted transition-colors hover:text-primary"
        >
          <ChevronLeft className="size-4" />
          Danh sách lớp học
        </Link>
      </div>

      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        {classDetailLoading ? (
          <Skeleton className="h-8 w-64" />
        ) : (
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">
                {classDetail?.class?.name || "Chi tiết lớp học"}
              </h1>
              {classDetail?.class?.course?.name && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {classDetail.class.course.name}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-text-muted sm:text-sm">
              {classDetail?.class?.status === "running"
                ? "Lớp đang mở"
                : "Lớp đã kết thúc"}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  return <StudentClassTimelineList classId={classId} header={header} />;
}
