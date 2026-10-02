"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export const STUDENT_DETAIL_BASIC_INFO_OPEN_KEY =
  "ue-student-detail-basic-info-open";
export const STUDENT_DETAIL_PARENT_CONTACT_OPEN_KEY =
  "ue-student-detail-parent-contact-open";

function subscribeNoop() {
  return () => {};
}

function readStoredOpen(storageKey: string, defaultOpen: boolean): boolean {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === "1") return true;
    if (raw === "0") return false;
    return defaultOpen;
  } catch {
    return defaultOpen;
  }
}

function usePersistedOpen(storageKey: string, defaultOpen: boolean) {
  const storedOpen = useSyncExternalStore(
    subscribeNoop,
    () => readStoredOpen(storageKey, defaultOpen),
    () => defaultOpen,
  );
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? storedOpen;

  const setOpen = (next: boolean) => {
    try {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      // Preference only — ignore quota / private-mode failures.
    }
    setOverride(next);
  };

  return [open, setOpen] as const;
}

function headingId(title: string) {
  return `student-card-${title.replace(/\s+/g, "-")}`;
}

function StaticStudentInfoCard({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className: string;
}) {
  const id = headingId(title);
  return (
    <section
      className={`min-w-0 rounded-[1.4rem] border border-border-default bg-bg-surface p-3.5 shadow-sm sm:rounded-2xl sm:p-5 ${className}`}
      aria-labelledby={id}
    >
      <h2
        id={id}
        className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted sm:mb-4 sm:text-xs"
      >
        {title}
      </h2>
      <div className="min-w-0 text-sm text-text-primary">{children}</div>
    </section>
  );
}

function CollapsibleStudentInfoCard({
  title,
  children,
  className,
  storageKey,
  defaultOpen,
}: {
  title: string;
  children: ReactNode;
  className: string;
  storageKey: string;
  defaultOpen: boolean;
}) {
  const id = headingId(title);
  const [open, setOpen] = usePersistedOpen(storageKey, defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <section
        className={`min-w-0 rounded-[1.4rem] border border-border-default bg-bg-surface p-3.5 shadow-sm sm:rounded-2xl sm:p-5 ${className}`}
        aria-labelledby={id}
      >
        <h2 id={id} className="m-0">
          <CollapsibleTrigger
            type="button"
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl text-left text-[11px] font-semibold uppercase tracking-[0.24em] text-text-muted transition-colors hover:text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:min-h-10 sm:text-xs"
          >
            <span>{title}</span>
            <ChevronDown
              className={`size-4 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent>
          <div className="mt-3 min-w-0 text-sm text-text-primary sm:mt-4">
            {children}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

export default function StudentInfoCard({
  title,
  children,
  className = "",
  collapsible = false,
  storageKey,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  collapsible?: boolean;
  storageKey?: string;
  defaultOpen?: boolean;
}) {
  if (collapsible && storageKey) {
    return (
      <CollapsibleStudentInfoCard
        title={title}
        className={className}
        storageKey={storageKey}
        defaultOpen={defaultOpen}
      >
        {children}
      </CollapsibleStudentInfoCard>
    );
  }

  return (
    <StaticStudentInfoCard title={title} className={className}>
      {children}
    </StaticStudentInfoCard>
  );
}
