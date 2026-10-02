"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import {
  SYSTEM_SETTINGS_TAB_LABELS,
  SYSTEM_SETTINGS_TABS,
  type SystemSettingsTab,
  parseSystemSettingsTab,
} from "@/dtos/system-settings.dto";
import { DeductionsSettingsPanel } from "./DeductionsSettingsPanel";
import { FixedSalarySettingsPanel } from "./FixedSalarySettingsPanel";

export function SystemSettingsWorkspace() {
  const pathname = usePathname();
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab = parseSystemSettingsTab(rawTab);

  const syncTabToUrl = useCallback(
    (tab: SystemSettingsTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, replace, searchParams],
  );

  useEffect(() => {
    if (rawTab === activeTab) {
      return;
    }

    syncTabToUrl(activeTab);
  }, [activeTab, rawTab, syncTabToUrl]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 pb-8 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        <header className="mb-4">
          <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">
            Cài đặt hệ thống
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Cấu hình dùng chung cho vận hành. Tab đang mở được giữ trong URL để
            chia sẻ và tải lại trang không đổi tab.
          </p>
          <div
            className="mt-4 flex w-full min-w-0 gap-1 overflow-x-auto rounded-full border border-border-default bg-bg-secondary/60 p-1"
            role="tablist"
            aria-label="Cài đặt hệ thống"
          >
            {SYSTEM_SETTINGS_TABS.map((tabId) => {
              const isActive = activeTab === tabId;
              return (
                <button
                  key={tabId}
                  id={`system-settings-tab-${tabId}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`system-settings-panel-${tabId}`}
                  onClick={() => syncTabToUrl(tabId)}
                  className={`min-h-11 min-w-[7.5rem] flex-1 rounded-full px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-10 ${
                    isActive
                      ? "bg-primary text-text-inverse"
                      : "text-text-muted hover:bg-bg-surface hover:text-text-primary"
                  }`}
                >
                  {SYSTEM_SETTINGS_TAB_LABELS[tabId]}
                </button>
              );
            })}
          </div>
        </header>

        {activeTab === "deductions" ? (
          <div
            id="system-settings-panel-deductions"
            role="tabpanel"
            aria-labelledby="system-settings-tab-deductions"
          >
            <DeductionsSettingsPanel />
          </div>
        ) : null}

        {activeTab === "fixed-salary" ? (
          <div
            id="system-settings-panel-fixed-salary"
            role="tabpanel"
            aria-labelledby="system-settings-tab-fixed-salary"
          >
            <FixedSalarySettingsPanel />
          </div>
        ) : null}
      </div>
    </div>
  );
}
