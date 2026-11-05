"use client";

import { usePathname } from "next/navigation";
import { StudentAccessGate, StudentHeader } from "@/components/student";
import { isAttemptRoute } from "@/lib/student-focus-route";
import { cn } from "@/lib/utils";

const STUDENT_LAYOUT_BACKGROUND_STYLE = {
  background:
    "radial-gradient(circle at top left, color-mix(in srgb, var(--ue-primary) 14%, transparent) 0, transparent 34%), radial-gradient(circle at bottom right, color-mix(in srgb, var(--ue-info) 12%, transparent) 0, transparent 28%)",
} as const;

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Trang lượt làm: ẩn navbar để học sinh tập trung, nội dung lên sát mép trên.
  const focus = isAttemptRoute(usePathname());

  return (
    <StudentAccessGate>
      <div className="flex h-screen min-h-0 flex-col bg-bg-primary supports-[height:100dvh]:h-dvh">
        {focus ? null : (
          <a
            href="#student-main-content"
            className="sr-only fixed left-4 top-4 z-[60] rounded-md bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary shadow-lg focus:not-sr-only focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Bỏ qua điều hướng
          </a>
        )}
        <div
          className="pointer-events-none fixed inset-0 opacity-80"
          aria-hidden
          style={STUDENT_LAYOUT_BACKGROUND_STYLE}
        />
        {focus ? null : <StudentHeader />}
        {/* Navbar fixed nằm đè lên <main>: pt = chiều cao navbar + 1rem khoảng cách nội dung,
            scroll-pt = chiều cao navbar để scrollIntoView không đưa mục xuống dưới navbar.
            Sticky dừng ở padding-top + top, nên phần tử muốn bám sát dưới navbar dùng `-top-4`.
            Không navbar (trang lượt làm) → chỉ còn khoảng cách nội dung. */}
        <main
          id="student-main-content"
          className={cn(
            "relative min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-6 sm:px-6 sm:pb-8 lg:px-8",
            focus
              ? "pt-4 sm:pt-6"
              : "scroll-pt-[4.25rem] pt-[5.25rem] sm:scroll-pt-20 sm:pt-24",
          )}
        >
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </StudentAccessGate>
  );
}

