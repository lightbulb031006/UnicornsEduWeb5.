"use client";

import { useMemo } from "react";
import { ClassScheduleEvent } from "@/dtos/class-schedule.dto";
import { cn } from "@/lib/utils";
import {
  getCalendarEventPalette,
  getCalendarEventTypeLabel,
} from "./calendar-event-palette";

type CalendarScheduleListProps = {
  events: ClassScheduleEvent[];
  onEventClick: (event: ClassScheduleEvent) => void;
  /** Khi không có sự kiện nào sau lọc (tuần trống). */
  emptyStateTitle?: string;
  emptyStateDescription?: string;
};

type EventRuntimeStatus = "past" | "ongoing" | "upcoming";

const buildDateFromEvent = (event: ClassScheduleEvent, timeValue?: string) => {
  if (!event.date) return null;
  const time = timeValue ?? "00:00:00";
  const iso = `${event.date}T${time}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getEventRuntimeStatus = (event: ClassScheduleEvent): EventRuntimeStatus => {
  const now = new Date();
  const start = buildDateFromEvent(event, event.allDay ? "00:00:00" : event.startTime);
  const end = buildDateFromEvent(
    event,
    event.allDay ? "23:59:59" : event.endTime ?? event.startTime,
  );

  if (!start || !end) return "upcoming";
  if (end.getTime() <= now.getTime()) return "past";
  if (start.getTime() <= now.getTime() && now.getTime() < end.getTime()) return "ongoing";
  return "upcoming";
};

const getEventRuntimeLabel = (
  event: ClassScheduleEvent,
  runtimeStatus: EventRuntimeStatus,
) => {
  if (event.eventType === "exam") {
    if (runtimeStatus === "ongoing") return "Đang diễn ra";
    if (runtimeStatus === "upcoming") return "Sắp tới";
    return "Đã diễn ra";
  }

  if (runtimeStatus === "ongoing") return "Đang diễn ra";
  if (runtimeStatus === "upcoming") return "Sắp tới";
  return "Đã dạy";
};

const formatTimeRange = (startTime?: string, endTime?: string) => {
  const normalize = (value?: string) => (value ? value.slice(0, 5) : "--:--");
  const start = normalize(startTime);
  const end = normalize(endTime ?? startTime);
  return `${start} - ${end}`;
};

const formatDayHeader = (date: string) => {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(parsed);
};

export default function CalendarScheduleList({
  events,
  onEventClick,
  emptyStateTitle = "Tuần này bạn không có lịch dạy.",
  emptyStateDescription = "Hãy nghỉ ngơi nhé!",
}: CalendarScheduleListProps) {
  const groupedByDay = useMemo(() => {
    const grouped = new Map<string, ClassScheduleEvent[]>();

    for (const event of events) {
      if (!grouped.has(event.date)) {
        grouped.set(event.date, []);
      }
      grouped.get(event.date)?.push(event);
    }

    return Array.from(grouped.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, dayEvents]) => ({
        date,
        events: dayEvents.sort((a, b) => {
          const timeA = a.startTime ?? "";
          const timeB = b.startTime ?? "";
          return timeA.localeCompare(timeB);
        }),
      }));
  }, [events]);

  if (groupedByDay.length === 0) {
    return (
      <div className="flex min-h-[12rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-default bg-bg-secondary/45 px-3 py-8 text-center">
        <p className="text-sm font-semibold text-text-primary">{emptyStateTitle}</p>
        <p className="text-xs text-text-secondary">{emptyStateDescription}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groupedByDay.map((group) => (
        <section
          key={group.date}
          className="overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-sm"
        >
          <header className="border-b border-border-default bg-bg-secondary/60 px-3 py-2">
            <h3 className="text-xs font-semibold capitalize text-text-primary sm:text-sm">
              {formatDayHeader(group.date)}
            </h3>
          </header>

          <div className="divide-y divide-border-default">
            {group.events.map((event) => {
              const palette = getCalendarEventPalette(event);
              const runtimeStatus = getEventRuntimeStatus(event);
              const runtimeLabel = getEventRuntimeLabel(event, runtimeStatus);
              const eventTypeLabel = getCalendarEventTypeLabel(event.eventType);
              const title =
                event.eventType === "exam"
                  ? event.title || event.className || "Lịch thi"
                  : event.className;
              const metaLine =
                event.eventType === "exam"
                  ? event.classNames?.length
                    ? `Lớp: ${event.classNames.join(", ")}`
                    : null
                  : event.teacherNames.length > 0
                    ? event.teacherNames.join(", ")
                    : null;

              return (
                <button
                  key={event.occurrenceId}
                  type="button"
                  onClick={() => onEventClick(event)}
                  className={cn(
                    "group flex w-full items-stretch gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-bg-secondary/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:gap-3 sm:px-3",
                    runtimeStatus === "past" && "opacity-60",
                  )}
                >
                  <div className="min-w-[88px] shrink-0 rounded-lg border border-border-default bg-bg-secondary px-2 py-1.5">
                    <p className="text-xs font-semibold text-text-primary">
                      {event.allDay
                        ? "Cả ngày"
                        : formatTimeRange(event.startTime, event.endTime)}
                    </p>
                  </div>

                  <div
                    className={cn(
                      "min-w-0 flex-1 rounded-xl border border-border-default px-3 py-2.5 shadow-sm",
                      runtimeStatus === "ongoing" &&
                        "animate-pulse ring-2 ring-offset-1 ring-offset-bg-surface",
                    )}
                    style={{
                      borderLeftColor: palette.start,
                      borderLeftWidth: 4,
                      ...(runtimeStatus === "ongoing"
                        ? { boxShadow: `0 0 0 2px ${palette.ring}` }
                        : {}),
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-text-primary">
                          {title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-bg-secondary px-2 py-0.5 text-[11px] font-semibold text-text-secondary">
                            {eventTypeLabel}
                          </span>
                          {metaLine ? (
                            <p className="truncate text-xs text-text-secondary">
                              {metaLine}
                            </p>
                          ) : null}
                          {event.studentNames?.length ? (
                            <p className="break-words text-xs text-text-secondary">
                              Học sinh: {event.studentNames.join(", ")}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          runtimeStatus === "ongoing" &&
                            "bg-success/15 text-success",
                          runtimeStatus === "upcoming" &&
                            "bg-info/15 text-info",
                          runtimeStatus === "past" && "bg-bg-tertiary text-text-secondary",
                        )}
                      >
                        {runtimeLabel}
                      </span>
                    </div>
                    {event.eventType === "exam" ? (
                      event.note ? (
                        <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                          {event.note}
                        </p>
                      ) : (
                        <p className="mt-1 truncate text-xs text-text-secondary">
                          Sự kiện cả ngày trong lịch.
                        </p>
                      )
                    ) : event.meetLink ? (
                      <p className="mt-1 truncate text-xs text-primary">
                        Link họp đã sẵn sàng
                      </p>
                    ) : event.note ? (
                      <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
                        {event.note}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
