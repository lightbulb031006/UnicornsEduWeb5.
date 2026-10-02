"use client";

import { StaffAccessGate, StaffSidebar } from "@/components/staff";
import SurveyReminderGate from "@/components/staff/SurveyReminderGate";

const STAFF_LAYOUT_BACKGROUND_STYLE = {
  background:
    "radial-gradient(circle at top left, color-mix(in srgb, var(--ue-primary) 14%, transparent) 0, transparent 34%), radial-gradient(circle at bottom right, color-mix(in srgb, var(--ue-warning) 12%, transparent) 0, transparent 28%)",
} as const;

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StaffAccessGate>
      <SurveyReminderGate />
      <div className="min-h-screen bg-bg-primary">
        <a
          href="#staff-main-content"
          className="sr-only fixed left-4 top-4 z-[60] rounded-md bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary shadow-lg focus:not-sr-only focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          Bỏ qua điều hướng
        </a>
        <div
          className="pointer-events-none fixed inset-0 opacity-70"
          aria-hidden
          style={STAFF_LAYOUT_BACKGROUND_STYLE}
        />

        <div className="relative flex min-h-screen">
          <StaffSidebar />
          <main
            id="staff-main-content"
            className="flex min-w-0 flex-1 flex-col overflow-auto px-4 pb-4 pt-16 md:py-4 md:pt-4 lg:px-6 lg:py-6"
          >
            {children}
          </main>
        </div>
      </div>
    </StaffAccessGate>
  );
}
