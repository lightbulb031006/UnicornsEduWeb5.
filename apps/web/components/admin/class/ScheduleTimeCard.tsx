import {
  CLASS_SCHEDULE_DAY_LABELS,
  normalizeDayOfWeek,
  normalizeTimeOnly,
} from "@/lib/class.helpers";

type Props = {
  from?: string | null;
  to?: string | null;
  index: number;
  dayOfWeek?: number;
  teacherName?: string | null;
};

export default function ScheduleTimeCard({
  from,
  to,
  index,
  dayOfWeek,
  teacherName,
}: Props) {
  const startTime = normalizeTimeOnly(from);
  const endTime = normalizeTimeOnly(to);
  const slotLabel = String(index).padStart(2, "0");
  const compactStartTime = startTime ? startTime.slice(0, 5) : "--:--";
  const compactEndTime = endTime ? endTime.slice(0, 5) : "--:--";
  const normalizedDayOfWeek =
    dayOfWeek === undefined ? undefined : normalizeDayOfWeek(dayOfWeek);
  const dayLabel =
    normalizedDayOfWeek === undefined
      ? undefined
      : CLASS_SCHEDULE_DAY_LABELS[normalizedDayOfWeek];

  return (
    <>
      <div className="flex items-center gap-2.5 rounded-lg border border-border-default bg-bg-secondary/70 px-2.5 py-2 sm:hidden">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border-default bg-bg-surface text-[10px] font-semibold tabular-nums text-text-secondary">
          {slotLabel}
        </div>
        {dayLabel && (
          <span className="shrink-0 text-xs font-medium text-primary">
            {dayLabel}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">
            Khung giờ học
          </p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="font-mono text-xs font-semibold tabular-nums text-text-primary">
              {compactStartTime}
            </span>
            <span className="text-text-muted" aria-hidden>
              →
            </span>
            <span className="font-mono text-xs font-semibold tabular-nums text-text-primary">
              {compactEndTime}
            </span>
          </div>
          <p className="mt-0.5 break-words text-[11px] text-text-secondary">
            {teacherName?.trim() || "Chưa phân công gia sư"}
          </p>
        </div>
      </div>

      <div className="hidden rounded-lg border border-border-default bg-bg-secondary/60 px-3 py-2 sm:block">
        <div className="flex flex-wrap items-start justify-between gap-2 gap-y-1">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border-default bg-bg-surface text-[10px] font-semibold tabular-nums text-text-secondary">
              {slotLabel}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium leading-tight text-text-primary">
                {dayLabel ? `Khung giờ ${dayLabel}` : `Khung giờ ${slotLabel}`}
              </p>
              <p className="mt-0.5 break-words text-[11px] text-text-secondary">
                {teacherName?.trim() || "Chưa phân công gia sư"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 font-mono text-xs tabular-nums text-text-primary">
            <span>{compactStartTime}</span>
            <span className="text-text-muted" aria-hidden>
              →
            </span>
            <span>{compactEndTime}</span>
          </div>
        </div>
      </div>
    </>
  );
}
