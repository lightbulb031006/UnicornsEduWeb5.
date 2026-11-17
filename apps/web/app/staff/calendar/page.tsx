"use client";

import { hasTrainingAccess } from "@/lib/training-access";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as staffCalendarApi from "@/lib/apis/staff-calendar.api";
import { staffCalendarKeys } from "@/lib/query-keys";
import { useAuth } from "@/context/AuthContext";
import { selectRandomCheckEvent } from "@/lib/staff-calendar-random";
import {
  CalendarWeekVariant,
  ClassScheduleEvent,
  ClassScheduleFilter,
} from "@/dtos/class-schedule.dto";
import CalendarView from "@/app/admin/calendar/components/CalendarView";
import EventPopup from "@/app/admin/calendar/components/EventPopup";
import StaffCalendarFilterBar from "./components/StaffCalendarFilterBar";
import CalendarScheduleList from "@/app/admin/calendar/components/CalendarScheduleList";
import CalendarLoadingSkeleton from "@/app/admin/calendar/components/CalendarLoadingSkeleton";

type CalendarFilterState = {
  classIds: string[];
};
type CalendarViewMode = "calendar" | "schedule";

type CurrentWeekRange = {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  label: string;
};

const WEEK_LABEL_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatWeekLabel = (start: Date, end: Date, weekVariant: CalendarWeekVariant): string => {
  const prefix = weekVariant === "next" ? "Tuần sau" : "Tuần này";
  return `${prefix}: CN ${WEEK_LABEL_FORMATTER.format(start)} - T7 ${WEEK_LABEL_FORMATTER.format(end)}`;
};

const getWeekRange = (
  weekVariant: CalendarWeekVariant,
  today: Date = new Date(),
): CurrentWeekRange => {
  const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  if (weekVariant === "next") {
    start.setDate(start.getDate() + 7);
  }

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start,
    end,
    startDate: formatLocalDate(start),
    endDate: formatLocalDate(end),
    label: formatWeekLabel(start, end, weekVariant),
  };
};

export default function StaffCalendarPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isTraining = hasTrainingAccess(user.staffRoles);

  const [filters, setFilters] = useState<CalendarFilterState>({ classIds: [] });
  const [viewMode, setViewMode] = useState<CalendarViewMode>("calendar");
  const [weekVariant, setWeekVariant] = useState<CalendarWeekVariant>("current");
  const weekRange = useMemo(() => getWeekRange(weekVariant), [weekVariant]);
  const queryFilters = useMemo<ClassScheduleFilter>(
    () => ({
      startDate: weekRange.startDate,
      endDate: weekRange.endDate,
    }),
    [weekRange],
  );

  const [selectedEvent, setSelectedEvent] = useState<ClassScheduleEvent | null>(null);

  useEffect(() => {
    const handleInvalidate = () => {
      queryClient.invalidateQueries({ queryKey: staffCalendarKeys.all });
    };

    window.addEventListener("calendar:refetch", handleInvalidate);

    return () => {
      window.removeEventListener("calendar:refetch", handleInvalidate);
    };
  }, [queryClient]);

  const {
    data: eventsResponse,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<{ data: ClassScheduleEvent[]; total: number }, Error>({
    queryKey: staffCalendarKeys.events({ ...queryFilters }),
    queryFn: () => staffCalendarApi.getStaffCalendarEvents(queryFilters),
    staleTime: 1 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const events = useMemo(() => eventsResponse?.data ?? [], [eventsResponse?.data]);
  const visibleEvents = useMemo(() => {
    if (filters.classIds.length === 0) {
      return events;
    }
    const selectedClassIds = new Set(filters.classIds);
    return events.filter((event) =>
      event.classIds?.some((classId) => selectedClassIds.has(classId)) ??
      selectedClassIds.has(event.classId),
    );
  }, [events, filters.classIds]);

  useEffect(() => {
    if (isError && error) {
      toast.error(error.message || "Không thể tải lịch. Vui lòng thử lại sau.");
    }
  }, [isError, error]);

  const handleFiltersChange = useCallback((newFilters: CalendarFilterState) => {
    setFilters(newFilters);
  }, []);

  const handleEventClick = useCallback((event: ClassScheduleEvent) => {
    setSelectedEvent(event);
  }, []);

  const handleClosePopup = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  const handleRandomCheck = useCallback(() => {
    const selected = selectRandomCheckEvent(visibleEvents);
    if (!selected) {
      toast.info("Không có lớp đang diễn ra có link Meet trong bộ lọc hiện tại.");
      return;
    }

    setSelectedEvent(selected);
  }, [visibleEvents]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-2 sm:p-3 lg:p-5">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-2 shadow-sm sm:p-3 lg:rounded-2xl lg:p-4">
        <section className="mb-2 rounded-lg border border-border-default bg-bg-secondary/40 px-3 py-2.5 sm:mb-3 sm:px-4 sm:py-3">
          <div className="flex flex-wrap items-end justify-between gap-2 gap-y-1">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/85">
                {isTraining ? "Lịch lớp" : "Lịch Cá Nhân"}
              </p>
              <h1 className="mt-0.5 text-lg font-semibold leading-tight text-text-primary sm:text-xl">
                {isTraining ? "Lịch Toàn Bộ Lớp" : "Lịch Dạy Và Lịch Thi"}
              </h1>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isTraining ? (
                <button
                  type="button"
                  onClick={handleRandomCheck}
                  disabled={isLoading || visibleEvents.length === 0}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-primary/25 bg-primary px-3 py-1.5 text-xs font-semibold text-text-inverse shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <ArrowsRightLeftIcon className="size-4" aria-hidden />
                  Kiểm tra ngẫu nhiên
                </button>
              ) : null}
              <p
                className="max-w-md text-right text-[11px] leading-snug text-text-muted sm:text-left sm:text-xs"
                title={
                  isTraining
                    ? "Lịch toàn bộ lớp đang chạy, gồm lịch cố định, lịch bù và lịch thi."
                    : "Lịch các lớp bạn phụ trách, gồm lịch dạy, buổi bù và lịch thi của học sinh."
                }
              >
                {isTraining
                  ? "Tuần hiện tại · toàn bộ lớp · có lịch thi"
                  : "Tuần hiện tại · lớp bạn phụ trách · có lịch thi"}
              </p>
            </div>
          </div>
        </section>

        <section className="mb-2 sm:mb-3">
          <StaffCalendarFilterBar
            filters={filters}
            viewMode={viewMode}
            weekVariant={weekVariant}
            weekLabel={weekRange.label}
            onFiltersChange={handleFiltersChange}
            onViewModeChange={setViewMode}
            onWeekVariantChange={setWeekVariant}
          />
        </section>

        <section className="min-w-0 flex-1 overflow-hidden px-0.5 py-1">
          {isLoading ? (
            <CalendarLoadingSkeleton viewMode={viewMode} />
          ) : isError ? (
            <div
              className="py-16 text-center text-error"
              role="alert"
              aria-live="assertive"
            >
              <p className="text-sm">
                {(error as { response?: { data?: { message?: string } } })?.response?.data
                  ?.message ??
                  (error as Error)?.message ??
                  "Không tải được dữ liệu lịch."}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-bg-secondary focus:outline-none focus:ring-2 focus:ring-border-focus"
              >
                <svg
                  className="size-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Thử lại
              </button>
            </div>
          ) : visibleEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted">
              <svg
                className="size-12 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm">
                {filters.classIds.length > 0
                  ? "Không có lịch học nào phù hợp với bộ lọc."
                  : weekVariant === "next"
                    ? "Chưa có lịch học nào trong tuần sau."
                    : "Chưa có lịch học nào trong tuần này."}
              </p>
            </div>
          ) : (
            <>
              {viewMode === "calendar" ? (
                <CalendarView
                  events={visibleEvents}
                  onEventClick={handleEventClick}
                  weekStart={weekRange.start}
                  weekEnd={weekRange.end}
                />
              ) : (
                <CalendarScheduleList
                  events={visibleEvents}
                  onEventClick={handleEventClick}
                />
              )}
            </>
          )}
        </section>
      </div>

      {selectedEvent && (
        <EventPopup
          event={selectedEvent}
          onClose={handleClosePopup}
        />
      )}
    </div>
  );
}
