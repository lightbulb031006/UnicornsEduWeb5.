"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Mathematics from "@tiptap/extension-mathematics";
import { useEffect, useRef, useState } from "react";
import { Bold, Italic, List, ListOrdered, Sigma, SquareFunction } from "lucide-react";

export type MathRichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  minHeight?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Grow to fill a parent flex column; leftover page height becomes writing space. */
  fill?: boolean;
};

const DEFAULT_MIN_HEIGHT = "min-h-[180px]";
const EMPTY_PARAGRAPH_HTML = "<p></p>";

function isEmptyEditorHtml(html: string): boolean {
  const trimmed = html.trim();
  return trimmed === "" || trimmed === EMPTY_PARAGRAPH_HTML;
}

function isSameEditorHtml(a: string, b: string): boolean {
  if (a === b) return true;
  return isEmptyEditorHtml(a) && isEmptyEditorHtml(b);
}

function toolbarBtnClass(active: boolean, disabled: boolean): string {
  return [
    "inline-flex size-8 items-center justify-center rounded-md text-sm transition-colors",
    disabled
      ? "cursor-not-allowed text-text-muted opacity-50"
      : active
        ? "bg-primary/15 text-primary"
        : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary",
  ].join(" ");
}

function MathEditorToolbar({
  editor,
  disabled,
}: {
  editor: Editor;
  disabled: boolean;
}) {
  const insertInline = () => {
    const latex = window.prompt("Nhập công thức LaTeX (cùng dòng):", "x^2");
    if (!latex?.trim()) return;
    editor.chain().focus().insertInlineMath({ latex: latex.trim() }).run();
  };

  const insertBlock = () => {
    const latex = window.prompt("Nhập công thức LaTeX (khối riêng dòng):", "\\frac{a}{b}");
    if (!latex?.trim()) return;
    editor.chain().focus().insertBlockMath({ latex: latex.trim() }).run();
  };

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border-default px-1.5 py-1"
      role="toolbar"
      aria-label="Định dạng nội dung"
    >
      <button
        type="button"
        disabled={disabled}
        aria-pressed={editor.isActive("bold")}
        aria-label="In đậm"
        className={toolbarBtnClass(editor.isActive("bold"), disabled)}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={editor.isActive("italic")}
        aria-label="In nghiêng"
        className={toolbarBtnClass(editor.isActive("italic"), disabled)}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={editor.isActive("bulletList")}
        aria-label="Danh sách"
        className={toolbarBtnClass(editor.isActive("bulletList"), disabled)}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={editor.isActive("orderedList")}
        aria-label="Danh sách đánh số"
        className={toolbarBtnClass(editor.isActive("orderedList"), disabled)}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-3.5" />
      </button>
      <span className="mx-1 h-4 w-px bg-border-default" aria-hidden />
      <button
        type="button"
        disabled={disabled}
        aria-label="Chèn công thức cùng dòng"
        className={toolbarBtnClass(false, disabled)}
        onClick={insertInline}
      >
        <Sigma className="size-3.5" />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label="Chèn công thức khối"
        className={toolbarBtnClass(false, disabled)}
        onClick={insertBlock}
      >
        <SquareFunction className="size-3.5" />
      </button>
      <span className="ml-1 hidden text-[11px] text-text-muted sm:inline">
        Công thức hiện ngay trong ô soạn.
      </span>
    </div>
  );
}

export default function MathRichTextEditor({
  value,
  onChange,
  minHeight = DEFAULT_MIN_HEIGHT,
  placeholder,
  ariaLabel = "Nội dung soạn thảo",
  disabled = false,
  fill = false,
}: MathRichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  const lastEmittedHtmlRef = useRef(value);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          HTMLAttributes: {
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        },
      }),
      Mathematics,
      ...(placeholder
        ? [
            Placeholder.configure({
              placeholder,
              emptyEditorClass:
                "before:content-[attr(data-placeholder)] before:float-left before:h-0 before:pointer-events-none before:text-text-muted before:opacity-70",
            }),
          ]
        : []),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: `px-3 py-2 text-text-primary [&_a]:text-primary [&_a]:underline [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:font-bold [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:py-1 [&_.katex]:text-text-primary ${fill ? "min-h-full" : minHeight}`,
        "aria-label": ariaLabel,
      },
    },
  });

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!editor) return;
    if (isSameEditorHtml(value, lastEmittedHtmlRef.current)) return;
    lastEmittedHtmlRef.current = value;
    const current = editor.getHTML();
    if (!isSameEditorHtml(value, current)) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      const html = editor.getHTML();
      lastEmittedHtmlRef.current = html;
      onChangeRef.current(html);
    };
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor]);

  const [, setToolbarTick] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const syncToolbar = () => setToolbarTick((n) => n + 1);
    editor.on("selectionUpdate", syncToolbar);
    editor.on("transaction", syncToolbar);
    return () => {
      editor.off("selectionUpdate", syncToolbar);
      editor.off("transaction", syncToolbar);
    };
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={`overflow-hidden rounded-md border border-border-default transition-colors ${
        disabled
          ? "bg-bg-secondary/60 text-text-secondary cursor-not-allowed opacity-75"
          : "bg-bg-surface focus-within:border-border-focus focus-within:ring-2 focus-within:ring-border-focus"
      } [&_.ProseMirror]:outline-none ${
        fill
          ? `flex min-h-0 flex-1 flex-col ${minHeight}`
          : minHeight
      }`}
    >
      <MathEditorToolbar editor={editor} disabled={disabled} />
      {fill ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  );
}
