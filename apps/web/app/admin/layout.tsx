'use client';

import AdminAccessGate from "@/components/admin/AdminAccessGate";
import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminAccessGate>
      <div className="flex min-h-screen bg-bg-primary">
        <a
          href="#admin-main-content"
          className="sr-only fixed left-4 top-4 z-[60] rounded-md bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary shadow-lg focus:not-sr-only focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          Bỏ qua điều hướng
        </a>
        <AdminSidebar />
        <main
          id="admin-main-content"
          className="flex min-w-0 flex-1 flex-col overflow-auto pt-16 md:pt-0"
        >
          {children}
        </main>
      </div>
    </AdminAccessGate>
  );
}
