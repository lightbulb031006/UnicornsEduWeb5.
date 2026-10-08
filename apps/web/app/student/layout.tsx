"use client";

import { StudentAccessGate, StudentHeader } from "@/components/student";

const STUDENT_LAYOUT_BACKGROUND_STYLE = {
  background:
    "radial-gradient(circle at top left, color-mix(in srgb, var(--ue-primary) 14%, transparent) 0, transparent 34%), radial-gradient(circle at bottom right, color-mix(in srgb, var(--ue-info) 12%, transparent) 0, transparent 28%)",
} as const;

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StudentAccessGate>
      <div className="flex h-screen min-h-0 flex-col bg-bg-primary supports-[height:100dvh]:h-dvh">
        <a
          href="#student-main-content"
          className="sr-only fixed left-4 top-4 z-[60] rounded-md bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary shadow-lg focus:not-sr-only focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          Bỏ qua điều hướng
        </a>
        <div
          className="pointer-events-none fixed inset-0 opacity-80"
          aria-hidden
          style={STUDENT_LAYOUT_BACKGROUND_STYLE}
        />
        <StudentHeader />
        {/* Navbar fixed nằm đè lên <main>: pt = chiều cao navbar + 1rem khoảng cách nội dung,
            scroll-pt = chiều cao navbar để scrollIntoView không đưa mục xuống dưới navbar.
            Sticky dừng ở padding-top + top, nên phần tử muốn bám sát dưới navbar dùng `-top-4`. */}
        <main
          id="student-main-content"
          className="relative min-h-0 min-w-0 flex-1 scroll-pt-[4.25rem] overflow-y-auto px-4 pb-6 pt-[5.25rem] sm:scroll-pt-20 sm:px-6 sm:pb-8 sm:pt-24 lg:px-8"
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </StudentAccessGate>
  );
}

