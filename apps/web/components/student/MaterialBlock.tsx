"use client";

import type { ReactNode } from "react";
import type { MaterialHeader } from "@/lib/exam-layout";
import AttemptAudio from "./AttemptAudio";
import SharedMaterialPanel from "./SharedMaterialPanel";

/**
 * Khối Bộ câu hỏi trên trang làm bài: phần đầu bộ + mọi câu của bộ bọc chung
 * một phần tử, nên trình phát audio của bộ dính mép trên (`stickyTop`) suốt
 * lúc cuộn trong khối và thả ra khi qua khối. Trình phát nằm ngoài phần thu gọn
 * để vẫn nghe được khi đã thu gọn tư liệu; không remount khi dính / thả nên
 * lượt nghe và trạng thái phát giữ nguyên.
 */
export default function MaterialBlock({
  header,
  gapNumbers,
  stickyTop,
  className,
  children,
}: {
  header: MaterialHeader;
  gapNumbers?: ReadonlyMap<string, number>;
  /** Giá trị CSS `top` khi dính (dưới các thanh sticky khác của trang). */
  stickyTop: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      {header.audio ? (
        <div
          className="sticky z-10 rounded-xl bg-bg-surface shadow-sm"
          style={{ top: stickyTop }}
        >
          <AttemptAudio audio={header.audio} label="Audio của bộ" />
        </div>
      ) : null}
      <SharedMaterialPanel
        header={header}
        gapNumbers={gapNumbers}
        showAudio={false}
      />
      {children}
    </div>
  );
}
