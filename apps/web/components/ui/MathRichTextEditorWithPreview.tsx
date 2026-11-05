"use client";

import { useState } from "react";
import { Eye, PencilLine } from "lucide-react";
import MathRichTextEditor, {
  type MathRichTextEditorProps,
} from "@/components/ui/MathRichTextEditor";
import MathContent from "@/components/ui/MathContent";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type EditorTab = "edit" | "preview";

/** HTML rỗng của TipTap (`<p></p>`, chỉ khoảng trắng) không có gì để xem. */
function hasVisibleContent(html: string): boolean {
  if (/<(img|table|hr)\b/i.test(html) || /data-type="(inline|block)-math"/.test(html)) {
    return true;
  }
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() !== "";
}

/**
 * MathRichTextEditor + tab "Xem trước" render bằng MathContent — đúng giao diện học sinh thấy.
 * Tab Soạn luôn mounted để giữ undo history / selection của TipTap khi chuyển tab.
 * `markdown`: soạn markdown raw, chỉ tab Xem trước mới render (heading, bảng, …).
 */
export default function MathRichTextEditorWithPreview({
  className,
  markdown = false,
  ...editorProps
}: MathRichTextEditorProps & { className?: string; markdown?: boolean }) {
  const [tab, setTab] = useState<EditorTab>("edit");
  const { value, fill = false, minHeight = "min-h-[180px]" } = editorProps;

  return (
    <Tabs
      value={tab}
      onValueChange={(next) => setTab(next as EditorTab)}
      className={cn(fill && "min-h-0 flex-1", className)}
    >
      <TabsList className="w-full sm:w-fit" aria-label="Chế độ nội dung">
        <TabsTrigger value="edit">
          <PencilLine aria-hidden />
          Soạn thảo
        </TabsTrigger>
        <TabsTrigger value="preview">
          <Eye aria-hidden />
          Xem trước
        </TabsTrigger>
      </TabsList>

      <TabsContent
        value="edit"
        forceMount
        className={cn(fill && "flex min-h-0 flex-1 flex-col", "data-[state=inactive]:hidden")}
      >
        <MathRichTextEditor {...editorProps} />
      </TabsContent>

      <TabsContent
        value="preview"
        className={cn(
          "overflow-y-auto rounded-md border border-border-default bg-bg-surface p-3 sm:p-4",
          fill ? "min-h-0 flex-1" : minHeight,
        )}
      >
        {hasVisibleContent(value) ? (
          <div className="text-sm leading-relaxed text-text-primary sm:text-base">
            <MathContent content={value} markdown={markdown} />
          </div>
        ) : (
          <p className="text-sm italic text-text-muted">Chưa có nội dung để xem trước.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
