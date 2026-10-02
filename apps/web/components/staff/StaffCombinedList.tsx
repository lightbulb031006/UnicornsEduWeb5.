"use client";

import { useMemo, useState } from "react";
import type { SessionItem } from "@/dtos/session.dto";
import type { ClassSurveyRecord } from "@/dtos/class-survey.dto";
import { Card } from "@/components/ui/card";
import { formatVnDate } from "@/lib/formatters";

type CombinedItem =
  | { type: "session"; date: Date; data: SessionItem }
  | { type: "survey"; date: Date; data: ClassSurveyRecord };

function formatDate(date: Date): string {
  return formatVnDate(new Date(date));
}

export default function StaffCombinedList({
  sessions,
  surveys,
  onSessionClick,
  onSurveyClick,
  onCreateSession,
  onCreateSurvey,
}: {
  sessions: SessionItem[];
  surveys: ClassSurveyRecord[];
  onSessionClick: (session: SessionItem) => void;
  onSurveyClick: (survey: ClassSurveyRecord) => void;
  onCreateSession: () => void;
  onCreateSurvey: () => void;
}) {
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  const combined = useMemo(() => {
    const items: CombinedItem[] = [
      ...sessions.map((s) => ({ type: "session" as const, date: new Date(s.date), data: s })),
      ...surveys.map((s) => ({ type: "survey" as const, date: new Date(s.reportDate), data: s })),
    ];
    return items.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [sessions, surveys]);

  return (
    <div className="space-y-4">
      {/* Create button */}
      <div className="flex justify-end">
        <div className="relative">
          <button
            onClick={() => setCreateMenuOpen(!createMenuOpen)}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Tạo mới
          </button>
          {createMenuOpen && (
            <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-border-default bg-bg-surface shadow-lg">
              <button
                onClick={() => {
                  onCreateSession();
                  setCreateMenuOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-bg-secondary"
              >
                Tạo buổi học
              </button>
              <button
                onClick={() => {
                  onCreateSurvey();
                  setCreateMenuOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-bg-secondary"
              >
                Tạo khảo sát
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Combined list */}
      <div className="space-y-2">
        {combined.map((item) => (
          <Card
            key={`${item.type}-${item.data.id}`}
            className="cursor-pointer transition-colors hover:bg-bg-secondary"
            onClick={() =>
              item.type === "session"
                ? onSessionClick(item.data)
                : onSurveyClick(item.data)
            }
          >
            <div className="flex items-center gap-3 p-4">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  item.type === "session"
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {item.type === "session" ? "Buổi học" : "Khảo sát"}
              </span>
              <div className="flex-1">
                <div className="font-medium text-text-primary">
                  {formatDate(item.date)}
                </div>
                <div className="text-sm text-text-muted truncate">
                  {item.type === "session"
                    ? item.data.lessonContent?.slice(0, 60) || "Buổi học"
                    : item.data.survey?.name || "Khảo sát"}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
